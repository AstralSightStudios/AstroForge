# 组件模型差异

本文档深入对比 UX 与 AstroForge 的组件模型，帮助迁移者理解底层差异。

## 组件定义方式

### UX 组件

UX 使用单文件组件（SFC），一个 `.ux` 文件包含模板、脚本、样式三部分：

```text
components/
  avatar-card.ux
```

```ux
<template>
  <div class="card">
    <image src="{{avatar}}" class="avatar"></image>
    <text class="name">{{name}}</text>
  </div>
</template>

<script>
export default {
  props: ['name', 'avatar'],
}
</script>

<style>
.card { flex-direction: row; align-items: center; }
.avatar { width: 64px; height: 64px; border-radius: 32px; }
.name { font-size: 28px; margin-left: 16px; }
</style>
```

### AstroForge 组件

AstroForge 使用纯函数组件，模板、逻辑、样式分离为多个文件：

```text
components/
  AvatarCard.tsx
  AvatarCard.css    # 可选
```

```tsx
import { View, Image, Text } from '@astralsight/astroforge-core';
import './AvatarCard.css';

export interface AvatarCardProps {
  name: string;
  avatar: string;
}

export function AvatarCard({ name, avatar }: AvatarCardProps) {
  return (
    <View className="card">
      <Image src={avatar} className="avatar" />
      <Text className="name">{name}</Text>
    </View>
  );
}
```

```css
.card { flex-direction: row; align-items: center; }
.avatar { width: 64px; height: 64px; border-radius: 32px; }
.name { font-size: 28px; margin-left: 16px; }
```

## Props 系统

### UX Props

UX 的 props 是运行时绑定：

```ux
<script>
export default {
  props: ['name', 'avatar'],
  // 或使用对象形式声明默认值和类型
  props: {
    name: { type: String, default: '匿名' },
    avatar: { type: String, default: '/common/default.png' }
  }
}
</script>
```

### AstroForge Props

AstroForge 的 props 来自 TypeScript 类型注解：

```tsx
interface Props {
  name: string;
  avatar?: string;
}

export function AvatarCard({ name, avatar = '/common/default.png' }: Props) {
  return (...);
}
```

编译器会自动从接口/类型别名中提取 props 定义：

```ts
// 生成的 IR
{
  "props": {
    "name": { "type": "String" },
    "avatar": { "type": "String", "default": "/common/default.png" }
  }
}
```

支持的类型推导：

| TypeScript 类型 | 运行时类型 |
|----------------|-----------|
| `string` | `String` |
| `number` | `Number` |
| `boolean` | `Boolean` |
| `T[]` / `Array<T>` | `Array` |
| `() => void` / `Function` | `Function` |
| `object` / interface | `Object` |
| `string \| undefined` | `String`（nullable） |

## 数据流

### UX 数据流

UX 采用双向绑定（模板中直接修改数据）+ 显式 `this.setData`：

```ux
<script>
export default {
  data: { count: 0 },
  increment() {
    this.count++;  // 直接修改数据，自动触发视图更新
  }
}
</script>
```

### AstroForge 数据流

AstroForge 采用单向数据流，与 React 一致：

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount(c => c + 1);  // 通过 setter 更新状态
  }

  return <Text onClick={increment}>{count}</Text>;
}
```

编译器会将 `setCount(c => c + 1)` 编译为页面 VM 上的直接赋值：

```js
// 编译后的产物
this.count = this.count + 1;
```

## 组件生命周期

### UX 生命周期

UX 页面组件有完整的生命周期：

```ux
<script>
export default {
  onInit() { },      // 初始化
  onReady() { },     // 就绪
  onShow() { },      // 显示
  onHide() { },      // 隐藏
  onDestroy() { },   // 销毁
}
</script>
```

### AstroForge 生命周期

在 AstroForge 中，生命周期通过 `export const lifecycle` 声明：

```tsx
export const lifecycle = {
  onInit() {
    console.log('页面初始化');
  },
  onReady() {
    console.log('页面就绪');
  },
  onShow() {
    console.log('页面显示');
  },
  onHide() {
    console.log('页面隐藏');
  },
  onDestroy() {
    console.log('页面销毁');
  },
};

export default function Page() {
  return (...);
}
```

注意：
- `lifecycle` 必须命名导出（named export）
- 生命周期方法不能访问组件内的 hook 状态（它们不在同一闭包）
- 如需在生命周期中使用状态，需通过页面 VM 的 `this` 访问

#### useEffect 与生命周期的关系

```tsx
import { useState, useEffect } from '@astralsight/astroforge-core';

export default function Page() {
  const [data, setData] = useState(null);

  useEffect(() => {
    console.log('等效 onReady');
    fetchData().then(setData);

    return () => {
      console.log('等效 onDestroy cleanup');
    };
  }, []);  // 空依赖数组

  return (...);
}
```

编译结果：
- `useEffect` 的函数体 → `lifecycle.onReady`
- `return` 的 cleanup 函数 → `lifecycle.onDestroy`

**限制**：`useEffect` 仅支持省略依赖数组或空数组 `[]`。非空依赖数组会导致编译错误，因为当前 IR 没有运行期依赖追踪语义。

## 组件通信

### 父子通信

UX 与 AstroForge 都通过 props 向下传递数据，通过事件向上传递：

```tsx
// 父组件
function Parent() {
  const [selected, setSelected] = useState('');

  return (
    <Child
      name="选项A"
      onSelect={(name) => setSelected(name)}
    />
  );
}

// 子组件
interface Props {
  name: string;
  onSelect?: (name: string) => void;
}

function Child({ name, onSelect }: Props) {
  return <Text onClick={() => onSelect?.(name)}>{name}</Text>;
}
```

### 跨组件状态（替代 UX 的 globalData）

UX 使用 `this.$app.$def.globalData` 共享全局状态。AstroForge 没有直接等价物，但可以使用以下方案：

**方案一：模块级状态**

```ts
// store.ts
let globalCount = 0;

export function getCount() { return globalCount; }
export function setCount(v: number) { globalCount = v; }
```

**方案二：useReducer + 事件总线**

对于复杂场景，可以使用 reducer 模式配合事件机制。

**方案三：Context（即将支持）**

AstroForge 正在实现 `createContext` / `useContext` 的静态子集。

## 组件作用域

### UX 组件作用域

UX 组件的模板、脚本、样式是强耦合的，样式自动作用于组件内部：

```ux
<style>
.title { color: red; }  /* 只作用于本组件 */
</style>
```

### AstroForge 组件作用域

AstroForge 的 CSS 默认是全局的（与标准 CSS 一致）。如果需要组件作用域样式，目前需要手动使用 BEM 命名约定：

```tsx
// AvatarCard.tsx
export function AvatarCard() {
  return <View className="avatar-card">...</View>;
}
```

```css
/* AvatarCard.css */
.avatar-card { }
.avatar-card__title { }
.avatar-card__image { }
```

未来版本可能会支持 CSS Modules 或类似的组件作用域方案。

## 下一步

[样式系统迁移](06-styling-guide.md)
