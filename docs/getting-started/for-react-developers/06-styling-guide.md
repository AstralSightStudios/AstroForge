# 样式系统

本文档介绍 AstroForge 的样式系统，以及与标准 CSS/React 样式的差异。

## 样式声明方式

### CSS 文件导入

```tsx
import './index.css';
```

这是最接近标准 Web 开发的方式。CSS 文件会被提取、解析，并转换为 Vela 运行时的样式表数组。

### 内联 style 对象

```tsx
<View style={{ flexDirection: 'column', alignItems: 'center' }} />
```

属性名使用 camelCase。支持：
- 纯静态对象：`style={{ color: 'red' }}`
- 动态绑定：`style={{ color: themeColor }}`
- 混合对象：`style={{ color: themeColor, fontSize: 16 }}`

### 导出样式字符串

```tsx
export const styles = `
.container {
  flex-direction: column;
}
`;
```

适用于简单场景或动态生成样式。

## CSS 支持的特性

### 选择器

```css
/* 类选择器 */
.card { }

/* ID 选择器 */
#header { }

/* 标签选择器 */
text { }

/* 复合选择器 */
.card .title { }
.card.active { }
```

### 不支持的特性

```css
/* 属性选择器 - 不支持 */
[data-type="card"] { }

/* 伪类（除 :active 外）- 不支持 */
:hover { }
:nth-child(2) { }

/* 媒体查询 - 不支持 */
@media (min-width: 600px) { }

/* @keyframes - 部分支持 */
@keyframes slide { }
```

### 属性

支持的 CSS 属性（Vela 子集）：

| 属性 | 说明 |
|------|------|
| `width` / `height` | 尺寸 |
| `flex-direction` | `row` / `column` / `row-reverse` / `column-reverse` |
| `justify-content` | `flex-start` / `center` / `flex-end` / `space-between` / `space-around` |
| `align-items` | `flex-start` / `center` / `flex-end` / `stretch` |
| `margin` / `padding` | 支持简写和四边分离 |
| `border` | 支持简写和四边分离 |
| `background-color` | 背景色 |
| `color` | 文本颜色 |
| `font-size` | 字体大小 |
| `font-weight` | `normal` / `bold` / `100`–`900` |
| `opacity` | 透明度 |
| `position` | `relative` / `absolute` / `fixed` |
| `top` / `left` / `right` / `bottom` | 定位偏移 |
| `display` | `flex` / `none` |

## 动态样式

### 条件类名

```tsx
function Card({ active }: { active: boolean }) {
  return (
    <View className={`card ${active ? 'card--active' : ''}`}>
      ...
    </View>
  );
}
```

### 动态 style 对象

```tsx
function ThemeView({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <View style={{
      backgroundColor: theme === 'light' ? '#fff' : '#000',
      color: theme === 'light' ? '#333' : '#fff',
    }}>
      ...
    </View>
  );
}
```

## 样式优先级

与标准 CSS 一致：
1. 内联 style（最高）
2. CSS 文件中的规则（按定义顺序，后覆盖先）

## 与 React/CSS-in-JS 的对比

| 特性 | React (styled-components/Emotion) | AstroForge |
|------|-----------------------------------|------------|
| CSS-in-JS | 运行时生成 | 编译期提取 |
| 动态样式 | 运行时插值 | 模板闭包求值 |
| 嵌套选择器 | 支持 | 不支持 |
| 全局样式 | `@import` / `createGlobalStyle` | 普通 CSS 文件 |
| 主题变量 | ThemeProvider + useTheme | 模块级变量 / props |

## 下一步

[限制与注意事项](08-limitations.md)
