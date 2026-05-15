//! IR / JSON 文档级 diff 工具。
//!
//! 接受任意可序列化为 [`serde_json::Value`] 的两份值，递归遍历并输出路径化
//! 的差异列表。这是后续分级对照的共享底层：
//!
//! - **Level 2 manifest diff**：直接 diff 两份 `Manifest`。
//! - **Level 4 AST diff**：先把 JS 文本 parse 为规范化的语法树（serde JSON 形
//!   态）再 diff。
//! - **Level 5 runtime call diff**：把 `aiot.__ce__` / `__cc__` 调用序列归一
//!   化为列表，再 diff。
//!
//! 设计取舍：
//! - 路径形态采用简化的 JSON Pointer（`/pages/pages~1index/template/0/value`），
//!   `~1` 转义 `/`、`~0` 转义 `~`，与 RFC 6901 一致；
//! - 数组按下标对齐，不做"最长公共子序列"匹配。IR 顺序敏感（厂商产物的字段
//!   顺序稳定），按位对齐才能定位真实变更，启发式匹配会掩盖错位。
//! - 对象按键对齐；`IndexMap` 序列化为 JSON Object 后语义等价，遍历不依赖
//!   原始插入顺序，仅在 [`DiffKind::TypeMismatch`] / [`DiffKind::Value`] 中
//!   呈现差异。

use std::fmt;

use serde::Serialize;
use serde_json::Value;

/// 单个差异条目。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diff {
    /// JSON Pointer 形式的路径，根为 `""`。
    pub path: String,

    pub kind: DiffKind,
}

/// 差异分类。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffKind {
    /// 左侧缺失（右侧存在）。
    Missing { right: Value },

    /// 右侧缺失（左侧存在）。
    Extra { left: Value },

    /// 同路径下 JSON 类型不同（如 string vs object）。
    TypeMismatch { left: Value, right: Value },

    /// 同路径下值不同（同类型基本量）。
    Value { left: Value, right: Value },

    /// 数组长度不同。先发出此条目，再对公共下标继续递归。
    ArrayLength { left: usize, right: usize },
}

impl fmt::Display for Diff {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let path = if self.path.is_empty() {
            "/"
        } else {
            &self.path
        };
        match &self.kind {
            DiffKind::Missing { right } => write!(f, "{path}: 缺失，期望 {right}"),
            DiffKind::Extra { left } => write!(f, "{path}: 多余 {left}"),
            DiffKind::TypeMismatch { left, right } => write!(
                f,
                "{path}: 类型不一致 left={} right={}",
                json_type(left),
                json_type(right),
            ),
            DiffKind::Value { left, right } => {
                write!(f, "{path}: {left} != {right}")
            }
            DiffKind::ArrayLength { left, right } => {
                write!(f, "{path}: 数组长度 {left} != {right}")
            }
        }
    }
}

/// diff 一对可序列化值。
///
/// 同样序列化错误处理：若任一侧无法转 JSON，返回携带原始错误的 `Err`，调用
/// 方可据此中断对照流程（IR diff 若失败说明数据本身已损坏，没有 fallback 价值）。
pub fn diff<L: Serialize, R: Serialize>(
    left: &L,
    right: &R,
) -> Result<Vec<Diff>, serde_json::Error> {
    let l = serde_json::to_value(left)?;
    let r = serde_json::to_value(right)?;
    let mut out = Vec::new();
    diff_value("", &l, &r, &mut out);
    Ok(out)
}

/// 在已有 [`Value`] 上 diff。比 [`diff`] 跳过一次序列化，适合上游已持有
/// `Value` 的场景（如规范化阶段产出）。
pub fn diff_values(left: &Value, right: &Value) -> Vec<Diff> {
    let mut out = Vec::new();
    diff_value("", left, right, &mut out);
    out
}

fn diff_value(path: &str, left: &Value, right: &Value, out: &mut Vec<Diff>) {
    match (left, right) {
        (Value::Object(a), Value::Object(b)) => diff_object(path, a, b, out),
        (Value::Array(a), Value::Array(b)) => diff_array(path, a, b, out),
        (l, r) if json_type(l) != json_type(r) => out.push(Diff {
            path: path.to_owned(),
            kind: DiffKind::TypeMismatch {
                left: l.clone(),
                right: r.clone(),
            },
        }),
        (l, r) if l != r => out.push(Diff {
            path: path.to_owned(),
            kind: DiffKind::Value {
                left: l.clone(),
                right: r.clone(),
            },
        }),
        _ => {}
    }
}

fn diff_object(
    path: &str,
    left: &serde_json::Map<String, Value>,
    right: &serde_json::Map<String, Value>,
    out: &mut Vec<Diff>,
) {
    // 左有右无 / 同键继续递归：单趟遍历左侧即可。
    for (key, lv) in left {
        let child = join_pointer(path, key);
        match right.get(key) {
            Some(rv) => diff_value(&child, lv, rv, out),
            None => out.push(Diff {
                path: child,
                kind: DiffKind::Extra { left: lv.clone() },
            }),
        }
    }
    // 右独有键。
    for (key, rv) in right {
        if !left.contains_key(key) {
            out.push(Diff {
                path: join_pointer(path, key),
                kind: DiffKind::Missing { right: rv.clone() },
            });
        }
    }
}

fn diff_array(path: &str, left: &[Value], right: &[Value], out: &mut Vec<Diff>) {
    if left.len() != right.len() {
        out.push(Diff {
            path: path.to_owned(),
            kind: DiffKind::ArrayLength {
                left: left.len(),
                right: right.len(),
            },
        });
    }
    let common = left.len().min(right.len());
    for i in 0..common {
        let child = join_pointer(path, &i.to_string());
        diff_value(&child, &left[i], &right[i], out);
    }
    // 超出部分单独记录为 Extra / Missing，保证调用方拿到完整变更面。
    for (i, v) in left.iter().enumerate().skip(common) {
        out.push(Diff {
            path: join_pointer(path, &i.to_string()),
            kind: DiffKind::Extra { left: v.clone() },
        });
    }
    for (i, v) in right.iter().enumerate().skip(common) {
        out.push(Diff {
            path: join_pointer(path, &i.to_string()),
            kind: DiffKind::Missing { right: v.clone() },
        });
    }
}

/// 按 RFC 6901 拼接 JSON Pointer。
fn join_pointer(prefix: &str, segment: &str) -> String {
    let mut escaped = String::with_capacity(segment.len());
    for ch in segment.chars() {
        match ch {
            '~' => escaped.push_str("~0"),
            '/' => escaped.push_str("~1"),
            other => escaped.push(other),
        }
    }
    format!("{prefix}/{escaped}")
}

fn json_type(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
