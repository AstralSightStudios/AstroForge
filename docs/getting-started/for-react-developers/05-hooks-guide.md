# Hooks 使用指南

本文档面向 React 开发者，详细介绍 AstroForge 中每个 Hook 的行为、限制和最佳实践。

## useState

### 基本用法

```tsx
import { useState } from '@astralsight/astroforge-core';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <Text onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </Text>
  );
}
```

### 限制

- 初值必须是**静态 JSON 字面量**：

```tsx
// 正确
const [a] = useState(0);
const [b] = useState('hello');
const [c] = useState([1, 2, 3]);
const [d] = useState({ name: 'test' });

// 错误
const [e] = useState(new Date());        // 对象构造
const [f] = useState(Math.random());     // 运行时计算
const [g] = useState(someVariable);      // 变量引用
```

- 支持惰性初值：

```tsx
const [data] = useState(() => computeInitialValue());
```

但 `computeInitialValue` 的函数体必须在编译期可静态分析，最终返回静态 JSON。

### 编译后行为

```tsx
const [count, setCount] = useState(0);
```

编译为：
- `private_data.count = 0`
- `setCount(1)` → `this.count = 1`
- `setCount(c => c + 1)` → `this.count = this.count + 1`

## useEffect

### 基本用法

```tsx
import { useEffect } from '@astralsight/astroforge-core';

function Timer() {
  useEffect(() => {
    const id = setInterval(() => console.log('tick'), 1000);
    return () => clearInterval(id);
  }, []);

  return <Text>Timer</Text>;
}
```

### 限制

- 仅支持省略依赖或空数组 `[]`：

```tsx
// 正确
useEffect(() => { ... });        // 省略依赖
useEffect(() => { ... }, []);    // 空数组

// 错误
useEffect(() => { ... }, [count]);  // 非空依赖数组
```

- 不支持在 `useEffect` 中调用其他 hook

### 编译后行为

- 函数体 → `lifecycle.onReady`
- cleanup → `lifecycle.onDestroy`

## useRef

### 基本用法

```tsx
import { useRef } from '@astralsight/astroforge-core';

function Timer() {
  const intervalRef = useRef<number | null>(null);

  function start() {
    intervalRef.current = setInterval(() => {}, 1000);
  }

  function stop() {
    clearInterval(intervalRef.current!);
    intervalRef.current = null;
  }

  return (...);
}
```

### 限制

- 初值必须是静态 JSON 字面量
- 不支持 ref callback 或 DOM ref（因为没有 DOM）

### 编译后行为

```tsx
const timer = useRef(null);
```

编译为：
- `private_data.timer = { current: null }`
- `timer.current` → `this.timer.current`

## useMemo

### 基本用法

```tsx
import { useMemo, useState } from '@astralsight/astroforge-core';

function List() {
  const [items] = useState([1, 2, 3, 4, 5]);

  const doubled = useMemo(() => items.map(i => i * 2), []);

  return (
    <View>
      {doubled.map(n => <Text key={n}>{n}</Text>)}
    </View>
  );
}
```

### 限制

- 依赖数组不具备运行期重算语义
- 每次模板更新都会重新求值（不像 React 有缓存）
- 函数体必须返回可静态分析的表达式

### 编译后行为

`useMemo` 的函数体被内联到模板表达式中，不生成单独的方法。

## useCallback

### 基本用法

```tsx
import { useCallback, useState } from '@astralsight/astroforge-core';

function Parent() {
  const [count, setCount] = useState(0);

  const increment = useCallback(() => {
    setCount(c => c + 1);
  }, []);

  return <Child onClick={increment} />;
}
```

### 编译后行为

```tsx
const increment = useCallback(() => {
  setCount(c => c + 1);
}, []);
```

编译为：
- `script.methods.increment = function increment() { this.count = this.count + 1; }`
- `onClick={increment}` → `events: { click: { path: 'increment', is_callable: true } }`

## useReducer

### 基本用法

```tsx
import { useReducer } from '@astralsight/astroforge-core';

interface State {
  count: number;
}

type Action = { type: 'inc' } | { type: 'dec' } | { type: 'add'; payload: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'inc': return { count: state.count + 1 };
    case 'dec': return { count: state.count - 1 };
    case 'add': return { count: state.count + action.payload };
    default: return state;
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0 });

  return (
    <View>
      <Text>{state.count}</Text>
      <Text onClick={() => dispatch({ type: 'inc' })}>+</Text>
      <Text onClick={() => dispatch({ type: 'dec' })}>-</Text>
    </View>
  );
}
```

### 限制

- reducer 必须是模块顶层函数或标识符引用
- 不支持 `init` 函数（第三个参数）
- `dispatch` 调用中的 action 对象必须是静态可分析的

### 编译后行为

```tsx
const [state, dispatch] = useReducer(reducer, { count: 0 });
```

编译为：
- `private_data.state = { count: 0 }`
- `script.methods.dispatch`：

```js
function dispatch(action) {
  this.state = reducer(this.state, action);
}
```

## useId

### 基本用法

```tsx
import { useId } from '@astralsight/astroforge-core';

function Form() {
  const id = useId();

  return <Text id={id}>Label</Text>;
}
```

### 编译后行为

生成固定字符串：
- 第一个 `useId()` → `__af_id_1`
- 第二个 `useId()` → `__af_id_2`
- 依此类推

## 不支持的标准 React Hooks

以下 Hooks 在 AstroForge 中不可用：

- `useContext`（没有 Context 运行时）
- `useLayoutEffect`（没有 DOM）
- `useImperativeHandle`（没有 ref 转发）
- `useDebugValue`（没有 DevTools）
- `useTransition`（没有并发特性）
- `useDeferredValue`（没有并发特性）
- `useSyncExternalStore`（没有外部 store 概念）
- `useInsertionEffect`（没有 CSS-in-JS 运行时）

## 下一步

[限制与注意事项](08-limitations.md)
