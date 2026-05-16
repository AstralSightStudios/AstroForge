import { defineConfig } from "tsdown";

// `@astralsight/astroforge-core` 是用户源码侧 surface：JSX runtime / 组件声明 / hook 编译期
// 标记 / 平台能力表。所有入口都按多文件 ESM 形态发布，保留 source-level 的
// 子模块结构，避免下游 `import { ... } from "@astralsight/astroforge-core/platform"` 形态
// 被打包合成同一个 chunk。
export default defineConfig({
  entry: {
    index: "src/index.ts",
    components: "src/components.ts",
    apis: "src/apis.ts",
    platform: "src/platform.ts",
    hooks: "src/hooks.ts",
    "jsx-runtime": "src/jsx-runtime.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  sourcemap: false,
});
