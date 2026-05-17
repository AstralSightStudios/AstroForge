# 项目脚手架（aiot-toolkit 迁移者）

## 创建新项目

AstroForge 提供脚手架工具快速创建项目：

```bash
astroforge create my-app
cd my-app
pnpm install
```

## 项目结构

创建后的项目结构：

```text
my-app/
  astroforge.config.ts      # AstroForge 配置
  rsbuild.config.ts         # Rsbuild 构建配置
  package.json
  tsconfig.json
  src/
    app.tsx                 # 应用入口（替代 app.ux）
    manifest.json           # 快应用配置
    pages/
      index/
        index.tsx           # 首页
        index.css           # 页面样式
    components/             # 公共组件
    common/                 # 公共资源
```

## 与 aiot-toolkit 项目结构对比

| aiot-toolkit | AstroForge | 说明 |
|-------------|------------|------|
| `app.ux` | `src/app.tsx` | 应用入口，导出生命周期对象 |
| `pages/**/*.ux` | `src/pages/**/*.tsx` | 页面入口 |
| `pages/**/*.css` | `src/pages/**/*.css` | 页面样式（可选） |
| `components/**/*.ux` | `src/components/**/*.tsx` | 组件 |
| `manifest.json` | `src/manifest.json` | 配置不变 |
| `common/` | `src/common/` | 公共资源 |

## 配置说明

### astroforge.config.ts

```ts
import { defineConfig } from 'astroforge';

export default defineConfig({
  target: 'vela',
  manifest: {
    package: 'com.example.myapp',
    name: 'my-app',
    versionName: '1.0.0',
    versionCode: 1,
    icon: '/common/logo.png',
    deviceTypeList: ['watch'],
    features: [
      { name: 'system.router' },
    ],
  },
});
```

`manifest` 字段的内容会直接写入 `manifest.json`。你可以在 `src/manifest.json` 中直接编写，也可以通过 `astroforge.config.ts` 的 `manifest` 字段生成。

### rsbuild.config.ts

通常不需要修改。AstroForge 插件会自动配置：

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginAstroForge } from '@astralsight/astroforge-rsbuild-plugin';

export default defineConfig({
  plugins: [
    pluginAstroForge({
      target: 'vela',
    }),
  ],
});
```

## 运行项目

### 开发模式

```bash
pnpm dev
# 或
astroforge dev
```

这会启动 Rsbuild dev server，并在文件变更时自动重新构建 `.rpk`。

### 构建

```bash
pnpm build
# 或
astroforge build
```

### 预览

```bash
astroforge preview
```

## 迁移现有 aiot-toolkit 项目

如果你有一个现有的 aiot-toolkit 项目，建议按以下步骤迁移：

1. **保留 `manifest.json`** —— 配置完全兼容
2. **创建 `astroforge.config.ts`** —— 引用现有 manifest
3. **逐个转换页面** —— 从最简单的页面开始
4. **迁移样式** —— 将 UX 中的 `<style>` 提取为 `.css` 文件
5. **调整生命周期** —— 将 UX 生命周期方法转换为 `lifecycle` 导出

## 下一步

[UX 到 TSX 语法对照](04-from-ux-to-tsx.md)
