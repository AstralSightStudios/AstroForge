# 环境准备（React 开发者）

## 前置要求

### Node.js

需要 Node.js **18.0.0** 或更高版本：

```bash
node -v
```

### 包管理器

推荐使用 pnpm：

```bash
npm install -g pnpm
```

## 安装 AstroForge CLI

```bash
npm install -g astroforge
# 或
pnpm add -g astroforge
```

验证安装：

```bash
astroforge --version
```

## IDE 配置

### VS Code

推荐安装以下扩展：

- **ESLint**
- **Prettier - Code: formatter**
- **TypeScript Importer**

### TypeScript 配置

项目 `tsconfig.json` 的关键差异点（与标准 React 项目对比）：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@astralsight/astroforge-core",
    "strict": true,
    "noEmit": true
  }
}
```

**重点**：`"jsxImportSource": "@astralsight/astroforge-core"` 告诉 TypeScript 编译器从 AstroForge 核心库导入 JSX 运行时函数，而不是 `react`。这意味着：

- `View`、`Text` 等内置组件从 `@astralsight/astroforge-core` 导入
- JSX 不会被转换为 `React.createElement`，而是被 Rsbuild 插件在编译阶段直接提取为 IR

## Vela 运行环境

### 模拟器

下载并安装小米 Vela 模拟器（与官方快应用开发相同）。AstroForge 构建的 `.rpk` 可直接在模拟器中运行。

### 真机

需要支持快应用的小米/Redmi 手表设备。通过小米运动健康 App 或 adb 安装构建产物。

## 构建产物位置

```bash
astroforge build
# 产物输出到：
# dist/<package>.debug.rpk    （开发构建）
# dist/<package>.release.rpk  （生产构建）
```

## 调试工具

### 日志

Vela 运行时支持 `console.log`，日志可通过 adb 查看：

```bash
adb logcat -s JSAPP
```

### 开发服务器

```bash
astroforge dev
```

启动 Rsbuild dev server，文件变更时自动重新编译。注意：由于快应用运行在设备/模拟器上，HMR 是重新编译 + 重新安装，不是 web 的局部热更新。

## 下一步

[项目脚手架](03-project-scaffold.md)
