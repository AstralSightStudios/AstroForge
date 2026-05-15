# AstroForge

基于 Rust 的智能手表快应用现代化工具链，使用 React/TSX 作为开发语言，输出
厂商运行时兼容的产物。

## 背景

智能手表快应用生态高度割裂：小米 Vela 使用 `aiot-toolkit`，vivo BlueOS 使
用各自的工具链，二者均以 Vue 派生的 `.ux` SFC 为开发语言并自行实现构建流水
线。AstroForge 用一套统一工具链替代这种分裂格局：

- 接受 **React/TSX** 源码。
- 经由稳定的三层 **IR**（Component → Page → Runtime）下沉。
- 输出**与厂商运行时 ABI 等价**的 JS 产物，在运行时调用层面与官方工具链产
  物不可区分。
