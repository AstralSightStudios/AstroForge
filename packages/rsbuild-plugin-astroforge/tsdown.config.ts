import { defineConfig } from "tsdown";

// 编译 TSX → IR 的 Rsbuild 插件。运行在 Node 进程内，依赖 `node:fs` /
// `node:path` / `@babel/parser`；`@rsbuild/core` 与 `@astroforge/core` 作为
// 对等依赖与运行时依赖，由 tsdown 自动从 package.json 推断为 external。
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: false,
});
