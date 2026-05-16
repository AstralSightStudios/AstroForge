// 解析 astroforge Rust CLI 二进制路径。
//
// 优先级（高 → 低）：
// 1. 环境变量 `ASTROFORGE_BIN` 指定的显式路径；
// 2. workspaceRoot（monorepo 开发场景）下的 `target/release/astroforge` /
//    `target/debug/astroforge`，方便 `pnpm exec astroforge` 在本仓库内直接打到
//    新鲜 `cargo build` 产出；
// 3. 已通过 npm `optionalDependencies` 装入 `node_modules` 的平台子包
//    `@astroforge/cli-<platform>/bin/astroforge[.exe]`；
// 4. PATH 中的 `astroforge`（最后兜底，多见于本地手动 `cargo install`）。
//
// 平台键按 Node 的 `process.platform` × `process.arch` 拼，与子包发布脚本里
// 的命名一一对齐；libc 通过 `process.report.getReport()` 取，没匹配时再退化。

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

const PLATFORM_PACKAGES = {
  "darwin-arm64": "@astroforge/cli-darwin-arm64",
  "darwin-x64": "@astroforge/cli-darwin-x64",
  "linux-x64-glibc": "@astroforge/cli-linux-x64-gnu",
  "linux-arm64-glibc": "@astroforge/cli-linux-arm64-gnu",
  "win32-x64": "@astroforge/cli-win32-x64-msvc",
  "win32-arm64": "@astroforge/cli-win32-arm64-msvc",
};

export function resolveAstroForgeBin(workspaceRoot) {
  if (process.env.ASTROFORGE_BIN) {
    return process.env.ASTROFORGE_BIN;
  }

  const exe = binaryName();
  if (workspaceRoot) {
    const release = resolve(workspaceRoot, "target", "release", exe);
    if (existsSync(release)) return release;
    const debug = resolve(workspaceRoot, "target", "debug", exe);
    if (existsSync(debug)) return debug;
  }

  const pkg = lookupPlatformPackage();
  if (pkg) {
    try {
      return require.resolve(`${pkg}/bin/${exe}`);
    } catch {
      // 子包未装（多见于 npm 在 optionalDependencies 校验失败后跳过）；继续
      // 向下兜底，让用户看到具体 PATH 报错而不是 `Cannot find module` 误导。
    }
  }

  return "astroforge";
}

function binaryName() {
  return process.platform === "win32" ? "astroforge.exe" : "astroforge";
}

function lookupPlatformPackage() {
  const key = `${process.platform}-${process.arch}`;
  // 已含 libc 的 Linux key（glibc）；未来若发布 musl 子包再扩展该映射。
  if (process.platform === "linux") {
    const libc = detectLibc();
    return PLATFORM_PACKAGES[`${key}-${libc}`] ?? PLATFORM_PACKAGES[key];
  }
  return PLATFORM_PACKAGES[key];
}

function detectLibc() {
  try {
    const report = process.report?.getReport?.();
    const glibcVersion =
      report &&
      typeof report === "object" &&
      "header" in report &&
      report.header?.glibcVersionRuntime;
    if (glibcVersion) return "glibc";
  } catch {
    // process.report 在某些受限环境不可用；保守认为 glibc，避免误判 musl 后
    // 找不到子包而退化到 PATH。
  }
  return "glibc";
}
