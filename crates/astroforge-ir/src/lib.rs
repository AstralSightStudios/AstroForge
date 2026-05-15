//! AstroForge 三层中间表示（IR）。
//!
//! 编译流程将 React/TSX 源码经由以下三层 IR 逐级下沉为厂商运行时可装载的产物：
//!
//! 1. [`component`] —— 组件树 IR。Rsbuild 前端编译器在 TSX 解析后产出，保留
//!    JSX 语义，不感知具体运行时。
//! 2. [`page`] —— 页面 IR。包含数据、方法、生命周期、props（组件）、样式表
//!    与资源引用，是后端的稳定输入。
//! 3. [`runtime`] —— 运行时 IR。每个节点直接对应一次 Vela 运行时调用，是
//!    AstroForge 与 Vela JS 运行时之间的兼容契约。详见
//!    `docs/vela-runtime-abi.md`。
//!
//! 本 crate 仅定义类型与序列化协议，不执行 I/O，亦不依赖异步运行时或日志
//! 框架，便于在前端进程、后端进程以及测试工具中复用。

pub mod component;
pub mod io;
pub mod page;
pub mod runtime;
pub mod schema;

/// IR 线格式版本号。字段形状任何破坏性变更必须递增。
///
/// 该版本号写入每个序列化 IR 根节点，使下游工具在遇到不兼容产物时立即报错，
/// 而非按当前定义错误解释旧数据。
pub const IR_VERSION: u32 = 1;

/// IR 校验阶段抛出的错误。
#[derive(Debug, thiserror::Error)]
pub enum IrError {
    #[error("IR 版本不匹配：期望 {expected}，实际 {got}")]
    Version { expected: u32, got: u32 },

    #[error("路由项非法：{0}")]
    InvalidRoute(String),

    #[error("未知元素标签：{0}")]
    UnknownTag(String),
}
