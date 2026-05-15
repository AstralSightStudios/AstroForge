# fixture 08 — page-lifecycle

页面生命周期基线。用于验证页面模块导出的 `lifecycle` 对象会进入 Page IR 的
`script.lifecycle`。

## 等价契约

- `export const lifecycle = { onInit() {}, onReady() {} }` 进入
  `script.lifecycle`。
- lifecycle 值为完整函数表达式，可由 Vela 后端直接写入页面模块。
- 页面模板仍可同时包含 `useState` 生成的 `private_data` 与表达式绑定。
