# 与 React 的差异全景

本文档系统性地对比 AstroForge 与标准 React 在语法、语义、运行时三个层面的差异。

## 语法层

### JSX

| 特性 | React | AstroForge | 说明 |
|------|-------|-----------|------|
| 标签大小写 | 大写组件 / 小写 DOM | 大写内置组件 / PascalCase 自定义组件 | `<View>` 而非 `<div>` |
| Fragment | `<>` / `<React.Fragment>` | `<>` / `<Fragment>` | 相同 |
| 属性命名 | camelCase | camelCase | 相同 |
| className | `className` | `className` | 相同 |
| style | 对象 | 对象 | 属性名 camelCase |
| 事件命名 | `onClick` | `onClick` | 相同 |
| 条件渲染 | `&&` / 三元 | `&&` / 三元 | 相同 |
| 列表渲染 | `map` | `map` | 必须带 `key` |
| 动态标签 | 支持 | 当前版本不支持 | `<Tag />` 需为编译期已知 |
| 属性展开 | `...props` | 当前版本不支持 | 需显式列举属性 |
| children | `props.children` | `props.children` | 编译为 `<slot>` |

### Hooks

| Hook | React 语义 | AstroForge 语义 | 差异 |
|------|-----------|----------------|------|
| `useState` | 触发 re-render | 编译为 VM 数据 + setter 方法 | 无虚拟 DOM diff |
| `useEffect` | 依赖追踪 + cleanup | 编译为 `onReady` / `onDestroy` | 仅支持空依赖数组 |
| `useRef` | 可变容器 | 编译为 `{ current: ... }` | 不支持 ref callback |
| `useMemo` | 缓存计算结果 | 内联到模板表达式 | 无缓存，每次求值 |
| `useCallback` | 缓存函数引用 | 提取为 VM 方法 | 无缓存 |
| `useReducer` | dispatch + 状态更新 | 编译为 VM 方法 | reducer 需静态可分析 |
| `useContext` | Context 树查找 | **不支持** | 无 Context 运行时 |
| `useId` | 生成唯一 ID | 生成固定字符串 `__af_id_N` | 编译期确定 |

## 语义层

### 组件模型

| 特性 | React | AstroForge |
|------|-------|-----------|
| 组件类型 | 函数 / class | 仅函数 |
| 实例 | 有（class）/ 无（函数） | 无 |
| 数据流 | 单向 props + 状态提升 | 单向 props + 状态提升 |
| Context | 支持 | 不支持 |
| Ref 转发 | `forwardRef` | 不支持 |
| 高阶组件 | 支持 | 不支持（编译期无法分析） |
| render props | 支持 | 支持（函数作为 props） |
| Portals | `createPortal` | 不支持 |
| Error Boundary | 支持 | 不支持 |
| Suspense | 支持 | 不支持 |

### 状态管理

| 特性 | React | AstroForge |
|------|-------|-----------|
| useState | 异步批量更新 | 同步直接赋值 |
| useReducer | 运行时 dispatch | 编译为 VM 方法 |
| 外部 store | `useSyncExternalStore` | 模块级变量 |
| Context | `createContext` | 不支持 |
| Redux/Mobx | 支持 | 不支持（需要运行时） |

### 生命周期

| React | AstroForge | 说明 |
|-------|-----------|------|
| 函数组件无生命周期 | `export const lifecycle` | 显式声明 |
| `useEffect(() => {}, [])` | `useEffect` / `lifecycle.onReady` | 等效 |
| `useEffect cleanup` | `useEffect cleanup` / `lifecycle.onDestroy` | 等效 |
| `componentDidMount` | `onReady` | 等效 |
| `componentWillUnmount` | `onDestroy` | 等效 |
| `componentDidUpdate` | **不支持** | 无依赖追踪 |

## 运行时层

### 执行环境

| 特性 | React (Web) | AstroForge (Vela) |
|------|-------------|-------------------|
| JS 引擎 | V8 / JSC / SpiderMonkey | QuickJS |
| DOM | 完整 DOM API | 无 DOM |
| 全局对象 | `window`、`document` | `global`、`aiot` |
| 模块系统 | ESM / CJS | webpack 风格 `__webpack_require__` |
| 事件系统 | 合成事件 | 原生事件直接绑定 |
| 样式系统 | CSSOM + CSS-in-JS | 运行时样式表数组 |
| 网络 | `fetch` | `@system.fetch` 桥接 |
| 存储 | `localStorage` | `@system.storage` 桥接 |
| 定时器 | 标准 `setTimeout` | 从 `global` 显式获取 |

### 渲染流程

**React**：
1. JSX → VNode 树（createElement）
2. 状态变更 → re-render → 新 VNode 树
3. Reconciler diff 新旧 VNode 树
4. Commit 阶段更新 DOM

**AstroForge**：
1. TSX → 静态 IR（编译期）
2. IR → Vela JS 代码（编译期）
3. 状态变更 → 直接修改 VM 数据
4. Vela 运行时响应式系统重新求值模板闭包
5. 更新原生节点属性

没有 VNode，没有 diff，没有 reconciler。更新粒度是属性级。

## 开发体验差异

| 特性 | React | AstroForge |
|------|-------|-----------|
| DevTools | React DevTools | 无（console.log + adb） |
| HMR | 局部热更新 | 重新编译 + 重新安装 |
| 错误边界 | Error Boundary | 无，全局错误可能崩溃 |
| 类型检查 | TypeScript 编译器 | TypeScript 编译器（相同） |
| 包体积 | React + ReactDOM | 无运行时，产物极小 |

## 不支持的标准 React 特性

以下特性在 AstroForge 中完全不可用：

- `createContext` / `useContext`
- `forwardRef` / `useImperativeHandle`
- `useLayoutEffect`
- `useDebugValue`
- `useTransition` / `useDeferredValue` / `startTransition`
- `Suspense` / `lazy`
- `memo` / `PureComponent`
- `createPortal`
- `unstable_batchedUpdates`
- `flushSync`

## 不支持的标准 Web API

以下浏览器 API 在 Vela 运行时中不存在：

- `document` / `window` / `navigator`
- `fetch`（使用 `@system.fetch`）
- `localStorage` / `sessionStorage`（使用 `@system.storage`）
- `XMLHttpRequest`
- `WebSocket`（部分平台支持）
- `requestAnimationFrame`
- `addEventListener`（元素事件直接通过 props 绑定）

## 迁移建议

从 React 迁移到 AstroForge 时，按以下优先级调整：

1. **替换浏览器 API** → 使用 Vela 桥接 API
2. **移除 Context** → 改用 props drilling 或模块级状态
3. **调整 useEffect 依赖** → 改为空数组或省略
4. **检查 useMemo 使用** → 确认无缓存语义是否可接受
5. **验证动态标签/属性展开** → 如使用需改写
