# 已知限制

本文档列出 AstroForge 当前版本的所有已知限制和未实现特性。

## Hooks 限制

### useState

- 初值必须是静态 JSON 字面量
- 不支持在运行时条件/循环中调用
- 函数式更新仅支持单表达式箭头函数

### useEffect

- 仅支持省略依赖或空数组 `[]`
- 非空依赖数组导致编译错误
- 不支持在 effect 中调用其他 hook

### useMemo / useCallback

- 无运行期缓存语义
- 每次模板更新都会重新求值
- 不支持闭包捕获最新状态

### Context

- 不支持 `createContext` / `useContext`
- 不支持 Provider / Consumer 模式

## JSX 限制

### 标签

- 不支持动态标签（变量作为标签名）
- 不支持命名空间组件（`<Foo.Bar />`）
- 自定义组件必须是 PascalCase

### 属性

- 不支持属性展开（`<View {...props} />`）
- 事件属性必须是标识符或内联函数
- 不支持运行时计算的事件名

### 表达式

- 不支持外部函数调用（除非内联）
- 不支持链式数组方法（`filter().map()`）
- 不支持临时变量/IIFE

## 组件限制

- 不支持 class 组件
- 不支持 `forwardRef`、`useImperativeHandle`
- 不支持 `memo`、`PureComponent`
- 不支持高阶组件（HOC）
- 不支持 `lazy`、`Suspense`
- 不支持 Error Boundary
- 不支持 Portals

## 样式限制

- 不支持属性选择器
- 不支持伪类（除 `:active` 外）
- 不支持媒体查询
- 不支持 `@import`
- CSS 文件样式是全局的（无组件作用域）

## 运行时限制

- 没有 DOM API
- 没有浏览器全局对象（`window`、`document`）
- 没有标准 `fetch` / `localStorage`
- 不支持 Web Workers
- 不支持 Service Worker

## 打包限制

- 不支持分包（`subpackages`）
- 不支持卡片（`liteCard`）
- 不支持 protobuf 资产
- 不支持 jsc 字节码

## 未来计划

以下特性在路线图中有计划实现：

- [ ] `createContext` / `useContext` 的静态子集
- [ ] 动态组件标签
- [ ] JSX 属性展开
- [ ] CSS Modules 或组件作用域样式
- [ ] 分包支持

## 报告新问题

如果你发现了未列出的限制或 bug，请：
1. 确认已在最新版本复现
2. 提供最小复现代码
3. 在问题追踪器中提交
