#!/usr/bin/env node
// 兼容性 fixture 对照运行器。
//
// 针对每个 `fixtures/<NN>-<name>/`，运行器构建 official UX 项目与等价
// AstroForge 项目，归一化双方产物，并将可对照的结果写入 `golden/`。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const candidates = [
  process.env.ASTROFORGE_BIN,
  resolve(root, 'target', 'release', 'astroforge'),
  resolve(root, 'target', 'debug', 'astroforge'),
  'astroforge',
].filter(Boolean);

const bin = candidates.find((p) => p === 'astroforge' || existsSync(p)) ?? 'astroforge';
const child = spawn(bin, ['test-compat', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
