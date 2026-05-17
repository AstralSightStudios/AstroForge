# 调试指南

本文档介绍 AstroForge 项目的调试方法和技巧。

## 日志调试

### console.log

Vela 运行时支持 `console.log`，输出可在 adb logcat 中查看：

```bash
adb logcat -s JSAPP
```

在代码中使用：

```tsx
function Page() {
  const [count, setCount] = useState(0);

  function handleClick() {
    console.log('before:', count);
    setCount(c => c + 1);
    console.log('after:', count);  // 注意：这里还是旧值（与 React 相同）
  }

  return (...);
}
```

### 多级别日志

```tsx
console.log('普通日志');
console.info('信息');
console.warn('警告');
console.error('错误');
```

## 开发模式

### Rsbuild Dev Server

```bash
pnpm dev
```

开发模式下：
- 文件变更自动触发重新编译
- 构建产物自动更新到 `dist/`
- 需要在模拟器/真机上重新安装 `.rpk` 查看效果

注意：这不是 web 的 HMR（热模块替换），因为快应用运行在设备 JS 引擎上。每次修改后需要重新安装应用。

## 产物检查

### 查看生成的 JS

构建后可在 `dist/` 目录查看生成的页面 JS：

```text
dist/
  app.js
  pages/
    index/
      index.js
```

可以阅读生成的 JS 来理解编译结果，排查问题。

### IR 检查

```bash
astroforge inspect ir node_modules/.cache/astroforge/ir-document.json
```

查看 IR（中间表示）的内容，确认组件、模板、脚本是否正确提取。

### RPK 检查

```bash
astroforge inspect rpk dist/my-app.debug.rpk
```

查看 `.rpk` 包的内容，包括文件列表、manifest、签名信息。

## 常见问题排查

### 页面空白

1. 检查是否有 `console.error` 输出
2. 确认 `export default` 存在且返回有效 JSX
3. 检查 `className` 对应的 CSS 是否被正确导入

### 样式不生效

1. 确认 CSS 文件已导入：`import './index.css'`
2. 检查属性名是否使用 camelCase（内联 style）
3. 确认选择器正确，没有被其他规则覆盖

### 事件不触发

1. 确认事件名使用驼峰：`onClick` 而非 `onclick`
2. 确认处理函数已正确传递：`onClick={handler}` 而非 `onClick="handler"`
3. 检查处理函数是否被正确编译到 `script.methods`

### 状态不更新

1. 确认使用了 setter 而非直接赋值
2. 确认更新是不可变的（数组/对象）
3. 检查是否有编译错误导致产物不完整

## 真机调试

### 开启开发者模式

1. 在手表设置中找到「关于」
2. 连续点击版本号开启开发者模式

### 通过 adb 调试

```bash
# 连接设备
adb devices

# 查看日志
adb logcat -s JSAPP

# 安装应用
adb install -r dist/my-app.debug.rpk

# 卸载应用
adb uninstall com.example.myapp
```

## 下一步

[高级特性](10-advanced-topics.md)
