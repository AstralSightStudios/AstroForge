#!/usr/bin/env node
// 把 6 个 @astroforge/cli-* 平台子包 + 主包 astroforge 的 package.json version
// 同步到 argv[2] 指定的语义化版本号；同步更新主包 optionalDependencies 里对
// 各子包的版本固定为同一值。
//
// 主要给 .github/workflows/release-cli.yml 在发布前调用，确保六个 tarball 的
// version 与主包对子包的 pin 一致。本地手动调试也可以直接执行：
//   node scripts/sync-cli-version.mjs 0.0.2

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

const SUBPACKAGES = [
  "cli-darwin-arm64",
  "cli-darwin-x64",
  "cli-linux-x64-gnu",
  "cli-linux-arm64-gnu",
  "cli-win32-x64-msvc",
  "cli-win32-arm64-msvc",
];

const MAIN_PACKAGE = "cli-js";

const version = process.argv[2];
if (!version) {
  console.error("用法：node scripts/sync-cli-version.mjs <version>");
  process.exit(1);
}
if (!SEMVER.test(version)) {
  console.error(`版本号不符合 semver：${version}`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

for (const dir of SUBPACKAGES) {
  const path = resolve(repoRoot, "packages", dir, "package.json");
  const pkg = readJson(path);
  pkg.version = version;
  writeJson(path, pkg);
  console.log(`  ${pkg.name} -> ${version}`);
}

const mainPath = resolve(repoRoot, "packages", MAIN_PACKAGE, "package.json");
const main = readJson(mainPath);
main.version = version;
main.optionalDependencies = main.optionalDependencies ?? {};
for (const dir of SUBPACKAGES) {
  const subPath = resolve(repoRoot, "packages", dir, "package.json");
  const sub = readJson(subPath);
  main.optionalDependencies[sub.name] = version;
}
writeJson(mainPath, main);
console.log(`  ${main.name} -> ${version} (+ optionalDependencies pin)`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
