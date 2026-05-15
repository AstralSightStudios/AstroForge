# fixture 04 — click-event

单页面点击事件基线。用于验证 TSX 事件属性会进入 Component IR 的 `events` 表，
对应页面方法会进入 Page IR 的 `script.methods`。

## 等价契约

- 模板根节点包含一个带 `click` 事件的 `div`。
- `events.click.path == "handleClick"`，`events.click.is_callable == true`。
- `script.methods.handleClick` 是可下沉到 Vela 页面模块的方法函数。
