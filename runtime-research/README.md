# runtime-research

存放从厂商工具链采集的原始产物与逆向资料，作为 `docs/` 下运行时 ABI 文档的
数据来源。

## 目录结构

```
runtime-research/
├─ aiot-output-samples/   # 各 fixture 的 aiot-toolkit 原始 build/<page>.js 产物
├─ normalized-js/         # 经 `astroforge inspect normalize` 处理后的同名文件，AST diff 输入
├─ fixtures/              # 每个 fixture 的逆向笔记：输入 UX、预期运行时调用
├─ runtime-api-map.md     # __ce__ / __cc__ / 事件 / 生命周期 / system.* 接口面
├─ lifecycle-map.md       # 应用生命周期 / 页面生命周期 / 组件生命周期
├─ event-map.md           # 已知事件名及其触发场景
└─ system-api-map.md      # `@system.*` import 提供的接口面
```

## 约定

新增 `fixtures/<NN>-<name>/` 时必须同时产出：

1. `runtime-research/aiot-output-samples/<NN>-<name>/`——`aiot-toolkit build`
   的未修改产物。
2. `runtime-research/normalized-js/<NN>-<name>/`——经规范化后的版本（剥离
   时间戳、绝对路径、内容哈希、sourcemap 注释；格式化；AST 去除 `loc`）。

对照工具仅比对**规范化**产物。原始样本保留以便审计。
