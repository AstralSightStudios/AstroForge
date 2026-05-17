# 状态与逻辑迁移

本文档帮助迁移者将 UX 的数据管理和业务逻辑转换为 AstroForge 的 Hooks 模式。

## 数据声明对照

### UX data 对象

```ux
<script>
export default {
  data: {
    title: '联系人',
    list: [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ],
    count: 0
  }
}
</script>
```

### AstroForge useState

```tsx
import { useState } from '@astralsight/astroforge-core';

export default function Page() {
  const [title] = useState('联系人');
  const [list] = useState([
    { name: 'Alice', age: 25 },
    { name: 'Bob', age: 30 }
  ]);
  const [count, setCount] = useState(0);

  return (...);
}
```

## 数据更新对照

### UX 直接修改

```ux
<script>
export default {
  data: { count: 0 },
  increment() {
    this.count++;
  },
  setTitle(newTitle) {
    this.title = newTitle;
  }
}
</script>
```

### AstroForge setter

```tsx
function Page() {
  const [count, setCount] = useState(0);
  const [title, setTitle] = useState('');

  function increment() {
    setCount(c => c + 1);
  }

  function setTitleHandler(newTitle: string) {
    setTitle(newTitle);
  }

  return (...);
}
```

## 计算属性

### UX 计算属性

UX 没有内置计算属性，通常在 `onInit` 或模板中直接计算：

```ux
<template>
  <text>{{firstName + ' ' + lastName}}</text>
</template>
```

### AstroForge useMemo

```tsx
import { useMemo, useState } from '@astralsight/astroforge-core';

function Page() {
  const [firstName] = useState('张');
  const [lastName] = useState('伟');

  const fullName = useMemo(() => `${firstName} ${lastName}`, []);

  return <Text>{fullName}</Text>;
}
```

注意：`useMemo` 在 AstroForge 中没有缓存语义，每次模板更新都会重新求值。它主要用于将复杂表达式提取到变量中，提高代码可读性。

## 数据监听（watch）

### UX 方式

UX 没有内置 watch，通常通过事件或手动调用处理：

```ux
<script>
export default {
  data: { count: 0 },
  increment() {
    this.count++;
    this.onCountChanged(this.count);
  },
  onCountChanged(newCount) {
    console.log('count changed:', newCount);
  }
}
</script>
```

### AstroForge 方式

由于 AstroForge 不支持依赖追踪，watch 需要手动实现：

```tsx
function Page() {
  const [count, setCount] = useState(0);

  function increment() {
    const newCount = count + 1;
    setCount(newCount);
    onCountChanged(newCount);
  }

  function onCountChanged(newCount: number) {
    console.log('count changed:', newCount);
  }

  return (...);
}
```

## 全局状态

### UX globalData

```ux
<!-- app.ux -->
<script>
export default {
  globalData: {
    theme: 'light'
  }
}
</script>

<!-- pages/index/index.ux -->
<script>
export default {
  onInit() {
    const theme = this.$app.$def.globalData.theme;
    console.log(theme);
  }
}
</script>
```

### AstroForge 模块级状态

```ts
// store.ts
let globalTheme = 'light';

export function getTheme() { return globalTheme; }
export function setTheme(theme: string) { globalTheme = theme; }
```

```tsx
// pages/index/index.tsx
import { getTheme } from '../../store';

export default function Page() {
  const theme = getTheme();

  return <Text>当前主题: {theme}</Text>;
}
```

## 列表数据操作

### UX 数组操作

```ux
<script>
export default {
  data: {
    items: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' }
    ]
  },
  addItem() {
    this.items.push({ id: 3, name: 'C' });
  },
  removeItem(index) {
    this.items.splice(index, 1);
  }
}
</script>
```

### AstroForge 不可变更新

```tsx
import { useState } from '@astralsight/astroforge-core';

interface Item {
  id: number;
  name: string;
}

export default function Page() {
  const [items, setItems] = useState<Item[]>([
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]);

  function addItem() {
    setItems(prev => [...prev, { id: prev.length + 1, name: 'C' }]);
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  return (...);
}
```

## 表单处理

### UX 表单

```ux
<template>
  <input type="text" value="{{name}}" onchange="onNameChange">
  <text>{{name}}</text>
</template>

<script>
export default {
  data: { name: '' },
  onNameChange(evt) {
    this.name = evt.value;
  }
}
</script>
```

### AstroForge 表单

```tsx
import { View, Text, Input, useState } from '@astralsight/astroforge-core';

export default function FormPage() {
  const [name, setName] = useState('');

  return (
    <View>
      <Input
        type="text"
        value={name}
        onChange={(evt: any) => setName(evt.value)}
      />
      <Text>{name}</Text>
    </View>
  );
}
```

## 下一步

[RPK 打包与发布](09-rpk-packaging.md)
