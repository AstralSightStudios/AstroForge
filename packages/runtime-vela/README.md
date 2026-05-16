# @astroforge/runtime-vela

AstroForge 注入到 Vela 设备端产物的运行时垫片，承载 `aiot.__ce__` / `aiot.__cc__` 等内置原语之外的辅助代码（开发诊断 hook、样式转换后备实现、状态更新桥）。

发布形态主要为后端按需 inline 的源码片段；目前包导出仅占位标识 `__ASTROFORGE_VELA_RUNTIME__`，运行时实际生成逻辑由 Rust `astroforge-vela` 后端在 `app.js` / 页面 JS 中直接打印。

详细 ABI 见仓库 `docs/vela-runtime-abi.md`。

## License

MIT
