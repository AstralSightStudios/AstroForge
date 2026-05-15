#!/usr/bin/env node
// fixtures 驱动器。
//
// 对每个 fixtures/<NN>-<name>/：
// 1. 进入 official/，运行 `npx aiot build` 产出 build/；
// 2. 进入 astroforge/，运行 `astroforge build --target vela` 产出 dist/；
// 3. 将两侧产物归一化后写入 golden/aiot/ 与 golden/astroforge/；
// 4. 调用 astroforge test-compat 对照分级 diff。
//
// 当前为占位骨架，待 Phase 1 起逐步落地。

console.error('astroforge-fixtures: 尚未实现');
process.exit(1);
