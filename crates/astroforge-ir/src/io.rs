//! IR JSON 文件 I/O 与版本校验。
//!
//! 所有跨进程传递 IR 的入口都应过 [`load_ir_from_path`]——它在反序列化后立
//! 即校验 `ir_version` 字段，避免上游 / 下游版本错位时静默按当前 schema 误
//! 解释旧产物。
//!
//! 写出方提供两个变体：[`save_ir_to_path`] 紧凑形态（机器消费），
//! [`save_ir_pretty`] 带缩进（人工 review / docs / snapshot 输入）。

use std::fs;
use std::io;

use camino::Utf8Path;

use crate::{IR_VERSION, IrError, page::IrDocument};

/// I/O 阶段可能抛出的错误。
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    #[error("读取文件失败 {path}: {source}")]
    Read {
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("写入文件失败 {path}: {source}")]
    Write {
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("解析 IR JSON 失败 {path}: {source}")]
    Parse {
        path: String,
        #[source]
        source: serde_json::Error,
    },

    #[error("序列化 IR JSON 失败: {0}")]
    Serialize(#[from] serde_json::Error),

    #[error(transparent)]
    Ir(#[from] IrError),
}

/// 从磁盘加载 IR 文档并校验版本号。
///
/// 校验逻辑：JSON 解析后立即比对 `ir_version` 字段与 [`IR_VERSION`] 常量。
/// 不匹配时返回 [`IrError::Version`]，调用方据此决定是回滚到对应版本的工具
/// 还是中断流程；本函数刻意不做"前向兼容尝试"以避免误读。
pub fn load_ir_from_path(path: &Utf8Path) -> Result<IrDocument, IoError> {
    let raw = fs::read_to_string(path.as_std_path()).map_err(|e| IoError::Read {
        path: path.to_string(),
        source: e,
    })?;
    let doc: IrDocument = serde_json::from_str(&raw).map_err(|e| IoError::Parse {
        path: path.to_string(),
        source: e,
    })?;
    if doc.ir_version != IR_VERSION {
        return Err(IoError::Ir(IrError::Version {
            expected: IR_VERSION,
            got: doc.ir_version,
        }));
    }
    Ok(doc)
}

/// 紧凑形态写出，无多余空白，适合机器消费 / 构建缓存。
pub fn save_ir_to_path(path: &Utf8Path, doc: &IrDocument) -> Result<(), IoError> {
    let s = serde_json::to_string(doc)?;
    write_string(path, &s)
}

/// 带缩进写出，便于人工审阅与 git diff。
///
/// 末尾追加换行符以符合 POSIX 文件约定，避免在编辑器中显示 `No newline at end of file`。
pub fn save_ir_pretty(path: &Utf8Path, doc: &IrDocument) -> Result<(), IoError> {
    let mut s = serde_json::to_string_pretty(doc)?;
    s.push('\n');
    write_string(path, &s)
}

fn write_string(path: &Utf8Path, s: &str) -> Result<(), IoError> {
    if let Some(parent) = path.parent()
        && !parent.as_str().is_empty()
    {
        fs::create_dir_all(parent.as_std_path()).map_err(|e| IoError::Write {
            path: parent.to_string(),
            source: e,
        })?;
    }
    fs::write(path.as_std_path(), s).map_err(|e| IoError::Write {
        path: path.to_string(),
        source: e,
    })
}
