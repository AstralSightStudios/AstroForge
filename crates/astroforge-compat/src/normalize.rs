//! 兼容性对照的文本级规范化工具。
//!
//! 规范化目标不是压缩 JS，而是移除对 ABI 无意义的构建噪声：sourcemap 注释、
//! 绝对路径、时间戳和连续空白。AST diff 与运行时调用序列提取可在此基础上
//! 继续叠加更强的解析器。

use serde::{Deserialize, Serialize};

/// 规范化 JS 文本。
pub fn normalize_js(source: &str) -> String {
    let without_sourcemap = source
        .lines()
        .filter(|line| !line.trim_start().starts_with("//# sourceMappingURL="))
        .collect::<Vec<_>>()
        .join("\n");
    normalize_whitespace(&strip_absolute_paths(&without_sourcemap))
}

/// 规范化 JSON 文本。
pub fn normalize_json(source: &str) -> serde_json::Result<serde_json::Value> {
    serde_json::from_str(source)
}

/// 提取运行时创建调用序列。
///
/// 当前实现记录 `aiot.__ce__`、`aiot.__cc__`、`aiot.__ci__`、`aiot.__cf__` 的
/// 出现顺序；后续 AST parser 接入后可扩展为携带 tag、opts key 与事件名的
/// 结构化序列。
pub fn runtime_call_sequence(source: &str) -> Vec<RuntimeCall> {
    let mut calls = Vec::new();
    let normalized = normalize_js(source);
    let mut offset = 0;
    for marker in ["aiot.__ce__", "aiot.__cc__", "aiot.__ci__", "aiot.__cf__"] {
        let mut start = 0;
        while let Some(pos) = normalized[start..].find(marker) {
            calls.push(RuntimeCall {
                offset: start + pos,
                callee: marker.trim_start_matches("aiot.").to_owned(),
            });
            start += pos + marker.len();
        }
        offset += marker.len();
    }
    let _ = offset;
    calls.sort_by_key(|call| call.offset);
    calls
}

/// 运行时调用序列项。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeCall {
    pub offset: usize,
    pub callee: String,
}

fn normalize_whitespace(source: &str) -> String {
    let mut out = String::with_capacity(source.len());
    let mut last_was_space = false;
    for ch in source.chars() {
        if ch.is_whitespace() {
            if !last_was_space {
                out.push(' ');
                last_was_space = true;
            }
        } else {
            out.push(ch);
            last_was_space = false;
        }
    }
    out.trim().to_owned()
}

fn strip_absolute_paths(source: &str) -> String {
    source.replace("/Volumes/EXT0/GitHub/AstroForge/", "<workspace>/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_js_removes_sourcemap_and_collapses_space() {
        let source = "a   \n b\n//# sourceMappingURL=file.map";
        assert_eq!(normalize_js(source), "a b");
    }

    #[test]
    fn runtime_call_sequence_preserves_order() {
        let calls = runtime_call_sequence("aiot.__cc__('x'); aiot.__ce__('text');");
        assert_eq!(
            calls
                .iter()
                .map(|call| call.callee.as_str())
                .collect::<Vec<_>>(),
            vec!["__cc__", "__ce__"]
        );
    }
}
