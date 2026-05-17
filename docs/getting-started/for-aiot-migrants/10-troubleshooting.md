# 迁移排错

本文档汇总从 aiot-toolkit 迁移到 AstroForge 时的常见问题和解决方案。

## 构建问题

### 问题：构建报错 "未找到 default export"

**原因**：页面文件没有 `export default function`。

**解决**：确保每个页面文件都有 default export 的函数：

```tsx
export default function Page() {
  return (...);
}
```

### 问题："不支持的 JSX 标签"

**原因**：使用了未导入的组件，或组件名不是 PascalCase。

**解决**：

```tsx
// 错误
import { view } from '@astralsight/astroforge-core';  // 小写
<View />  // 未导入

// 正确
import { View } from '@astralsight/astroforge-core';
<View />
```

### 问题："useState 初值必须是静态 JSON 字面量"

**原因**：`useState` 的初值包含动态表达式。

**解决**：使用静态字面量，或改用惰性初值：

```tsx
// 错误
const [data] = useState(fetchData());

// 正确
const [data] = useState({ default: true });
```

## 运行时问题

### 问题：页面空白

**排查步骤**：
1. 检查 `console.log` 是否有错误输出
2. 确认 JSX 返回了有效内容（不是 `undefined`）
3. 检查 `className` 对应的 CSS 是否存在

### 问题：点击无响应

**原因**：事件处理函数未正确绑定。

**解决**：

```tsx
// 错误
<Text onClick="handleClick">Click</Text>

// 正确
<Text onClick={handleClick}>Click</Text>
```

### 问题：样式不生效

**原因**：
1. CSS 文件未导入
2. 属性名使用了 kebab-case 而非 camelCase（内联 style）
3. 选择器优先级问题

**解决**：

```tsx
// 导入 CSS
import './index.css';

// 内联 style 使用 camelCase
<View style={{ flexDirection: 'column' }} />
```

## 状态问题

### 问题：状态更新后视图未更新

**原因**：直接修改了状态而非使用 setter。

**解决**：

```tsx
// 错误
function increment() {
  count++;  // 直接修改，不触发更新
}

// 正确
function increment() {
  setCount(c => c + 1);
}
```

### 问题：列表数据变更后未重新渲染

**原因**：使用了可变更新（如 `push`、`splice`）。

**解决**：使用不可变更新：

```tsx
// 错误
items.push(newItem);
setItems(items);

// 正确
setItems(prev => [...prev, newItem]);
```

## 兼容性问题

### 问题：某些 UX API 不可用

**原因**：AstroForge 只支持 Vela 桥接 API 的子集。

**解决**：查阅 [运行时能力](runtime-capabilities.md) 文档，确认目标平台支持的 API。

### 问题：manifest 字段缺失

**原因**：`astroforge.config.ts` 的 `manifest` 配置不完整。

**解决**：确保包含必需的字段：

```ts
manifest: {
  package: 'com.example.app',
  name: 'my-app',
  versionName: '1.0.0',
  versionCode: 1,
  icon: '/common/logo.png',
  deviceTypeList: ['watch'],
}
```

## 性能问题

### 问题：构建速度慢

**原因**：项目规模大，跨文件组件多。

**解决**：
1. 确保使用 pnpm 而非 npm
2. 减少不必要的组件嵌套
3. 避免在模板中使用复杂表达式

## 获取帮助

如果以上方案无法解决问题：
1. 查看 [已知限制](../reference/limitations.md)
2. 检查 [与 React 的差异](../reference/differences-from-react.md)
3. 查阅 [Vela 运行时 ABI](../vela-runtime-abi.md)
