# fixture 05 — use-state-counter

单页面状态更新基线。用于验证 `useState` 在 TSX 提取阶段被静态展开为 Page IR
数据和方法，不把 React setter 语义泄漏给后端。

## 等价契约

- `const [count, setCount] = useState(0)` 进入
  `script.private_data.count == 0`。
- 文本插值 `{count}` 进入 Component IR 的 `expression` 节点。
- `setCount((prev) => prev + 1)` 下沉为 `this.count = this.count + 1`。
