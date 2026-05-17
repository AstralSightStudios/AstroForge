# 限制与注意事项

本文档列出 AstroForge 与标准 React 的所有已知差异和限制。在开发前仔细阅读，可避免大量调试时间。

## Hooks 限制

### useState

- 初值必须是**静态 JSON 字面量**（见下表）
- 不支持函数式组件外部调用
- 不支持动态数量的 hook 调用（与 React 规则相同，但违反时编译期报错而非运行时报错）

```tsx
// 支持的初值
useState(0);
useState('hello');
useState(true);
useState(null);
useState([1, 2, 3]);
useState({ name: 'test', count: 0 });
useState(() => 42);  // 惰性初值，函数体必须是静态返回

// 不支持的初值
useState(new Date());
useState(Math.random());
useState(someVariable);
useState(window.innerWidth);
useState(() => dynamicValue);  // 函数体内含动态引用
```

### useEffect

- 仅支持省略依赖或空数组 `[]`
- 非空依赖数组导致**编译错误**
- 不支持在 effect 中调用其他 hook
- effect 中引用的外部变量必须是 VM 数据（state、ref、方法）

```tsx
// 正确
useEffect(() => { ... });
useEffect(() => { ... }, []);

// 错误
useEffect(() => { ... }, [count]);
```

### useMemo / useCallback

- 依赖数组不具备运行期语义
- 每次渲染都会重新求值（useMemo 无缓存）
- 不支持闭包捕获最新状态（使用编译期确定的作用域）

## JSX 限制

### 标签

- 必须是大写的内置组件或 PascalCase 自定义组件
- 不支持命名空间组件（`<MyLib.Component />`）
- 不支持动态标签（`<TagName />` 其中 TagName 是变量）——当前版本

### 属性

- 事件属性必须是标识符或内联函数
- 不支持属性展开（`<View {...props} />`）——当前版本
- `key` 必须写在最外层 JSX 元素上

### 表达式

模板中的表达式必须是编译期可静态分析的：

```tsx
// 支持
<Text>{user.name}</Text>
<Text>{count + 1}</Text>
<Text>{isActive ? 'Yes' : 'No'}</Text>
<View>{show && <Text>Visible</Text>}</View>

// 不支持
<Text>{formatDate(date)}</Text>        // 外部函数调用
<Text>{items.filter(i => i.active).length}</Text>  // 链式调用
```

## 组件限制

- 不支持 class 组件
- 不支持 `forwardRef`、`useImperativeHandle`
- 不支持 `createContext`、`useContext`
- 不支持 `lazy`、`Suspense`
- 不支持 `memo`（所有组件都没有 memoization）

## 运行时限制

- 没有 DOM API（`document`、`window`、`HTMLElement`）
- 没有浏览器事件系统
- 没有 `fetch`（使用 `@system.fetch` 桥接）
- 没有 `localStorage`（使用 `@system.storage` 桥接）
- 没有 `setTimeout`/`setInterval` 的标准语义（从 `global` 显式获取）

## 样式限制

- 不支持属性选择器、伪类选择器（除 `:active` 外）
- 不支持媒体查询
- 不支持 `@import`
- CSS 文件中的样式是全局的（无组件作用域）

## 调试提示

### 编译错误排查

常见编译错误及解决方案：

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `useState 初值必须是静态 JSON 字面量` | 初值含动态表达式 | 使用静态字面量或惰性初值 |
| `useEffect 静态展开仅支持省略依赖或空依赖数组` | 传了非空依赖数组 | 改为 `[]` 或省略 |
| `不支持的 JSX 标签` | 使用了未导入的组件或命名空间 | 确保组件已导入且为 PascalCase |
| `事件属性必须使用表达式绑定` | 事件写了字符串值 | 改为 `{handler}` 或 `{() => ...}` |

### 运行时错误排查

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `仅可在 .tsx 源码中使用，由编译器静态展开` | 运行时调用了 hook | 确保 hook 在组件顶层调用 |
| `页面VM对象中的属性data不可与...同时存在` | 同时声明了 data 和访问性桶 | 只使用其中一种 |

## 下一步

[调试指南](09-debugging.md)
