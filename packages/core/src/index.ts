// AstroForge 用户侧入口：导出内置组件、hooks 与 JSX runtime 类型。
//
// 当前为骨架，Phase 2 起逐步落地。所有运行时实现实际由产物中的
// `@astroforge/runtime-vela` 提供；本包仅暴露开发期 TS 类型与 JSX 语法糖。

export { View, Text, Image } from './components';
export { useState, useEffect, useRef, useMemo, useCallback } from './hooks';
export type { JSX } from './jsx-runtime';
