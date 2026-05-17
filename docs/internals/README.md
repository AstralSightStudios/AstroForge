# 内部原理文档

本文档索引 AstroForge 内部实现的相关文档，面向工具链开发者与贡献者。

## 文档导航

### 架构与设计

- [架构总览](architecture-overview.md)——完整编译管线的数据流与模块职责
- [IR 中间表示](ir-format.md)——三层 IR 的数据结构、序列化规则与跨进程契约

### 前端编译器

- [TSX 提取器](tsx-extractor.md)——AST → IR 的详细转换逻辑

### Rust 后端

- [Vela 后端](vela-backend.md)——lower 与 emit 的实现细节
- [打包器](packager.md)——ZIP 打包、文件排序与 V2 签名

### 测试

- [兼容性测试](compatibility-testing.md)——fixture 体系与 diff 工具

## 现有技术文档

以下文档位于 `docs/` 根目录，面向所有需要理解契约的开发者：

- [IR 契约](../ir-contract.md)——IR 的稳定接口约束
- [Rsbuild 插件设计](../rsbuild-plugin.md)——前端编译器能力
- [Vela 运行时 ABI](../vela-runtime-abi.md)——产物运行时必须遵循的契约
- [Vela 后端与打包器](../vela-backend-packager.md)——Rust 实现细节
- [运行时能力](../runtime-capabilities.md)——各目标平台支持的功能矩阵
