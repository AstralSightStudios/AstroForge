# UX 到 TSX 语法对照

本文档提供 UX 与 TSX 的逐语法对照，帮助你快速将现有 `.ux` 文件转换为 `.tsx`。

## 基本结构

### UX 单文件组件

```ux
<template>
  <div class="page">
    <text class="title">{{title}}</text>
    <text>{{description}}</text>
  </div>
</template>

<script>
export default {
  data: {
    title: '联系人',
    description: '点击联系人查看信息'
  },
  onInit() {
    console.log('页面初始化');
  }
}
</script>

<style>
.page {
  flex-direction: column;
  align-items: center;
}
.title {
  font-size: 32px;
  color: #333333;
}
</style>
```

### TSX 等价写法

```tsx
import { View, Text, useState } from '@astralsight/astroforge-core';
import './index.css';

export const lifecycle = {
  onInit() {
    console.log('页面初始化');
  }
};

export default function IndexPage() {
  const [title] = useState('联系人');
  const [description] = useState('点击联系人查看信息');

  return (
    <View className="page">
      <Text className="title">{title}</Text>
      <Text>{description}</Text>
    </View>
  );
}
```

```css
/* index.css */
.page {
  flex-direction: column;
  align-items: center;
}
.title {
  font-size: 32px;
  color: #333333;
}
```

## 标签映射

| UX 标签 | TSX 组件 | 运行时标签 | 说明 |
|---------|---------|-----------|------|
| `div` | `View` | `div` | 通用容器 |
| `text` | `Text` | `text` | 文本 |
| `image` | `Image` | `image` | 图片 |
| `input` | `Input` | `input` | 输入框 |
| `textarea` | `Textarea` | `textarea` | 多行输入 |
| `slider` | `Slider` | `slider` | 滑块 |
| `switch` | `Switch` | `switch` | 开关 |
| `picker` | `Picker` | `picker` | 选择器 |
| `list` | `List` | `list` | 列表容器 |
| `list-item` | `ListItem` | `list-item` | 列表项 |
| `swiper` | `Swiper` | `swiper` | 轮播 |
| `progress` | `Progress` | `progress` | 进度条 |
| `canvas` | `Canvas` | `canvas` | 画布 |
| `video` | `Video` | `video` | 视频 |
| `a` | `A` | `a` | 超链接 |
| `span` | `Span` | `span` | 行内容器 |
| `label` | `Label` | `label` | 标签 |
| `select` | `Select` | `select` | 下拉选择 |
| `option` | `Option` | `option` | 选项 |
| `stack` | `Stack` | `stack` | 堆叠布局 |
| `scroll` | `Scroll` | `scroll` | 滚动容器 |
| `tabs` | `Tabs` | `tabs` | 标签页 |
| `tabbar` | `TabBar` | `tabbar` | 标签栏 |
| `tab-content` | `TabContent` | `tab-content` | 标签内容 |
| `marquee` | `Marquee` | `marquee` | 跑马灯 |
| `rich-text` | `RichText` | `richtext` | 富文本 |
| `chart` | `Chart` | `chart` | 图表 |
| `qr` / `QR` | `QR` / `Qr` | `qr` | 二维码 |
| `barcode` | `Barcode` | `barcode` | 条形码 |
| `popup` | `Popup` | `popup` | 弹窗 |
| `refresh` | `Refresh` | `refresh` | 刷新 |
| `refresh-header` | `RefreshHeader` | `refresh-header` | 刷新头 |
| `refresh-footer` | `RefreshFooter` | `refresh-footer` | 刷新尾 |
| `media` | `Media` | `media` | 媒体 |
| `screen` | `Screen` | `screen` | 屏幕 |

## 属性映射

### 通用属性

| UX | TSX | 说明 |
|----|-----|------|
| `class="foo"` | `className="foo"` | CSS 类名 |
| `style="color: red"` | `style={{ color: 'red' }}` | 内联样式 |
| `id="foo"` | `id="foo"` | 标识符 |
| `disabled="{{true}}"` | `disabled={true}` | 布尔属性 |

### 事件属性

| UX | TSX |
|----|-----|
| `onclick="handleClick"` | `onClick={handleClick}` |
| `onlongpress="onLongPress"` | `onLongPress={onLongPress}` |
| `onswipe="onSwipe"` | `onSwipe={onSwipe}` |
| `ontouchstart="onTouchStart"` | `onTouchStart={onTouchStart}` |
| `ontouchmove="onTouchMove"` | `onTouchMove={onTouchMove}` |
| `ontouchend="onTouchEnd"` | `onTouchEnd={onTouchEnd}` |

事件名遵循 React 驼峰命名规范，去除 `on` 前缀后全小写作为运行时事件名。

## 数据绑定

### 文本插值

```ux
<!-- UX -->
<text>{{user.name}}</text>
<text>{{count + 1}}</text>
```

