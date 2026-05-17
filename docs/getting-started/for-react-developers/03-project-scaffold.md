# 项目脚手架（React 开发者）

## 创建新项目

```bash
astroforge create my-app
cd my-app
pnpm install
```

脚手架会创建一个预设好 Rsbuild + AstroForge 插件的项目。

## 项目结构详解

```text
my-app/
  astroforge.config.ts      # AstroForge 主配置
  rsbuild.config.ts         # 构建工具配置
  package.json
  tsconfig.json
  src/
    app.tsx                 # 应用级生命周期
    manifest.json           # 快应用元数据
    pages/                  # 页面目录
      index/
        index.tsx           # 页面组件
        index.css           # 页面样式
      settings/
        settings.tsx
    components/             # 可复用组件
      Button.tsx
      Card.tsx
    common/                 # 静态资源
      logo.png
```

### 关键文件说明

#### `src/app.tsx`

应用入口，导出一个包含生命周期方法的对象：

```tsx
export default {
  onCreate() {
    console.log('应用创建');
  },
  onDestroy() {
    console.log('应用销毁');
  },
};
```

类比 React：这相当于应用级别的 `useEffect`（挂载/卸载）。

#### `src/pages/**/*.tsx`

页面组件必须是 default export 的函数：

```tsx
import { View, Text } from '@astralsight/astroforge-core';

export default function IndexPage() {
  return (
    <View>
      <Text>首页</Text>
    </View>
  );
}
```

路由按文件路径自动生成：
- `src/pages/index/index.tsx` → `pages/index`
- `src/pages/settings/index.tsx` → `pages/settings`
- `src/pages/about.tsx` → `pages/about`

#### `src/manifest.json`

快应用的元数据配置：

```json
{
  "package": "com.example.myapp",
  "name": "my-app",
  "versionName": "1.0.0",
  "versionCode": 1,
  "icon": "/common/logo.png",
  "deviceTypeList": ["watch"],
  "features": [
    { "name": "system.router" }
  ]
}
```

## 配置详解

### astroforge.config.ts

```ts
import { defineConfig } from 'astroforge';

export default defineConfig({
  // 目标平台
  target: 'vela',
  
  // Manifest 配置（可选，也可直接写 src/manifest.json）
  manifest: {
    package: 'com.example.myapp',
    name: 'my-app',
    versionName: '1.0.0',
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: '/common/logo.png',
    deviceTypeList: ['watch'],
    features: [{ name: 'system.router' }],
  },
  
  // 签名配置（可选）
  signing: {
    release: {
      keyStore: 'sign/release/private.pem',
      cert: 'sign/release/cert.pem',
    },
  },
});
```

### rsbuild.config.ts

一般不需要修改，但如果你需要自定义构建行为：

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginAstroForge } from '@astralsight/astroforge-rsbuild-plugin';

export default defineConfig({
  plugins: [
    pluginAstroForge({
      target: 'vela',
      // cacheDir: '.astroforge',  // 自定义缓存目录
    }),
  ],
  // 可以添加其他 Rsbuild 插件或配置
});
```

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式（监听文件变更，自动构建）
pnpm dev

# 生产构建
pnpm build

# 预览构建产物
pnpm preview

# 运行测试
pnpm test
```

## 添加新页面

1. 创建 `src/pages/my-page/index.tsx`
2. 写入页面组件（必须 default export 函数）
3. 自动获得路由 `pages/my-page`

## 添加组件

1. 创建 `src/components/MyButton.tsx`
2. 定义函数组件并 export
3. 在页面中 import 使用

```tsx
// src/components/MyButton.tsx
import { Text } from '@astralsight/astroforge-core';

interface Props {
  label: string;
  onClick?: () => void;
}

export function MyButton({ label, onClick }: Props) {
  return <Text onClick={onClick}>{label}</Text>;
}
```

## 下一步

[TSX 快速上手](04-tsx-quickstart.md)
