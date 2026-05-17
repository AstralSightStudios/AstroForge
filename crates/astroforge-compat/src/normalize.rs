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
    for marker in ["aiot.__ce__", "aiot.__cc__", "aiot.__ci__", "aiot.__cf__"] {
        let mut start = 0;
        while let Some(pos) = normalized[start..].find(marker) {
            calls.push(RuntimeCall {
                offset: start + pos,
                callee: marker.trim_start_matches("aiot.").to_owned(),
            });
            start += pos + marker.len();
        }
    }
    calls.sort_by_key(|call| call.offset);
    calls
}

/// 提取页面模块中的系统桥接 require。
///
/// aiot-toolkit 与 AstroForge 都会把 `@system.*` 归一为
/// `$app_require$("@app-module/system.*")` 形态；记录这个序列可以覆盖
/// “模板事件里用了 bridge，但页面模块没有 require”的回归。
pub fn app_module_require_sequence(source: &str) -> Vec<String> {
    let normalized = normalize_js(source);
    let marker = "@app-module/";
    let mut modules = Vec::new();
    let mut start = 0;
    while let Some(pos) = normalized[start..].find(marker) {
        let module_start = start + pos + marker.len();
        let Some(module_end) = normalized[module_start..]
            .find(['"', '\''])
            .map(|end| module_start + end)
        else {
            break;
        };
        modules.push(normalized[module_start..module_end].to_owned());
        start = module_end + 1;
    }
    modules
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
    let Some(workspace) = workspace_root_prefix() else {
        return source.to_owned();
    };
    source.replace(&workspace, "<workspace>/")
}

/// 工作区根目录，末尾带分隔符，便于按前缀整段替换。
///
/// 通过 `CARGO_MANIFEST_DIR`（即 `crates/astroforge-compat`）回溯两级取到根
/// 目录；任何 checkout / CI 路径都能自适应。
fn workspace_root_prefix() -> Option<String> {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.parent()?.parent()?;
    let mut prefix = root.to_string_lossy().into_owned();
    if !prefix.ends_with('/') {
        prefix.push('/');
    }
    Some(prefix)
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

    #[test]
    fn app_module_require_sequence_extracts_bridge_modules() {
        let modules = app_module_require_sequence(
            r#"var prompt = $app_require$("@app-module/system.prompt");
               var router = $app_require$1('@app-module/system.router');"#,
        );
        assert_eq!(modules, vec!["system.prompt", "system.router"]);
    }
}
