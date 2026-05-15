// Vela 设备端运行时垫片。
//
// 设备运行时已提供 `aiot.__ce__` / `aiot.__cc__` 等内置函数（参见
// `docs/vela-runtime-abi.md`）。本包不替换这些函数，仅承担少量辅助职责：
//
// - 在 dev 模式下注入错误处理与调试探针；
// - 提供 `$translateStyle$` 的备用实现，便于离线测试；
// - 提供与 React 语义对齐的 hooks 调度器（绑定 Vela 响应式系统）。
//
// 当前为占位，Phase 3 起落地。

export const __ASTROFORGE_VELA_RUNTIME__ = true;
