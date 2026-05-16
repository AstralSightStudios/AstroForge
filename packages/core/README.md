# @astralsight/astroforge-core

AstroForge 用户侧 surface：JSX runtime、内置组件声明、hook 编译期标记、目标平台能力表。

## 安装

```bash
pnpm add @astralsight/astroforge-core
```

通常不需要直接安装：`@astralsight/astroforge-rsbuild-plugin` 会把它作为依赖一并拉进来。`tsconfig.json` 把 `jsxImportSource` 指向 `@astralsight/astroforge-core` 之后，TSX 源码即可使用 `<View>` / `<Text>` 等内置组件与 `useState` / `useEffect` 等 hook。

## 设计要点

- **不依赖浏览器/React 调度器**：Vela / BlueOS 等 quick-app runtime 不提供 DOM。`useState` / `useEffect` 等 hook 在源码中只是编译期标记，由 `@astralsight/astroforge-rsbuild-plugin` 在 TSX → IR 阶段静态展开为厂商 runtime 期望的 `data` / `methods` / lifecycle。运行时执行任一 hook 将抛错。
- **多入口结构**：`@astralsight/astroforge-core/components`、`@astralsight/astroforge-core/apis`、`@astralsight/astroforge-core/platform`、`@astralsight/astroforge-core/jsx-runtime` 各自暴露独立子模块，方便按需 import 与 IDE 跳转。

详见仓库根目录 `docs/ir-contract.md` 与 `docs/vela-runtime-abi.md`。

## License

MIT
