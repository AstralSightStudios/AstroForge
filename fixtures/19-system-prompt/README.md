# fixture 19 — system-prompt

非 router 系统接口基线。验证模板内联事件中直接调用 `prompt.showToast` 时，
TSX 降级不会把 `prompt` 当作 VM 字段，Vela 后端会生成 `system.prompt` 的
模块 require。

## 等价契约

- 模板根节点包含一个带 `click` 事件的 `div`。
- AstroForge 侧事件处理函数保留 `prompt.showToast(...)`。
- 页面模块包含 `@app-module/system.prompt` require。
- manifest 声明 `system.prompt` feature。
