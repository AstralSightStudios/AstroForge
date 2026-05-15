//! AstroForge rpk 打包器。
//!
//! 职责：将 [`astroforge_vela::VelaBuildOutput`] 与资源清单组装为符合
//! `docs/vela-runtime-abi.md` §9 描述的 rpk 包结构，并按需生成 `META-INF/`
//! 下的构建元信息与签名。
//!
//! Phase 4 落地。当前导出 stub。

use camino::Utf8Path;

pub fn pack(_build: &astroforge_vela::VelaBuildOutput, _out: &Utf8Path) -> anyhow::Result<()> {
    anyhow::bail!("astroforge-packager: 尚未实现")
}
