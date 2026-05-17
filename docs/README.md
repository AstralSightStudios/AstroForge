# AstroForge 文档中心

AstroForge 是一个将 React/TSX 语法编译为小米 Vela 快应用运行时代码的构建工具链。它让熟悉 React 的开发者能够使用 JSX、Hooks 和现代 TypeScript 工具链开发手表等 IoT 设备的原生应用，同时保持与官方 `aiot-toolkit` 构建产物字节级兼容。

## 文档导航

### 快速上手

根据你的背景选择合适的路径：

- [**从 aiot-toolkit / UX 迁移**](getting-started/for-aiot-migrants/01-overview.md)——如果你使用过官方快应用工具链，熟悉 `.ux` 单文件组件和原生 JS API
- [**React 开发者入门**](getting-started/for-react-developers/01-overview.md)——如果你有 React 开发经验，想了解哪些特性可用、哪些有差异

### 参考文档

- [与 React 的差异全景](reference/differences-from-react.md)
- [已知限制与注意事项](reference/limitations.md)
- [兼容性说明](reference/compatibility.md)
- [API 参考](reference/api/)

### 内部原理

- [架构总览](internals/architecture-overview.md)
- [TSX 提取器](internals/tsx-extractor.md)
- [IR 中间表示](internals/ir-format.md)
- [Vela 后端](internals/vela-backend.md)
- [打包器](internals/packager.md)
- [兼容性测试](internals/compatibility-testing.md)

## 现有技术文档

以下文档面向工具链开发者与贡献者：

- [IR 契约](ir-contract.md)——Rsbuild 插件与 Rust 后端之间的跨进程契约
- [Rsbuild 插件设计](rsbuild-plugin.md)——前端编译器的当前能力与约束
- [Vela 运行时 ABI](vela-runtime-abi.md)——产物必须遵循的运行时契约
- [Vela 后端与打包器](vela-backend-packager.md)——Rust 侧实现细节
- [运行时能力](runtime-capabilities.md)——各目标平台支持的功能矩阵
