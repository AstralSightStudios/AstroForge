# AstroForge

基于 Rust 的智能手表快应用现代化工具链，使用 React/TSX 作为开发语言，输出
厂商运行时兼容的产物。

## 背景

智能手表快应用生态高度割裂：小米 Vela 使用 `aiot-toolkit`，vivo BlueOS 使
用各自的工具链，二者均以 Vue 派生的 `.ux` SFC 为开发语言并自行实现构建流水
线。AstroForge 用一套统一工具链替代这种分裂格局：

- 接受 **React/TSX** 源码。
- 经由稳定的三层 **IR**（Component → Page → Runtime）下沉。
- 输出**与厂商运行时 ABI 等价**的 JS 产物，在运行时调用层面与官方工具链产
  物不可区分。

## 当前状态

- Phase 0：Vela 运行时 ABI 研究骨架与 aiot-toolkit 源码缓存已建立。
- Phase 1：Rust 侧 IR、schema、I/O、diff 基础设施已落地。
- Phase 2：`@astralsight/astroforge-rsbuild-plugin` 能从静态文本、点击事件、`useState`
  counter、条件渲染、列表渲染、生命周期等 18 个 fixture 的 TSX 页面生成
  符合 `docs/ir-document.schema.json` 的 IR 文件；支持跨文件相对路径组件
  import（BFS 加载、循环去重、可达组件递归）；manifest 未知字段按源序透传。
- Phase 3：`astroforge-vela` 将 Page IR 下沉并打印 Vela-compatible
  `app.js`、页面 JS、样式表、事件、系统 API bridge、条件与列表包装调用；
  manifest source 优先策略保证用户书写顺序与扩展字段全量保留。
- Phase 4：`astroforge-packager` 生成带 Vela `RPK Sig Block 42` 双层签名块的
  `.rpk`，文件排序、CERT 内层零 comment、build.txt 字节序列均与 aiot-toolkit
  字节级对齐；`inspect rpk` 显示签名块状态、hash.json 摘要数、build.txt 元
  数据。
- Phase 5：`astroforge test-compat --official` 批量驱动 18 个 fixture 双侧
  构建并 diff（files / manifest / runtime_calls / rpk_structure），目前全部
  0 diff；`cargo test -p astroforge-compat --test compat_goldens` 提供无
  aiot-toolkit 依赖的回归网。
- Phase 6：`init` 生成可直接 `pnpm install && pnpm exec astroforge build` 的
  完整骨架（含 package.json、tsconfig.json、rsbuild.config.ts、common 资源）；
  `dev` 联动 Rsbuild 与 notify-debouncer 监听 IR 缓存，每次源码变更后增量
  重打 rpk，可选 `--install` 触发设备钩子；`build` / `release` 按模式查找
  签名材料（与 aiot-toolkit `sign/{debug,release}` 路径一致），release 模式
  缺失材料时直接报错，绝不退化到内置 debug 证书。

常用验证命令：

```bash
pnpm check:js
pnpm test:js
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm --dir fixtures/01-hello-text/astroforge exec astroforge build --target vela
astroforge test-compat
astroforge test-compat --official
```

更多后端与打包细节见 `docs/vela-backend-packager.md`。
