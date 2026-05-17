# 内置组件参考

本文档列出所有从 `@astralsight/astroforge-core` 导入的 Vela 内置组件及其属性。

## 容器组件

### View

通用容器，映射为 Vela `div`。

```tsx
import { View } from '@astralsight/astroforge-core';

<View
  className="container"
  style={{ flexDirection: 'column' }}
>
  {children}
</View>
```

### Stack

堆叠布局容器。

```tsx
import { Stack } from '@astralsight/astroforge-core';

<Stack>
  <Text>Layer 1</Text>
  <Text>Layer 2</Text>
</Stack>
```

### Scroll

滚动容器。

```tsx
import { Scroll } from '@astralsight/astroforge-core';

<Scroll scrollY={true}>
  <Text>Content</Text>
</Scroll>
```

## 文本组件

### Text

文本组件，映射为 Vela `text`。

```tsx
import { Text } from '@astralsight/astroforge-core';

<Text className="title">Hello</Text>
```

### Span

行内文本容器。

```tsx
import { Span } from '@astralsight/astroforge-core';

<Span>Inline text</Span>
```

### RichText

富文本组件。

```tsx
import { RichText } from '@astralsight/astroforge-core';

<RichText type="html" content="<b>Bold</b> text" />
```

## 媒体组件

### Image

图片组件，映射为 Vela `image`。

```tsx
import { Image } from '@astralsight/astroforge-core';

<Image src="/common/logo.png" style={{ width: 100, height: 100 }} />
```

### ImageAnimator

帧动画组件。

```tsx
import { ImageAnimator } from '@astralsight/astroforge-core';

<ImageAnimator
  images={[{ src: '/common/frame1.png' }, { src: '/common/frame2.png' }]}
  duration="500"
/>
```

### Video

视频组件。

```tsx
import { Video } from '@astralsight/astroforge-core';

<Video src="/common/video.mp4" autoplay={false} />
```

## 表单组件

### Input

输入框。

```tsx
import { Input } from '@astralsight/astroforge-core';

<Input
  type="text"
  placeholder="请输入"
  value={name}
  onChange={(evt: any) => setName(evt.value)}
/>
```

### Textarea

多行输入。

```tsx
import { Textarea } from '@astralsight/astroforge-core';

<Textarea
  placeholder="请输入内容"
  value={content}
  onChange={(evt: any) => setContent(evt.value)}
/>
```

### Switch

开关组件。

```tsx
import { Switch } from '@astralsight/astroforge-core';

<Switch checked={enabled} onChange={(evt: any) => setEnabled(evt.checked)} />
```

### Slider

滑块组件。

```tsx
import { Slider } from '@astralsight/astroforge-core';

<Slider min={0} max={100} value={progress} />
```

### Picker

选择器。

```tsx
import { Picker } from '@astralsight/astroforge-core';

<Picker type="text" range={['A', 'B', 'C']} value={selected} />
```

### Select / Option

下拉选择。

```tsx
import { Select, Option } from '@astralsight/astroforge-core';

<Select value={value} onChange={(evt: any) => setValue(evt.value)}>
  <Option value="a">Option A</Option>
  <Option value="b">Option B</Option>
</Select>
```

## 列表组件

### List

列表容器。

```tsx
import { List } from '@astralsight/astroforge-core';

<List>
  {items.map(item => (
    <ListItem key={item.id} type="item">
      <Text>{item.name}</Text>
    </ListItem>
  ))}
</List>
```

### ListItem

列表项。

```tsx
import { ListItem } from '@astralsight/astroforge-core';

<ListItem type="item">
  <Text>Item content</Text>
</ListItem>
```

## 导航组件

### Tabs / TabBar / TabContent

标签页。

```tsx
import { Tabs, TabBar, TabContent } from '@astralsight/astroforge-core';

<Tabs index={activeTab}>
  <TabBar>
    <Text>Tab 1</Text>
    <Text>Tab 2</Text>
  </TabBar>
  <TabContent>
    <View><Text>Content 1</Text></View>
    <View><Text>Content 2</Text></View>
  </TabContent>
</Tabs>
```

## 其他组件

### A

超链接。

```tsx
import { A } from '@astralsight/astroforge-core';

<A href="https://example.com">Link</A>
```

### Progress

进度条。

```tsx
import { Progress } from '@astralsight/astroforge-core';

<Progress percent={50} type="horizontal" />
```

### Marquee

跑马灯。

```tsx
import { Marquee } from '@astralsight/astroforge-core';

<Marquee loop="-1" scrollamount="10">滚动文本</Marquee>
```

### Popup

弹窗。

```tsx
import { Popup } from '@astralsight/astroforge-core';

<Popup visible={showPopup} onClick={() => setShowPopup(false)}>
  <Text>Popup content</Text>
</Popup>
```

### QR / Qr

二维码。

```tsx
import { QR } from '@astralsight/astroforge-core';

<QR value="https://example.com" />
```

### Barcode

条形码。

```tsx
import { Barcode } from '@astralsight/astroforge-core';

<Barcode value="123456789" />
```

### Chart

图表。

```tsx
import { Chart } from '@astralsight/astroforge-core';

<Chart type="line" data={chartData} options={options} />
```

### Canvas

画布。

```tsx
import { Canvas } from '@astralsight/astroforge-core';

<Canvas id="myCanvas" style={{ width: 200, height: 200 }} />
```

## 完整标签映射表

| TSX 组件 | Vela 标签 |
|---------|----------|
| `A` | `a` |
| `Barcode` | `barcode` |
| `Canvas` | `canvas` |
| `Chart` | `chart` |
| `View` / `Div` | `div` |
| `Text` | `text` |
| `Image` | `image` |
| `ImageAnimator` | `image-animator` |
| `Input` | `input` |
| `Label` | `label` |
| `List` | `list` |
| `ListItem` | `list-item` |
| `Marquee` | `marquee` |
| `Media` | `media` |
| `Option` | `option` |
| `Picker` | `picker` |
| `Popup` | `popup` |
| `Progress` | `progress` |
| `Prompt` | `prompt` |
| `QR` / `Qr` | `qr` |
| `Rating` | `rating` |
| `Refresh` | `refresh` |
| `RefreshFooter` | `refresh-footer` |
| `RefreshHeader` | `refresh-header` |
| `RichText` | `richtext` |
| `Screen` | `screen` |
| `Scroll` | `scroll` |
| `Select` | `select` |
| `Slider` | `slider` |
| `Span` | `span` |
| `Stack` | `stack` |
| `Swiper` | `swiper` |
| `Switch` | `switch` |
| `TabContent` | `tab-content` |
| `TabBar` | `tabbar` |
| `Tabs` | `tabs` |
| `Textarea` | `textarea` |
| `Video` | `video` |
