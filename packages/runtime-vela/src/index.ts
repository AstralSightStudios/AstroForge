// Vela 设备端运行时支持模块。
//
// 设备运行时提供 `aiot.__ce__`、`aiot.__cc__` 等内置原语；兼容契约见
// `docs/vela-runtime-abi.md`。本包承载后端按需注入到应用产物中的目标侧支持
// 代码：
//
// - 开发诊断与错误上报 hook；
// - 用于离线测试的样式转换后备实现；
// - 将生成状态更新绑定到 Vela 数据模型的运行时辅助函数。

export const __ASTROFORGE_VELA_RUNTIME__ = true;
