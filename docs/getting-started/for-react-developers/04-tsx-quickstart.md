# TSX 快速上手

本文档帮助 React 开发者快速掌握 AstroForge 的 TSX 编写规范。如果你熟悉 React，大部分内容你已经会了；本节重点指出差异点和 Vela 特有的约束。

## 最小页面

```tsx
import { View, Text } from '@astralsight/astroforge-core';

export default function IndexPage() {
  return (
    <View>
      <Text>Hello, Vela!</Text>
    </View>
  );
}
```

规则：
- 必须是 `export default` 的函数
- 函数名建议以 `Page` 结尾（非强制，仅约定）
- 返回 JSX、Fragment、`null` 或 `false`

## 使用 State

```tsx
import { View, Text, useState } from '@astralsight/astroforge-core';

export default function CounterPage() {
  const [count, setCount] = useState(0);

  return (
    <View>
      <Text>Count: {count}</Text>
      <Text onClick={() => setCount(c => c + 1)}>+1</Text>
    </View>
  );
}
```

与 React 的区别：
- `setCount(c => c + 1)` 在编译后变成 `this.count = this.count + 1`
- 没有 batching，每次 `setCount` 立即触发更新
- `useState` 的初值必须是**静态 JSON 字面量**（见限制说明）

## 条件渲染

```tsx
function StatusPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <View>
      {isLoading && <Text>Loading...</Text>}
      {!isLoading && error && <Text>Error: {error}</Text>}
      {!isLoading && !error && <Text>Ready</Text>}
    </View>
  );
}
```

支持的形式：
- `condition && <Element />`
- `condition ? <A /> : <B />`
- 嵌套三元

不支持 `if` 语句（编译期无法静态提取）。

## 列表渲染

```tsx
import { View, Text, useState } from '@astralsight/astroforge-core';

interface Item {
  id: string;
  name: string;
}

export default function ListPage() {
  const [items] = useState<Item[]>([
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ]);

  return (
    <View>
      {items.map((item, index) => (
        <View key={item.id}>
          <Text>{item.name}</Text>
          <Text>Index: {index}</Text>
        </View>
      ))}
    </View>
  );
}
```

约束：
- 必须是 `array.map((item, index) => ...)` 形式
- `item` 参数必须是标识符
- `index` 参数可选，也必须是标识符
- `key` 属性必须写在最外层 JSX 元素上

## 事件处理

```tsx
function EventDemo() {
  const [count, setCount] = useState(0);

  // 命名函数
  function handleClick() {
    setCount(c => c + 1);
  }

  return (
    <View>
      <Text onClick={handleClick}>Named handler</Text>
      
      {/* 内联箭头函数 */}
      <Text onClick={() => setCount(0)}>Inline reset</Text>
      
      {/* 带参数 */}
      <Text onClick={() => console.log('clicked')}>Log</Text>
    </View>
  );
}
```

事件名对照：

| React/Web | AstroForge | 运行时事件名 |
|-----------|-----------|-------------|
| `onClick` | `onClick` | `click` |
| `onLongPress` | `onLongPress` | `longpress` |
| `onTouchStart` | `onTouchStart` | `touchstart` |
| `onTouchMove` | `onTouchMove` | `touchmove` |
| `onTouchEnd` | `onTouchEnd` | `touchend` |
| `onSwipe` | `onSwipe` | `swipe` |
| `onFocus` | `onFocus` | `focus` |
| `onBlur` | `onBlur` | `blur` |

## 样式

### CSS 文件

```tsx
import './index.css';
```

```css
.container {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.title {
  font-size: 32px;
  color: #333333;
}
```

### 内联样式对象

```tsx
<View style={{ flexDirection: 'column', alignItems: 'center' }}>
  <Text style={{ fontSize: 32, color: '#333' }}>Title</Text>
</View>
```

注意属性名使用 camelCase。

### 动态样式

```tsx
function DynamicStyleDemo() {
  const [active, setActive] = useState(false);

  return (
    <View style={{
      backgroundColor: active ? 'red' : 'blue',
      padding: 16,
    }}>
      <Text onClick={() => setActive(!active)}>Toggle</Text>
    </View>
  );
}
```

混合静态与动态的 style 对象也会被正确处理。

## Fragment

```tsx
import { Fragment, Text } from '@astralsight/astroforge-core';

export default function FragmentDemo() {
  return (
    <Fragment>
      <Text>A</Text>
      <Text>B</Text>
    </Fragment>
  );
}
```

或使用短语法：

```tsx
export default function FragmentDemo() {
  return (
    <>
      <Text>A</Text>
      <Text>B</Text>
    </>
  );
}
```

Fragment 在编译后不会生成运行时节点，只保留子元素。

## 空渲染

```tsx
function EmptyDemo() {
  const [show] = useState(false);

  if (!show) {
    return null;  // 或 return false;
  }

  return <Text>Visible</Text>;
}
```

`null` 和 `false` 在模板中表示空节点。

## 下一步

[Hooks 使用指南](05-hooks-guide.md)
