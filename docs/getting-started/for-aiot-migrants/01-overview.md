# 从 aiot-toolkit 迁移——总览

本文档面向熟悉小米 Vela 官方 `aiot-toolkit`（或早期 `hap-toolkit`）的开发者。如果你之前使用 `.ux` 单文件组件开发过快应用，本文将帮助你理解 AstroForge 的核心理念、与官方工具链的差异，以及如何迁移现有项目。

## AstroForge 是什么

AstroForge 是一套**替代**官方 `aiot-toolkit` 的完整工具链，目标是在不依赖官方编译器的情况下，独立完成快应用的开发、调试、构建、签名与发布。

它与官方工具链的核心差异：

| 维度 | aiot-toolkit | AstroForge |
|------|--------------|------------|
| 源码语言 | UX（单文件组件，类似 Vue SFC） | TSX（React 语法子集） |
| 状态管理 | 页面 VM 数据对象 + 原生方法 | `useState` / `useReducer` / `useRef` 等 Hooks |
| 组件复用 | UX 文件 import、`<import>` 标签 | TSX 函数组件 import |
| 样式 | 类 CSS 语法，支持选择器 | CSS 子集 + 内联 style 对象 |
| 构建产物 | `.rpk`（zip + 签名） | `.rpk`（与官方字节级兼容） |
| 运行时 | Vela JS 运行时（QuickJS） | 同一运行时，产物 ABI 等价 |

## 为什么要迁移

### 1. 使用熟悉的 React 生态

如果你或你的团队已经熟悉 React、TypeScript 和现代前端工具链，AstroForge 让你可以直接用这些知识开发手表应用，而不必学习 UX 特有的语法和生命周期模型。

### 2. 更严格的类型安全

UX 文件没有原生类型系统。AstroForge 基于 TypeScript，组件 props、状态、事件处理函数都能获得静态类型检查。

### 3. 现代化的开发体验

- Rsbuild 提供极速的 HMR 与构建
- 完整的 npm 生态（受限于运行时能力）
- 标准 ESLint / Prettier / TypeScript 配置

### 4. 产物兼容性保证

AstroForge 的打包器严格遵循官方 `aiot-toolkit` 的字节级契约（zip 结构、文件排序、`META-INF/CERT` 内层 zip、V2 签名块等），生成的 `.rpk` 可以直接在 Vela 设备上安装运行。

## 核心概念对照

### 文件组织

```text
# aiot-toolkit 项目
src/
  pages/
    index/
      index.ux          <-- 页面：模板 + 脚本 + 样式
    detail/
      detail.ux
  components/
    button.ux           <-- 组件：模板 + 脚本 + 样式
  app.ux                <-- 应用入口
  manifest.json

# AstroForge 项目
src/
  pages/
    index/
      index.tsx         <-- 页面组件（函数 + JSX）
    detail/
      detail.tsx
  components/
    Button.tsx          <-- 函数组件
  app.tsx               <-- 应用入口
  manifest.json
```

### 模板语法对照

| UX | TSX | 说明 |
|----|-----|------|
| `<div class="page">` | `<View className="page">` | 内置标签映射 |
| `<text>{{title}}</text>` | `<Text>{title}</Text>` | 文本插值 |
| `<div if="{{show}}">` | `{show && <View>...</View>}` | 条件渲染 |
| `<div for="{{list}}">` | `{list.map(item => <View key={item.id}>...</View>)}` | 列表渲染 |
| `<slot></slot>` | `{children}` 或 `{props.children}` | 插槽/子内容 |

### 脚本对照

| UX | TSX |
|----|-----|
| `export default { data: { count: 0 } }` | `const [count, setCount] = useState(0)` |
| `this.count = 1` | `setCount(1)` 或 `setCount(prev => prev + 1)` |
| `onInit() { ... }` | `export const lifecycle = { onInit() { ... } }` |
| `import router from '@system.router'` | `import { router } from '@astralsight/astroforge-core'` |

### 样式对照

| UX | TSX |
|----|-----|
| `<style>.page { color: red; }</style>` | `import './page.css'` |
| `<div style="color: {{themeColor}}">` | `<View style={{ color: themeColor }} />` |

## 迁移路径建议

### 阶段一：理解差异（1-2 天）

阅读本指南的以下章节：
1. [环境准备](02-environment-setup.md)
2. [项目脚手架](03-project-scaffold.md)
3. [UX 到 TSX 语法对照](04-from-ux-to-tsx.md)
4. [组件模型差异](05-component-model.md)

### 阶段二：原型验证（2-3 天）

使用 AstroForge 脚手架创建一个最小项目，将现有项目中最简单的一个页面迁移过来，验证构建与真机运行。

### 阶段三：完整迁移（视项目规模）

按页面逐个迁移，优先迁移展示型页面，最后处理复杂交互页面。

## 不支持直接迁移的特性

以下 UX 特性在 AstroForge 中没有等价实现，需要改写：

- **UX 指令**：`if`/`elif`/`else`、`for` 模板指令 → 改用 JS 表达式（`&&`、三元、`map`）
- **UX 事件修饰符**：`@click.stop` → 手动在事件处理函数中调用 `evt.stopPropagation()`
- **UX 计算属性** → 改用 `useMemo`
- **UX watch** → 改用 `useEffect`（空依赖数组，等效 onReady/onDestroy）
- **UX mixins** → 改用普通 TS 函数/Hook 组合

## 下一步

继续阅读 [环境准备](02-environment-setup.md)，搭建 AstroForge 开发环境。
