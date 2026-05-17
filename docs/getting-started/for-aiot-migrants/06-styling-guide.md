# 样式系统迁移

本文档帮助迁移者理解 AstroForge 的样式系统，以及与 UX 样式的差异。

## 样式声明方式

### 方式一：CSS 文件（推荐）

```tsx
import './index.css';
```

CSS 文件支持标准 CSS 语法的子集：

```css
.container {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.title {
  font-size: 32px;
  color: #333333;
  font-weight: bold;
}

.button {
  background-color: #1890ff;
  color: #ffffff;
  padding: 12px 24px;
  border-radius: 8px;
}

.button:active {
  background-color: #40a9ff;
}
```

### 方式二：内联 style 对象

```tsx
<View style={{ flexDirection: 'column', alignItems: 'center' }}>
  <Text style={{ fontSize: 32, color: '#333' }}>Title</Text>
</View>
```

属性名使用 camelCase，值可以是：
- 静态字面量：`{ fontSize: 32 }`
- 动态绑定：`{ color: themeColor }`
- 混合对象：`{ color: themeColor, fontSize: 16 }`

### 方式三：导出字符串（简单场景）

```tsx
export const styles = `
.container {
  flex-direction: column;
}
`;
```

## 与 UX 样式的差异

### 选择器

UX 支持类选择器、ID 选择器、标签选择器。AstroForge 同样支持，但有一些限制：

```css
/* 支持 */
.page { }
#header { }
.text-large { }

/* 支持：复合选择器 */
.page .title { }
.page.active { }

/* 不支持 */
[data-type="card"] { }     /* 属性选择器 */
:nth-child(2) { }          /* 伪类选择器 */
@media (min-width: 600px) { }  /* 媒体查询 */
```

### 属性名

UX 使用 kebab-case（如 `flex-direction`），AstroForge CSS 文件同样使用 kebab-case，但内联 style 对象使用 camelCase：

```css
/* CSS 文件 */
.container {
  flex-direction: column;
  background-color: red;
}
```

```tsx
// 内联 style
<View style={{ flexDirection: 'column', backgroundColor: 'red' }} />
```

### 单位

UX 和 AstroForge 都支持 px：

```css
/* 两者都支持 */
width: 100px;
font-size: 32px;
margin: 16px;
```

百分比也支持：

```css
width: 100%;
height: 50%;
```

### 颜色

支持的形式：

```css
color: #ff0000;
color: #f00;
color: rgb(255, 0, 0);
color: rgba(255, 0, 0, 0.5);
```

## 动态样式

### 条件类名

UX 方式：

```ux
<div class="{{isActive ? 'active' : 'normal'}}">
```

AstroForge 方式：

```tsx
<View className={isActive ? 'active' : 'normal'} />

// 或更复杂的组合
<View className={`card ${isActive ? 'card--active' : ''}`} />
```

注意：动态 `className` 在编译后生成 `classList` 闭包，运行时根据状态重新求值。

### 动态 style

```tsx
function DynamicStyleDemo() {
  const [theme, setTheme] = useState('light');

  const themeStyle = {
    backgroundColor: theme === 'light' ? '#fff' : '#000',
    color: theme === 'light' ? '#333' : '#fff',
  };

  return <View style={themeStyle}>...</View>;
}
```

对于混合静态和动态的 style 对象：

```tsx
<View style={{
  flexDirection: 'column',        // 静态
  backgroundColor: themeColor,    // 动态
  padding: 16,                    // 静态
}} />
```

编译器会将混合 style 对象拆分为：静态属性直接内联，动态属性生成模板闭包。

## 样式优先级

与标准 CSS 一样，后定义的规则覆盖先定义的规则。内联 style 优先级高于 CSS 文件中的规则。

```tsx
// CSS 文件：.text { color: black; }
// 内联 style 覆盖 CSS
<Text className="text" style={{ color: 'red' }}>红色文本</Text>
```

## 下一步

[生命周期映射](07-lifecycle-mapping.md)
