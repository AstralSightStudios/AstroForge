# astroforge

AstroForge CLI：基于 Rust 的 React/TSX 智能手表快应用工具链入口。

## 安装

```bash
pnpm add -D astroforge
# 或
npm i -D astroforge
```

包安装时，npm / pnpm 会按 `os` 与 `cpu`（Linux 上额外按 `libc`）从以下平台子包里挑出匹配本机的那一个，其它 optionalDependencies 自动跳过：

- `@astroforge/cli-darwin-arm64`
- `@astroforge/cli-darwin-x64`
- `@astroforge/cli-linux-x64-gnu`
- `@astroforge/cli-linux-arm64-gnu`
- `@astroforge/cli-win32-x64-msvc`
- `@astroforge/cli-win32-arm64-msvc`

主包自身只是 Node 端 shim，把 CLI 调用转发给装下的预编译二进制。

## 使用

```bash
pnpm exec astroforge init my-watch-app    # 生成项目骨架
pnpm exec astroforge build --target vela  # 构建 .rpk
pnpm exec astroforge dev                  # 增量监听 + 重打包
pnpm exec astroforge release              # 带签名的 release 构建
pnpm exec astroforge inspect rpk app.rpk  # 检视 rpk 内容
```

完整子命令与设计原则见仓库根目录 `README.md` 与 `docs/`。

## 二进制查找顺序

1. 环境变量 `ASTROFORGE_BIN` 指定的路径；
2. 在 monorepo 内运行时，本仓库 `target/release/astroforge` → `target/debug/astroforge`；
3. 已通过 `optionalDependencies` 装入 `node_modules` 的平台子包；
4. PATH 中的 `astroforge`（兜底）。

## License

MIT