```tsx
// TSX
<Text>{user.name}</Text>
<Text>{count + 1}</Text>
```

### 属性绑定

```ux
<!-- UX -->
<div style="color: {{themeColor}}; font-size: {{fontSize}}px">
<text value="{{user.name}}">
```

```tsx
// TSX
<View style={{ color: themeColor, fontSize }} />
<Text>{user.name}</Text>
```

注意：TSX 中的 `style` 接受对象，属性名使用 camelCase。

## 条件渲染

### UX if/elif/else

```ux
<template>
  <div if="{{isLoading}}">
    <text>加载中...</text>
  </div>
  <div elif="{{hasError}}">
    <text>出错了</text>
  </div>
  <div else>
    <text>{{content}}</text>
  </div>
</template>
```

### TSX 等价写法

```tsx
function Page() {
  const [isLoading] = useState(false);
  const [hasError] = useState(false);
  const [content] = useState('内容');

  return (
    <>
      {isLoading && (
        <View>
          <Text>加载中...</Text>
        </View>
      )}
      {!isLoading && hasError && (
        <View>
          <Text>出错了</Text>
        </View>
      )}
      {!isLoading && !hasError && (
        <View>
          <Text>{content}</Text>
        </View>
      )}
    </>
  );
}
```

也可以使用三元表达式：

```tsx
return (
  <View>
    {isLoading ? (
      <Text>加载中...</Text>
    ) : hasError ? (
      <Text>出错了</Text>
    ) : (
      <Text>{content}</Text>
    )}
  </View>
);
```

## 列表渲染

### UX for

```ux
<template>
  <div for="{{items}}" key="id">
    <text>{{$item.name}}</text>
    <text>{{$idx}}</text>
  </div>
</template>

<script>
export default {
  data: {
    items: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' }
    ]
  }
}
</script>
```

### TSX map

```tsx
import { View, Text, useState } from '@astralsight/astroforge-core';

export default function Page() {
  const [items] = useState([
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]);

  return (
    <View>
      {items.map((item, idx) => (
        <View key={item.id}>
          <Text>{item.name}</Text>
          <Text>{idx}</Text>
        </View>
      ))}
    </View>
  );
}
```

关键差异：
- TSX 使用 `map` 而非 `for`
- `key` 是 JSX 属性而非指令
- 不需要 `$item` 或 `$idx`，直接使用箭头函数参数

## 事件处理

### UX 方式

```ux
<template>
  <div onclick="handleClick">
    <text>点击我</text>
  </div>
</template>

<script>
export default {
  handleClick(evt) {
    console.log('点击了', evt.detail);
  }
}
</script>
```

### TSX 方式

```tsx
import { View, Text } from '@astralsight/astroforge-core';

export default function Page() {
  function handleClick(evt: any) {
    console.log('点击了', evt.detail);
  }

  return (
    <View onClick={handleClick}>
      <Text>点击我</Text>
    </View>
  );
}
```

内联处理函数也完全支持：

```tsx
<View onClick={() => console.log('点击')}>
  <Text>点击我</Text>
</View>
```

## 组件引用

### UX import

```ux
<!-- pages/index/index.ux -->
<import name="avatar-card" src="../../components/avatar-card.ux"></import>

<template>
  <avatar-card name="张伟" oncardtap="onCardTap"></avatar-card>
</template>
```

### TSX import

```tsx
// pages/index/index.tsx
import { AvatarCard } from '../../components/AvatarCard';

export default function Page() {
  function onCardTap(evt: any) {
    console.log('选择了', evt.detail.name);
  }

  return <AvatarCard name="张伟" onCardTap={onCardTap} />;
}
```

组件必须是 PascalCase 命名，这样编译器才能区分内置标签和自定义组件。

## Slot / 子内容

### UX slot

```ux
<!-- components/panel.ux -->
<template>
  <div class="panel">
    <text class="title">{{title}}</text>
    <slot></slot>
  </div>
</template>
```

```ux
<!-- pages/index/index.ux -->
<template>
  <panel title="设置">
    <text>这里是面板内容</text>
  </panel>
</template>
```

### TSX children

```tsx
// components/Panel.tsx
import { View, Text } from '@astralsight/astroforge-core';

interface Props {
  title: string;
  children?: any;
}

export function Panel({ title, children }: Props) {
  return (
    <View className="panel">
      <Text className="title">{title}</Text>
      {children}
    </View>
  );
}
```

```tsx
// pages/index/index.tsx
import { Panel } from '../../components/Panel';

export default function Page() {
  return (
    <Panel title="设置">
      <Text>这里是面板内容</Text>
    </Panel>
  );
}
```

在 TSX 中，`children` 就是普通的 props，与 React 完全一致。

## 下一步

[组件模型差异](05-component-model.md)
