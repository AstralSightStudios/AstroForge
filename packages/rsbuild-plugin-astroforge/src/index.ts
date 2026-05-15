// AstroForge Rsbuild 插件入口。
//
// 职责概述（详见 README.md 与 docs/）：
// 1. 配置 Rsbuild 使用 `@astroforge/core` 的 JSX runtime；
// 2. 收集 src/pages/** 与 src/app.{ts,tsx} 作为入口；
// 3. 在 SWC/babel 转换阶段抽取每个 TSX 文件的组件树、props、hooks 调用与样式
//    引用，写入工作目录中的 IR JSON；
// 4. 调用 Rust 后端 `astroforge build --target vela`，并将其输出 ingest 回
//    Rsbuild 的 assets graph 供 dev server / packager 使用。
//
// 当前为接口占位，Phase 2 起逐步实现。

export interface AstroForgePluginOptions {
  /// 目标后端，当前仅支持 `'vela'`。
  target?: 'vela';

  /// IR / 中间产物目录。默认 `node_modules/.cache/astroforge/`。
  cacheDir?: string;
}

export function pluginAstroForge(_options: AstroForgePluginOptions = {}) {
  return {
    name: '@astroforge/rsbuild-plugin',
    setup() {
      throw new Error('@astroforge/rsbuild-plugin: 尚未实现');
    },
  };
}
