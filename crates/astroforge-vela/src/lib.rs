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

/// 执行 Vela 后端构建，生成打包器可消费的文件集合。
pub fn build(ir: astroforge_ir::page::IrDocument) -> anyhow::Result<VelaBuildOutput> {
    let lowered = lower::lower_document(&ir)?;
    emit::emit_build_output(&ir, lowered)
}

/// 后端单次构建的输出物。`packager` 据此组装 rpk。
#[derive(Debug, Default)]
pub struct VelaBuildOutput {
    /// 应用入口模块文本，对应产物 `app.js`。
    pub app_js: String,

    /// 各页面模块文本，键为包内相对路径（如 `"pages/index/index.js"`），值为对应 JS 文本。
    pub page_js: indexmap::IndexMap<String, String>,

    /// 序列化后的 manifest 文本，对应产物 `manifest.json`。
    pub manifest_json: String,

    /// 设备级 manifest 变体。键为设备名（如 `"watch"`、`"tv"`），值为
    /// `manifest-<device>.json` 的完整文本，已应用 `config-<device>.json`
    /// 覆盖。仅在 `Manifest::device_type_list` 非空时生成。
    pub device_manifests: indexmap::IndexMap<String, String>,

    /// 包名，供打包器生成默认文件名与诊断信息。
    pub package: String,

    /// 静态资源清单。packager 负责将其拷贝到包内同名路径。
    pub assets: Vec<astroforge_ir::page::AssetRef>,
}
