# Rsbuild 插件设计

`@astralsight/astroforge-rsbuild-plugin` 是 AstroForge 前端编译链的入口。它负责发现页面、
解析 TSX、生成跨进程 IR，并把 Rsbuild 的基础构建能力限制在快应用工具链需要
的范围内。

## 当前能力

- 从项目根目录读取 `astroforge.config.ts`。配置文件必须是可静态解析的对象
  字面量，不执行任意 TypeScript 代码。
- 自动发现 `src/pages/**/*.{tsx,ts,jsx}` 页面入口。
- 将 `@astralsight/astroforge-core` 导出的 PascalCase 内置组件识别为快应用渲染标签，
  例如 `View` / `Text` / `Image` 分别转换为 `div` / `text` / `image`，
  `ListItem` / `ImageAnimator` 分别转换为 `list-item` / `image-animator`。
- 提取静态文本、静态属性、动态属性绑定和事件绑定。
- 提取页面 / 组件函数内的事件处理方法，写入对应 IR 的 `script.methods`。
- 将 `useState` 的静态初值写入 `script.private_data`，并把简单 setter 调用下
  沉为对页面实例状态的直接赋值。
- 将页面 / 组件函数内的 `useEffect` 静态展开为生命周期：省略依赖或空依赖数组映射
  到 `onReady`，cleanup 函数映射到 `onDestroy`。
- 将 `useRef`、`useMemo`、`useCallback` 的静态子集展开到 VM 数据、模板表达式
  或方法表；这些 hook 不保留 React runtime 调度语义。
- 将 JSX 三元表达式和 `&&` 表达式下沉为 Component IR 的 `conditional` 节点。
- 将 `array.map((item, index) => <Node />)` 下沉为 Component IR 的 `list`
  节点，并把 JSX `key` 记录到 `List.key`。
- 将页面模块导出的 `lifecycle` 对象写入 Page IR 的 `script.lifecycle`。
- 将 `src/app.tsx` 的 default export 对象方法写入 IR 根节点的 `app.lifecycle`。
- 提取同一页面模块内的 PascalCase 本地组件，并在 Page IR 中记录组件导入关系。
- BFS 加载 JSX 实际使用到的跨文件 PascalCase 组件，支持相对路径、`@/foo` 与
  `@features/foo` 这类 `src/` 别名；未作为 JSX 标签使用的 PascalCase import
  会被视为普通数据 import，不触发组件提取。
- 从组件首参的 TypeScript 注解推导 `script.props`，支持 type literal、
  interface、type alias 与解构默认值。
- 提取相对 CSS import 与页面模块导出的静态 `style` / `styles` 字符串，转换
  为 Style IR。
- 收集 manifest icon、静态 `Image.src`、静态 CSS `url(...)` 指向的项目内资
  源，并写入 IR 根节点的 `assets`。
- 按 `@astralsight/astroforge-core/platform` 的能力目录校验目标平台支持的组件与
  manifest feature，提前拒绝当前目标不能使用的接口或标签。
- 在 Rsbuild `onBeforeBuild` / `onBeforeDevCompile` 阶段写出
  `node_modules/.cache/astroforge/ir-document.json`。
- 通过 `modifyRsbuildConfig` 设置 Rsbuild entry，并配置 SWC automatic JSX
  runtime，`importSource` 固定为 `@astralsight/astroforge-core`。

## IR 输出位置

默认输出：

```text
node_modules/.cache/astroforge/ir-document.json
```

插件选项可通过 `cacheDir` 或 `outFile` 覆盖：

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginAstroForge } from "@astralsight/astroforge-rsbuild-plugin";

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

- default export 必须是函数；返回 JSX、Fragment、条件 / 列表表达式、`null`
  或 `false` 可静态下沉；
- JSX spread 属性暂不支持；
- 事件属性必须是表达式绑定，例如 `onClick={handleClick}` 或
  `onClick={() => handleClick()}`；
- 动态属性和文本插值支持标识符 / 成员访问路径；文本插值可额外使用三元表
  达式与模板字符串；
- `useState` 初值必须是静态 JSON 字面量；允许 `useState(() => 静态 JSON)` 惰性
  初值；
- `setState` updater 当前支持值表达式或单表达式箭头函数，例如
  `setCount(count + 1)` 与 `setCount((prev) => prev + 1)`；block body updater
  仅支持单个 `return` 表达式；
- `useEffect` 仅支持省略依赖或空依赖数组；非空依赖数组暂不支持；
- `useMemo` 仅支持可静态内联的表达式返回值；`useCallback` 仅下沉为 VM 方法；
  依赖数组不具备 React 运行期重算 / 缓存语义；
- `<Fragment>` 与短 Fragment 只作为编译期分组，不生成运行时组件；
- 条件渲染的 guard 支持可静态下沉到模板闭包的表达式；
- 列表渲染当前只支持直接的 `.map(...)` 调用，item / index 参数必须是标识符；
- 页面生命周期必须通过 `export const lifecycle = { ... }` 声明；
- 应用生命周期必须通过 `src/app.tsx` 的 default export 对象方法声明；
- 页面静态样式可通过相对 CSS import、`export const style = "..."` 或
  `export const styles = "..."` 声明，不执行运行时代码；
- 混合内联 style 对象支持静态字面量值与可静态下沉到模板闭包的表达式；
- 本地组件必须使用 PascalCase 顶层函数或函数变量声明；
- props 推导只读取组件首参的静态 TypeScript 注解，不执行类型检查器；
- 组件命名空间（`<Foo.Bar />`）暂不支持。

这些限制用于保证前端阶段输出的 IR 可预测，后续扩展应以 fixture 和 schema
测试先行。

## 已覆盖 fixtures

| fixture                  | 覆盖点                                     |
| ------------------------ | ------------------------------------------ |
| `01-hello-text`          | 静态文本和最小 manifest / route 生成       |
| `02-static-style`        | 静态样式提取与 `$app_style$` 下沉          |
| `03-image-asset`         | manifest icon 与页面图片资源收集           |
| `04-click-event`         | `onClick` 事件绑定与页面方法提取           |
| `05-use-state-counter`   | `useState` 初值、文本绑定、setter lowering |
| `06-conditional-render`  | 三元表达式条件渲染                         |
| `07-list-render`         | `.map(...)` 列表渲染、item / index / key   |
| `08-page-lifecycle`      | 页面 lifecycle 导出                        |
| `09-app-lifecycle`       | 应用 lifecycle 导出                        |
| `10-navigation`          | 路由 bridge 调用、多页面路由表             |
| `11-storage-api`         | storage bridge 调用与 feature 声明         |
| `12-network-api`         | network bridge 调用与 feature 声明         |
| `13-timer`               | timer 调用保留                             |
| `14-nested-component`    | 本地组件提取、组件导入、组件事件绑定       |
| `15-multi-page`          | 多页面发现、入口排序、Rsbuild entries      |
| `16-permission-manifest` | manifest features 透传                     |
| `17-resource-path`       | 静态图片资源收集、资源 digest              |
| `18-css-edge-cases`      | 静态 CSS 解析、复合覆盖选择器、at-rule     |
| `19-system-prompt`       | inline handler 中的 prompt bridge require  |
| `20-react-static-subset` | React 常用 hook / Fragment 写法静态展开     |
