// 解析 astroforge Rust CLI 二进制路径，供 packages/cli-js 与
// packages/fixtures-runner 的薄壳 bin 脚本复用。
//
// 优先级：
// 1. 环境变量 `ASTROFORGE_BIN` 指定的路径；
// 2. 工作区下 `target/release/astroforge`；
// 3. 工作区下 `target/debug/astroforge`；
// 4. PATH 中的 `astroforge`（最后兜底）。
//
// 旧实现两边各写一份近乎逐字相同的查找逻辑，任何一侧改动都需要手工同步；
// 此处统一收敛后两个 bin 脚本只剩 spawn 形态差异。

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveAstroForgeBin(workspaceRoot) {
  const candidates = [
    process.env.ASTROFORGE_BIN,
    resolve(workspaceRoot, 'target', 'release', 'astroforge'),
    resolve(workspaceRoot, 'target', 'debug', 'astroforge'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return 'astroforge';
}
