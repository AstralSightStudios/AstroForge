#!/usr/bin/env node
// 转发到 Rust 实现的 `astroforge` 可执行文件。
//
// 优先级：
// 1. 环境变量 `ASTROFORGE_BIN` 指定的路径；
// 2. PATH 中的 `astroforge`；
// 3. 当前 monorepo 下 target/release/astroforge；
// 4. 当前 monorepo 下 target/debug/astroforge。
//
// 该 wrapper 仅服务于 npm 安装路径上的用户；在 monorepo 内开发时直接调用
// `cargo run --bin astroforge` 更直接。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const candidates = [
  process.env.ASTROFORGE_BIN,
  'astroforge',
  resolve(root, 'target', 'release', 'astroforge'),
  resolve(root, 'target', 'debug', 'astroforge'),
].filter(Boolean);

const bin = candidates.find((p) => p === 'astroforge' || existsSync(p)) ?? 'astroforge';

const child = spawn(bin, process.argv.slice(2), { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
