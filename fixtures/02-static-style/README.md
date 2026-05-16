# fixture 02 — static-style

静态样式基线。用于验证 TSX 导出的页面级样式可进入 Page IR，并下沉为 Vela
页面模块中的 `$app_style$`。

## 等价契约

- 根节点包含 `card` class。
- `.card` 和 `text` 两条静态样式规则进入 Page IR。
- 官方 UX 与 AstroForge TSX 的文件结构、manifest 和运行时调用序列一致。
