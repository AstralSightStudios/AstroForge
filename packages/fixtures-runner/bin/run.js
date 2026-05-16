#!/usr/bin/env node
// 兼容性 fixture 对照运行器。
//
// 针对每个 `fixtures/<NN>-<name>/`，运行器构建 official UX 项目与等价
// AstroForge 项目，归一化双方产物，并将可对照的结果写入 `golden/`。
//
// 二进制查找复用 packages/cli-js 的 resolve-bin.js，行为与 `astroforge` bin
// 严格一致。

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAstroForgeBin } from '../../cli-js/src/resolve-bin.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const bin = resolveAstroForgeBin(root);
const child = spawn(bin, ['test-compat', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
