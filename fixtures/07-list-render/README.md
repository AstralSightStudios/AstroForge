# fixture 07 — list-render

列表渲染基线。用于验证 `array.map(...)` 会进入 Component IR 的 `list` 节点，
并保留 item、index 和 key 绑定。

## 等价契约

- `items.map((item, idx) => ...)` 生成一个 `list` 节点。
- `source.path == "items"`。
- `item_var == "item"`，`index_var == "idx"`。
- `key.path == "item.id"`，且 `key` 不作为普通节点属性输出。
