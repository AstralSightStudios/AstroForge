# Hooks API 参考

本文档详细说明 AstroForge 支持的每个 Hook 的签名、行为、限制和编译后形态。

## useState

```ts
function useState<T>(initialValue: T): [T, (updater: T | ((prev: T) => T)) => void];
function useState<T>(initialValue: () => T): [T, (updater: T | ((prev: T) => T)) => void];
```

### 行为

声明一个状态变量和更新函数。编译后，状态变量成为页面 VM 的 `private_data` 字段，setter 成为 VM 方法。

### 限制

- `initialValue` 必须是静态 JSON 字面量，或返回静态 JSON 字面量的工厂函数
- 不支持运行时条件/循环中调用
- updater 函数必须是单表达式箭头函数

### 示例

```tsx
const [count, setCount] = useState(0);
const [user, setUser] = useState({ name: '', age: 0 });
const [items, setItems] = useState(() => []);
```

### 编译后形态

```tsx
const [count, setCount] = useState(0);
```

生成：

```js
// private_data
count: 0

// script.methods
setCount: function(value) { this.count = value; }
// 或
setCount: function(fn) { this.count = fn(this.count); }
```

## useEffect

```ts
function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
```

### 行为

注册副作用函数和清理函数。编译后映射到 Vela 生命周期 `onReady` 和 `onDestroy`。

### 限制

- `deps` 只能省略或为 `[]`
- 非空 `deps` 导致编译错误
- effect 函数中不能调用其他 hook

### 示例

```tsx
useEffect(() => {
  const id = setInterval(() => {}, 1000);
  return () => clearInterval(id);
}, []);
```

### 编译后形态

```js
// lifecycle.onReady
function onReady() {
  var id = setInterval(function() {}, 1000);
}

// lifecycle.onDestroy
function onDestroy() {
  clearInterval(id);
}
```

## useRef

```ts
function useRef<T>(initialValue: T): { current: T };
```

### 行为

创建一个可变引用对象。编译后成为 VM 数据中的 `{ current: ... }`。

### 限制

- `initialValue` 必须是静态 JSON 字面量
- 不支持 ref callback
- 不支持 DOM ref（因为没有 DOM）

### 示例

```tsx
const timerRef = useRef<number | null>(null);
```

### 编译后形态

```js
// private_data
timerRef: { current: null }

// 访问
timerRef.current → this.timerRef.current
```

## useMemo

```ts
function useMemo<T>(factory: () => T, deps: readonly any[]): T;
```

### 行为

将计算逻辑内联到模板表达式中。

### 限制

- `deps` 不具备运行期语义
- 每次模板更新都会重新求值
- 工厂函数必须返回可静态分析的表达式

### 示例

```tsx
const doubled = useMemo(() => items.map(i => i * 2), []);
```

### 编译后形态

模板中的 `{doubled}` 被替换为内联表达式闭包，不生成单独的方法。

## useCallback

```ts
function useCallback<T extends Function>(callback: T, deps: readonly any[]): T;
```

### 行为

将回调函数提取为 VM 方法。

### 限制

- `deps` 不具备运行期语义
- 不支持闭包捕获最新状态

### 示例

```tsx
const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);
```

### 编译后形态

```js
// script.methods
handleClick: function() {
  this.count = this.count + 1;
}
```

## useReducer

```ts
function useState<T, A>(reducer: (state: T, action: A) => T, initialState: T): [T, (action: A) => void];
```

### 行为

声明 reducer 状态。编译后生成 state 数据字段和 dispatch 方法。

### 限制

- reducer 必须是模块顶层函数或标识符引用
- 不支持 `init` 函数（第三个参数）
- dispatch 中的 action 必须是静态可分析的

### 示例

```tsx
const [state, dispatch] = useReducer(reducer, { count: 0 });
```

### 编译后形态

```js
// private_data
state: { count: 0 }

// script.methods
dispatch: function(action) {
  this.state = reducer(this.state, action);
}
```

## useId

```ts
function useId(): string;
```

### 行为

生成唯一的稳定标识符。

### 示例

```tsx
const id = useId();
// 编译后: id = "__af_id_1"
```

### 编译后形态

生成固定字符串 `__af_id_{n}`，n 按调用顺序递增。
