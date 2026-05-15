//! AstroForge Vela 后端。
//!
//! 工作流：
//! 1. 输入 [`astroforge_ir::page::IrDocument`]。
//! 2. 经由 [`lower`] 将 Page IR 下沉为
//!    [`astroforge_ir::runtime::RuntimeModule`] 集合。
//! 3. 经由 [`emit`] 将 Runtime IR 打印为 Vela 兼容 JS 文本，包含
//!    `app.js`、`pages/<name>/<name>.js` 与 `manifest.json`。
//!
//! 本 crate 不涉及 rpk 打包与签名（属 `astroforge-packager` 范畴），亦不
//! 涉及设备传输（属 `astroforge-device` 范畴）。

pub mod emit;
pub mod lower;

/// 后端入口。当前为占位，待 Phase 3 实现。
pub fn build(_ir: astroforge_ir::page::IrDocument) -> anyhow::Result<VelaBuildOutput> {
    anyhow::bail!("astroforge-vela: 尚未实现")
}

/// 后端单次构建的输出物。`packager` 据此组装 rpk。
#[derive(Debug, Default)]
pub struct VelaBuildOutput {
    /// 应用入口模块文本，对应产物 `app.js`。
    pub app_js: String,

    /// 各页面模块文本，键为路由（如 `"pages/index"`），值为对应 JS 文本。
    pub page_js: indexmap::IndexMap<String, String>,

    /// 序列化后的 manifest 文本，对应产物 `manifest.json`。
    pub manifest_json: String,
}
