# 组件模型（与 React 的差异）

本文档深入解释 AstroForge 组件模型与标准 React 的差异。了解这些差异有助于避免常见的思维误区。

## 核心差异：没有 React 运行时

在标准 React 中：
- JSX 编译为 `React.createElement(type, props, children)`
- 运行时维护虚拟 DOM（VNode 树）
- `useState` 触发 re-render，reconciler 对比新旧 VNode 树
- 差异通过 `react-dom` 应用到真实 DOM

在 AstroForge 中：
- JSX 在**编译阶段**被提取为静态 IR（中间表示）
- 没有虚拟 DOM，没有 re-render 概念
- `useState` 在编译后变成页面 VM 的 `private_data` 字段
- Vela 运行时直接调用 `aiot.__ce__(tag, opts, children)` 创建原生节点

这意味着：

```tsx
// 这段代码在 React 中每秒钟触发一次 re-render
function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return <Text>{time.toLocaleTimeString()}</Text>;
}
```

在 AstroForge 中，这段代码编译后：
- `time` 是 VM 的 `private_data.time`
- `setTime` 不存在，被替换为 `this.time = ...`
- 模板中的 `{time.toLocaleTimeString()}` 被编译为返回 `_vm_.time.toLocaleTimeString()` 的闭包
- 每秒更新 `this.time` 后，Vela 运行时的响应式系统重新求值闭包，更新文本节点

没有 VNode diff，没有 reconciler，更新粒度是属性/文本级。

## 函数组件的约束

### 没有实例

```tsx
// 不支持 class 组件
class MyComponent extends Component { } // 错误！

// 只能使用函数组件
function MyComponent() { }
```

### 没有 ref

```tsx
// 不支持
const ref = useRef(null);
<div ref={ref} />

// 不支持 forwardRef
const FancyButton = forwardRef((props, ref) => (...));
```

如果需要访问原生节点，通常需要使用 Vela 桥接 API 或事件对象。

### 没有 Context

```tsx
// 当前版本不支持
const MyContext = createContext(defaultValue);
const value = useContext(MyContext);  // 编译错误
```

跨组件状态共享目前需要通过 props drilling 或模块级状态。

## Hooks 的编译期语义

每个 Hook 在 AstroForge 中都有明确的编译期行为：

### useState

```tsx
const [count, setCount] = useState(0);
```

编译后：
- `count` → `private_data.count = 0`
- `setCount(v)` → 在方法表中生成 `setCount` 方法，内部执行 `this.count = v`
- `setCount(prev => prev + 1)` → `this.count = this.count + 1`

**限制**：
- 初值必须是静态 JSON 字面量
- 支持 `useState(() => staticValue)` 惰性初值
- 不支持函数式更新以外的 updater 形态

### useEffect

```tsx
useEffect(() => {
  console.log('mounted');
  return () => console.log('unmounted');
}, []);
```

编译后：
- 函数体 → `lifecycle.onReady`
- cleanup → `lifecycle.onDestroy`

**限制**：
- 仅支持省略依赖或空数组 `[]`
- 不支持依赖追踪（非空数组会导致编译错误）
- 不支持在 `useEffect` 中调用其他 hook

### useRef

```tsx
const timer = useRef(null);
```

编译后：
- `timer` → `private_data.timer = { current: null }`
- `timer.current` → `this.timer.current`

**限制**：
- 初值必须是静态 JSON 字面量
- 不支持 ref callback

### useMemo

```tsx
const label = useMemo(() => `Count: ${count}`, [count]);
```

编译后：
- 函数体被内联到模板表达式中
- 模板中 `{label}` 变成内联求值的闭包

**限制**：
- 依赖数组不具备运行期重算语义
- 每次模板更新都会重新求值（与 React 的 memoization 不同）

### useCallback

```tsx
const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);
```

编译后：
- 函数体被提取为 `script.methods.handleClick`
- `handleClick` 引用被替换为 `this.handleClick`

**限制**：
- 依赖数组不具备运行期语义
- 不支持闭包捕获最新状态（每次调用使用编译期确定的作用域）

### useReducer

```tsx
const [state, dispatch] = useReducer(reducer, initialState);
```

编译后：
- `state` → `private_data.state = initialState`
- `dispatch` → 生成 `script.methods.dispatch`，内部调用 reducer 并赋值

**限制**：
- reducer 必须是模块顶层函数或标识符引用
- 不支持懒加载初始状态（`init` 函数）

## 模板表达式的限制

模板中的 JS 表达式有严格的静态可提取要求：

### 支持的表达式

```tsx
// 标识符和成员访问
<Text>{user.name}</Text>

// 算术运算
<Text>{count + 1}</Text>

// 三元表达式
<Text>{isActive ? 'Yes' : 'No'}</Text>

// 模板字符串
<Text>{`Hello, ${name}`}</Text>

// 逻辑与
<View>{show && <Text>Visible</Text>}</View>
```

### 不支持的表达式

```tsx
// 函数调用（非内置）
<Text>{formatDate(date)}</Text>  // 错误！除非 formatDate 是内联函数

// 复杂对象方法
<Text>{items.filter(i => i.active).map(...)}</Text>  // 错误！

// 临时变量
<Text>{(() => { const x = 1; return x + 2; })()}</Text>  // 错误！
```

如果需要复杂计算，应在组件函数体内预先计算，或提取为方法：

```tsx
function Page() {
  const [items] = useState([...]);

  // 推荐：在组件内计算
  const activeItems = items.filter(i => i.active);  // 但 filter 不会在编译期求值

  // 更好的方案：保持数据结构简单
  return (
    <View>
      {items.map(item => (
        item.active && <Text key={item.id}>{item.name}</Text>
      ))}
    </View>
  );
}
```

## 事件处理函数的限制

### 支持的形式

```tsx
// 1. 标识符引用
function handleClick() { }
return <Text onClick={handleClick} />;

// 2. 成员访问
const handlers = { click: () => {} };
return <Text onClick={handlers.click} />;

// 3. 内联箭头函数（简单表达式）
return <Text onClick={() => setCount(c => c + 1)} />;

// 4. 内联块体函数
return <Text onClick={() => { setCount(1); console.log('done'); }} />;
```

### 内联函数的编译

内联箭头函数会被提取为独立的方法：

```tsx
<Text onClick={() => setCount(c => c + 1)} />
```

编译后：

```js
// 生成的 script.methods
function _af_evt_1(evt) {
  this.count = this.count + 1;
}
```

```js
// 模板中的 events
{
  click: function(evt) { return _af_evt_1(evt); }
}
```

注意：内联函数中的变量引用会被正确映射到 VM 数据。

### 不支持的事件用法

```tsx
// 动态事件名
const eventName = 'onClick';
return <Text {...{ [eventName]: handler }} />;  // 不支持

// 运行时计算的处理函数
return <Text onClick={condition ? handlerA : handlerB} />;  // 可能不支持
```

## 组件 props 的限制

### 支持

```tsx
interface Props {
  title: string;
  count?: number;
  onTap?: () => void;
}

function Card({ title, count = 0, onTap }: Props) {
  return (...);
}
```

### 不支持

```tsx
// 展开 props
function Card(props) {
  return <View {...props} />;  // spread 属性受限
}

// children 作为 props（语法支持，但需谨慎）
function Card(props) {
  return <View>{props.children}</View>;
}
```

`props.children` 在模板中会被替换为 `<slot />` 元素。

## 下一步

[样式系统](07-styling-guide.md)
