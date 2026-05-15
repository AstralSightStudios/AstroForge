# fixture 06 — conditional-render

条件渲染基线。用于验证 TSX 三元表达式会进入 Component IR 的 `conditional`
节点，并保留 `if` / `else` 分支顺序。

## 等价契约

- `isReady ? <Text>Ready</Text> : <Text>Loading</Text>` 生成一个
  `conditional` 节点。
- 第一分支 `guard.path == "isReady"`。
- 第二分支 `guard == null`，表示默认分支。
