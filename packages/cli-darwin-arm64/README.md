# @astroforge/cli-darwin-arm64

macOS aarch64 (Apple Silicon) 平台下 `astroforge` CLI 的预编译二进制。

该包仅作为 [`astroforge`](https://www.npmjs.com/package/astroforge) 主包的 `optionalDependencies` 自动安装：npm / pnpm 会按 `os` 与 `cpu` 字段在装包阶段挑出匹配本机的子包，其它平台的子包会被跳过。**不应被直接 `pnpm add`。**

二进制由仓库 GitHub Actions 多平台矩阵从 [astroforge-cli](https://github.com/AstralSightStudios/AstroForge/tree/main/crates/astroforge-cli) crate 用 `cargo build --release` 产出，落在本包的 `bin/astroforge`。

## License

MIT
