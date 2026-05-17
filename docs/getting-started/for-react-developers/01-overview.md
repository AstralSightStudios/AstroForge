# React 开发者入门——总览

本文档面向熟悉 React 的开发者。如果你有 React（或 Preact、React Native）开发经验，想知道如何用 AstroForge 开发小米 Vela 快应用，从这里开始。

## AstroForge 是什么

AstroForge 是一套将 React/TSX 编译为快应用运行时代码的完整工具链。它让你能够：

- 使用 JSX 编写 UI
- 使用 `useState`、`useEffect` 等 Hooks 管理状态
- 使用 TypeScript 获得类型安全
- 产物为标准的 `.rpk` 快应用包，可直接在 Vela 设备运行

## 关键认知：这不是浏览器 React

AstroForge 的 TSX **不是**在浏览器中运行的 React。以下是根本差异：

### 1. 没有 React 运行时

Vela 设备的 JS 引擎（QuickJS）没有 DOM、没有 `document`、没有 React  reconciler。你的 `useState`、`useEffect` 等 hook 调用在**编译阶段**就被静态展开为 Vela 原生数据结构和生命周期方法。

**运行时执行 hook 会报错**：

```tsx
// 正确：编译器会将其展开为 VM 数据
const [count, setCount] = useState(0);

// 错误：如果在运行时动态调用 hook（如 setTimeout 里），会抛出错误
setTimeout(() => {
  const [x, setX] = useState(0); // 运行时错误！
}, 1000);
```

### 2. 组件即函数，没有实例

```tsx
// 这是一个有效的组件
function Card({ title }: { title: string }) {
  return <View><Text>{title}</Text></View>;
}

// 但你不能访问 "this"、不能继承、不能用 class 组件
class Card extends Component { } // 不支持！
```

### 3. Hooks 是编译期标记

| Hook | 编译后形态 | 运行时行为 |
|------|-----------|-----------|
| `useState` | 页面 VM 的 `private_data` + setter 方法 | 直接状态赋值 |
| `useEffect` | `lifecycle.onReady` / `onDestroy` | 生命周期回调 |
| `useRef` | `private_data` 中的 `{ current: ... }` | 普通对象属性 |
| `useMemo` | 模板中的内联表达式 | 每次渲染重新求值 |
| `useCallback` | `script.methods` 中的方法 | 普通函数 |
| `useReducer` | `private_data` + dispatch 方法 | 直接状态赋值 |
| `useId` | 固定字符串 `__af_id_N` | 静态值 |

### 4. JSX 不是 DOM

```tsx
// 这些不是 HTML 标签，是 Vela 原生组件
<View />      → aiot.__ce__("div", ...)
<Text />      → aiot.__ce__("text", ...)
<Image />     → aiot.__ce__("image", ...)
<List />      → aiot.__ce__("list", ...)
<ListItem />  → aiot.__ce__("list-item", ...)

// 自定义组件
<Card />      → aiot.__cc__("card", ...)
```

## 哪些 React 知识可以直接用

✅ **完全兼容的思维模型**：
- 函数组件 + props
- JSX 嵌套与组合
- 单向数据流
- Hooks 的使用时机规则（顶层调用、不在循环/条件中）

✅ **大部分语法**：
- 条件渲染：`condition && <Component />`、`condition ? <A /> : <B />`
- 列表渲染：`array.map(item => <Component key={item.id} />)`
- 事件处理：`onClick={handler}`、内联箭头函数
- Fragment：`<>...</>`、`<Fragment>...</Fragment>`

✅ **TypeScript**：
- 接口、类型别名
- 泛型组件
- 解构与默认值

## 哪些 React 特性不可用

❌ **没有虚拟 DOM**：没有 `react-dom`、没有 `render`、`createRoot`、`hydrate`

❌ **没有浏览器 API**：没有 `window`、`document`、`localStorage`、`fetch`（使用 Vela 桥接 API）

❌ **没有 React 并发特性**：没有 `useTransition`、`useDeferredValue`、`Suspense`、`startTransition`

❌ **没有 Context API**（当前版本）：没有 `createContext`、`useContext`。跨组件状态共享需通过 props 或全局状态管理。

❌ **没有 Ref 转发**：没有 `forwardRef`、`useImperativeHandle`

❌ **没有 Portal**：没有 `createPortal`

❌ **没有 Error Boundary**：没有 `componentDidCatch`、`static getDerivedStateFromError`

## 开发体验差异

### 构建速度

Rsbuild（基于 Rspack）的构建速度远快于 webpack，HMR 在开发阶段几乎瞬时。

### 调试

产物是标准 JS，你可以在 Vela 模拟器或真机上用 `console.log` 调试。由于没有 React DevTools，状态查看需要通过日志或自定义调试面板。

### 包体积

没有 React、ReactDOM 的运行时负担，产物体积通常比同等功能的 web 应用小得多。

## 项目示例

```tsx
// src/pages/index/index.tsx
import { View, Text, useState } from '@astralsight/astroforge-core';

export default function IndexPage() {
  const [count, setCount] = useState(0);

  return (
    <View className="container">
      <Text>点击次数: {count}</Text>
      <Text onClick={() => setCount(c => c + 1)}>点击我</Text>
    </View>
  );
}
```

```css
/* src/pages/index/index.css */
.container {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
```

## 下一步

继续阅读 [环境准备](02-environment-setup.md)，搭建你的第一个 AstroForge 项目。
