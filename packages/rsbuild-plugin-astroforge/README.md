# @astralsight/astroforge-rsbuild-plugin

AstroForge 的 [Rsbuild](https://rsbuild.dev/) 插件：在 TSX 源码与厂商 quick-app runtime（小米 Vela / vivo BlueOS 等）之间生成跨进程 IR 契约（`docs/ir-document.schema.json`）。

## 安装

```bash
pnpm add -D @astralsight/astroforge-rsbuild-plugin @rsbuild/core
pnpm add @astralsight/astroforge-core
```

## 使用

```ts
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { pluginAstroForge } from "@astralsight/astroforge-rsbuild-plugin";

export default defineConfig({
  plugins: [pluginAstroForge({ target: "vela" })],
});
```

插件会在 `onBeforeBuild` / `onBeforeDevCompile` 阶段：

1. 扫描 `src/pages/**` 发现页面入口；
2. 解析 TSX，把节点 / 属性 / 事件 / 列表 / 条件 / 生命周期 / `useState` / `useEffect` 等下沉到 IR；
3. BFS 加载相对路径 import 的子组件；
4. 收集图片 / 字体等静态资源；
5. 在 `node_modules/.cache/astroforge/ir-document.json` 写出统一 IR，供下游 `astroforge` Rust CLI 消费。

## 配置

```ts
pluginAstroForge({
  target: "vela", // 仅支持 "vela"
  cacheDir: "node_modules/.cache/astroforge",
  root: undefined, // 默认取 Rsbuild context.rootPath
  configFile: "astroforge.config.ts",
  outFile: undefined, // 显式 IR 输出路径，优先级高于 cacheDir
});
```

## License

MIT
