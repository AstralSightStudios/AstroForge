#!/usr/bin/env node
// 转发到 Rust 实现的 `astroforge` 可执行文件。查找规则见 resolve-bin.js。
//
// 该 wrapper 仅服务于 npm 安装路径上的用户；在 monorepo 内开发时直接调用
// `cargo run --bin astroforge` 更直接。

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAstroForgeBin } from '../src/resolve-bin.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const bin = resolveAstroForgeBin(root);
const child = spawn(bin, process.argv.slice(2), { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
