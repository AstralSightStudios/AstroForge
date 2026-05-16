#!/usr/bin/env node
// 把 6 个 @astralsight/astroforge-cli-* 平台子包 + 主包 astroforge 的
// package.json version 同步到 argv[2] 指定的语义化版本号；同步更新主包
// optionalDependencies 里对各子包的版本 pin 到同一值；同步 Cargo.toml
// workspace.package.version，让 `cargo build` 产出的 Rust 二进制 `--version`
// 与 npm 包版本一致（否则消费端 `astroforge --version` 与 npm 包页号脱钩）。
//
// 主要给 .github/workflows/release-cli.yml 在发布前调用，确保 6 个 tarball
// 的 version、主包对子包的 pin、binary 自报版本三者完全一致。本地手动调试也
// 可以直接执行：
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

// Cargo.toml workspace.package.version：astroforge-cli crate 的 CARGO_PKG_VERSION
// 取自该字段；不同步会导致 `astroforge --version` 与 npm 包号脱钩。
const cargoTomlPath = resolve(repoRoot, "Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const cargoTomlNext = updateCargoWorkspaceVersion(cargoToml, version);
if (cargoTomlNext === cargoToml) {
  console.log(`  Cargo.toml -> ${version}（已是该版本，未改动）`);
} else {
  writeFileSync(cargoTomlPath, cargoTomlNext);
  console.log(`  Cargo.toml workspace.package.version -> ${version}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/// 替换 `[workspace.package] ... version = "x.y.z"` 中的版本号；只动 workspace
/// 段，避免误改 `[workspace.dependencies]` 里的依赖版本。
function updateCargoWorkspaceVersion(source, nextVersion) {
  const sectionRe = /(\[workspace\.package\][^\[]*?\bversion\s*=\s*")[^"]*(")/;
  if (!sectionRe.test(source)) {
    throw new Error("Cargo.toml 中未找到 [workspace.package] version 字段");
  }
  return source.replace(sectionRe, `$1${nextVersion}$2`);
}
