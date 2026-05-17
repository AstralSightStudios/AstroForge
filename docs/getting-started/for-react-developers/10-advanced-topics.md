# 高级特性

本文档介绍 AstroForge 的高级用法和特性。

## 本地组件提取

同一文件内的 PascalCase 函数会被自动提取为本地组件：

```tsx
import { View, Text, useState } from '@astralsight/astroforge-core';

// 本地组件：与页面在同一文件
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <Text onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </Text>
  );
}

export default function Page() {
  return (
    <View>
      <Counter />
      <Counter />
    </View>
  );
}
```

编译器会自动：
1. 提取 `Counter` 为独立组件 IR
2. 在页面 IR 中记录组件导入关系
3. 生成组件注册代码

## 跨文件组件

PascalCase 的 import 会自动触发 BFS 组件加载：

```tsx
// pages/index/index.tsx
import { Button } from '../../components/Button';

export default function Page() {
  return <Button label="Click me" />;
}
```

```tsx
// components/Button.tsx
import { Text } from '@astralsight/astroforge-core';

export interface ButtonProps {
  label: string;
  onClick?: () => void;
}

export function Button({ label, onClick }: ButtonProps) {
  return <Text onClick={onClick}>{label}</Text>;
}
```

支持多种导出方式：
- `export default function Button()`
- `export function Button()`
- `export const Button = () => ...`
- `export { Button }`

## Props 类型推导

组件首参的 TypeScript 类型会被自动推导为组件 props：

```tsx
interface CardProps {
  title: string;
  subtitle?: string;
  active?: boolean;
}

function Card({ title, subtitle = '', active = false }: CardProps) {
  return (...);
}
```

生成的 IR：

```json
{
  "props": {
    "title": { "type": "String" },
    "subtitle": { "type": "String", "default": "" },
    "active": { "type": "Boolean", "default": false }
  }
}
```

支持：
- Interface
- Type alias
- 内联 type literal
- 解构默认值

## 生命周期导出

```tsx
export const lifecycle = {
  onInit() {
    console.log('init');
  },
  async onReady() {
    const data = await fetchData();
    console.log(data);
  },
  onDestroy() {
    console.log('destroy');
  },
};

export default function Page() {
  return (...);
}
```

## 应用入口

```tsx
// src/app.tsx
export default {
  onCreate() {
    console.log('app created');
  },
  onDestroy() {
    console.log('app destroyed');
  },
};
```

## 资源收集

静态资源会自动收集到构建产物：

```tsx
// 图片
<Image src="/common/logo.png" />

// CSS 中的资源
/* index.css */
.bg { background-image: url('/common/bg.png'); }
```

确保资源放在 `src/common/` 目录下。

## Manifest 配置

可以在 `astroforge.config.ts` 中配置 manifest：

```ts
export default {
  target: 'vela',
  manifest: {
    package: 'com.example.myapp',
    name: 'my-app',
    versionName: '1.0.0',
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: '/common/logo.png',
    deviceTypeList: ['watch'],
    features: [
      { name: 'system.router' },
      { name: 'system.storage' },
    ],
  },
};
```

## 下一步

继续探索 [参考文档](../reference/) 和 [内部原理](../internals/)。
