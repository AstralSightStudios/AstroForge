# fixture 09 — app-lifecycle

应用生命周期基线。用于验证 `src/app.tsx` 的 default export 对象方法会进入
IR 根节点的 `app.lifecycle`。

## 等价契约

- `src/app.tsx` 中的 `onCreate` / `onDestroy` 进入 `app.lifecycle`。
- app lifecycle 值为函数体源码，不包含函数签名。
- 页面本身保持最小静态文本模板，便于单独观察 app 模块差异。
