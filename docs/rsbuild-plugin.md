# Rsbuild 插件设计

`@astroforge/rsbuild-plugin` 是 AstroForge 前端编译链的入口。它负责发现页面、
解析 TSX、生成跨进程 IR，并把 Rsbuild 的基础构建能力限制在快应用工具链需要
的范围内。

## 当前能力

- 从项目根目录读取 `astroforge.config.ts`。配置文件必须是可静态解析的对象
  字面量，不执行任意 TypeScript 代码。
- 自动发现 `src/pages/**/*.{tsx,ts,jsx}` 页面入口。
- 将 `View`、`Text`、`Image` 识别为 AstroForge 内置组件，并分别转换为
  Component IR 中的 `div`、`text`、`image`。
- 提取静态文本、静态属性、动态属性绑定和事件绑定。
- 提取页面函数内的事件处理方法，写入 Page IR 的 `script.methods`。
- 将 `useState` 的静态初值写入 `script.private_data`，并把简单 setter 调用下
  沉为对页面实例状态的直接赋值。
- 将 JSX 三元表达式和 `&&` 表达式下沉为 Component IR 的 `conditional` 节点。
- 将 `array.map((item, index) => <Node />)` 下沉为 Component IR 的 `list`
  节点，并把 JSX `key` 记录到 `List.key`。
- 将页面模块导出的 `lifecycle` 对象写入 Page IR 的 `script.lifecycle`。
- 将 `src/app.tsx` 的 default export 对象方法写入 IR 根节点的 `app.lifecycle`。
- 在 Rsbuild `onBeforeBuild` / `onBeforeDevCompile` 阶段写出
  `node_modules/.cache/astroforge/ir-document.json`。
- 通过 `modifyRsbuildConfig` 设置 Rsbuild entry，并配置 SWC automatic JSX
  runtime，`importSource` 固定为 `@astroforge/core`。

## IR 输出位置

默认输出：

```text
node_modules/.cache/astroforge/ir-document.json
```

插件选项可通过 `cacheDir` 或 `outFile` 覆盖：

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginAstroForge } from "@astroforge/rsbuild-plugin";

export default defineConfig({
  plugins: [
    pluginAstroForge({
      target: "vela",
      cacheDir: ".astroforge",
    }),
  ],
});
```

## 路由推导

页面路径按 `src/` 相对路径转换为路由，末尾的 `/index` 会被折叠：

| 文件                           | 路由             | component |
| ------------------------------ | ---------------- | --------- |
| `src/pages/index/index.tsx`    | `pages/index`    | `index`   |
| `src/pages/settings/index.tsx` | `pages/settings` | `index`   |
| `src/pages/about.tsx`          | `pages/about`    | `about`   |

`manifest.router.entry` 使用排序后的第一个页面路由。多页面应用后续会增加显式
入口配置。

## 静态解析约束

Phase 2 的 TSX 提取器以稳定 IR 为目标，当前只接受可直接映射到 Component IR
的语法：

- default export 必须是返回 JSX 的函数；
- JSX spread 属性暂不支持；
- 事件属性必须是表达式绑定，例如 `onClick={handleClick}`；
- 动态属性和文本插值目前只支持标识符或成员访问路径，例如 `{title}`、
  `{user.name}`；
- `useState` 初值必须是静态 JSON 字面量；
- `setState` updater 当前支持值表达式或单表达式箭头函数，例如
  `setCount(count + 1)` 与 `setCount((prev) => prev + 1)`；
- 条件渲染的 guard 当前只支持标识符或成员访问路径；
- 列表渲染当前只支持直接的 `.map(...)` 调用，item / index 参数必须是标识符；
- 页面生命周期必须通过 `export const lifecycle = { ... }` 声明；
- 应用生命周期必须通过 `src/app.tsx` 的 default export 对象方法声明；
- 组件命名空间（`<Foo.Bar />`）暂不支持。

这些限制用于保证前端阶段输出的 IR 可预测，后续扩展应以 fixture 和 schema
测试先行。

## 已覆盖 fixtures

| fixture                 | 覆盖点                                     |
| ----------------------- | ------------------------------------------ |
| `01-hello-text`         | 静态文本和最小 manifest / route 生成       |
| `04-click-event`        | `onClick` 事件绑定与页面方法提取           |
| `05-use-state-counter`  | `useState` 初值、文本绑定、setter lowering |
| `06-conditional-render` | 三元表达式条件渲染                         |
| `07-list-render`        | `.map(...)` 列表渲染、item / index / key   |
| `08-page-lifecycle`     | 页面 lifecycle 导出                        |
| `09-app-lifecycle`      | 应用 lifecycle 导出                        |
