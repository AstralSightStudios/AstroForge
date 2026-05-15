//! 将 IR JSON Schema 写出到 docs/。
//!
//! 跑法：`cargo run -p astroforge-ir --example dump-ir-schema`
//!
//! 输出两份文件：
//! - `docs/ir-document.schema.json`：IrDocument（跨进程契约，TS 端最常消费）；
//! - `docs/runtime-module.schema.json`：RuntimeModule（后端内部形态，对照
//!   工具与 IR 工具消费）。
//!
//! 每当 IR 结构调整，应同步重跑本 example。CI 中以 `git diff --exit-code`
//! 监控变更，防止 schema 与代码漂移。

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // workspace 根从 CARGO_MANIFEST_DIR 反推：本 crate 位于 crates/astroforge-ir。
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .ok_or("无法从 CARGO_MANIFEST_DIR 定位 workspace 根目录")?;
    let docs_dir = workspace_root.join("docs");

    let outputs = [
        (
            docs_dir.join("ir-document.schema.json"),
            astroforge_ir::schema::ir_document_schema_pretty(),
        ),
        (
            docs_dir.join("runtime-module.schema.json"),
            astroforge_ir::schema::runtime_module_schema_pretty(),
        ),
    ];

    for (path, mut content) in outputs {
        content.push('\n');
        std::fs::write(&path, content)?;
        println!("written: {}", path.display());
    }

    Ok(())
}
