//! AstroForge 前端编译器。
//!
//! 职责：消费 `@astroforge/rsbuild-plugin` 写到磁盘的中间产物（TSX 经 Rsbuild
//! 处理后的 JS、提取的 props/data/lifecycle 元数据、样式 AST、资源清单），将
//! 其归一化为 [`astroforge_ir::page::IrDocument`]，供下游 Vela 后端消费。
//!
//! 编译器本身不解析 TSX 语法树——TSX 由 Rsbuild/SWC 负责处理。本 crate 只承
//! 担"前端 JS 世界"与"后端 Rust 世界"之间的胶水。

use astroforge_ir::page::IrDocument;

/// 编译器入口。当前为占位实现，Phase 2 起逐步完善。
pub fn load_ir_from_disk(_path: &camino::Utf8Path) -> anyhow::Result<IrDocument> {
    anyhow::bail!("astroforge-compiler: 尚未实现")
}
