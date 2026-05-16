#!/usr/bin/env bash
# CLI release 前置自动化脚本。
#
# 用法：
#   scripts/release-cli.sh <version> [--push] [--skip-tests] [--no-commit]
#
# 行为：
#   1. 校验 <version> 是合法 semver。
#   2. node scripts/sync-cli-version.mjs <version>：把 6 个 @astralsight/astroforge-cli-*
#      子包 + 主包 @astralsight/astroforge 的 version 与主包的 optionalDependencies pin
#      统一改到 <version>。
#   3. 跑测试（除非 --skip-tests）：pnpm check:js + pnpm test:js + cargo test。
#   4. git 提交 7 个 package.json 改动（除非 --no-commit）。
#   5. 打 tag cli-v<version>（除非 --no-commit）。
#   6. --push 时把当前分支 + tag 推到 origin，触发 .github/workflows/release-cli.yml。
#
# 不做的事：
#   - 不直接调用 npm publish。所有发布走 CI（OIDC + provenance + 多平台矩阵）。
#   - 不修 cli-js 之外的代码。需要的代码 / description 变更要在跑本脚本前提交或留作 working tree 改动；
#     脚本只把 7 个 package.json 加入暂存区。

set -euo pipefail

VERSION="${1:-}"

usage() {
  echo "用法: $0 <version> [--push] [--skip-tests] [--no-commit]"
  echo
  echo "示例:"
  echo "  $0 0.0.2              # 同步版本 → 跑测试 → 本地 commit + tag，等你 git push"
  echo "  $0 0.0.2 --push       # 同上，最后自动 git push 触发 CI"
  echo "  $0 0.0.2 --skip-tests # 跳过本地校验（CI 会自己跑）"
  exit 1
}

[[ -z "$VERSION" || "$VERSION" == "--help" || "$VERSION" == "-h" ]] && usage

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "::error:: '$VERSION' 不符合 semver"
  exit 1
fi

PUSH=false
SKIP_TESTS=false
NO_COMMIT=false
shift
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --no-commit) NO_COMMIT=true ;;
    *) echo "未知选项: $arg" >&2; usage ;;
  esac
done

# 切到脚本所在仓库根目录，避免 cwd 偏差。
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TAG="cli-v$VERSION"

if git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "::error:: tag '$TAG' 已存在；先 git tag -d $TAG 再重跑，或换 version"
  exit 1
fi

echo "→ 同步版本到 $VERSION"
node scripts/sync-cli-version.mjs "$VERSION"

if [[ "$SKIP_TESTS" != "true" ]]; then
  echo "→ pnpm check:js"
  pnpm check:js
  echo "→ pnpm test:js"
  pnpm test:js
  echo "→ cargo test --workspace"
  cargo test --workspace
else
  echo "→ 跳过本地测试（--skip-tests）"
fi

if [[ "$NO_COMMIT" == "true" ]]; then
  echo "→ 跳过 commit / tag（--no-commit）。已暂存的 package.json 见 git status。"
  exit 0
fi

echo "→ git add 7 个 package.json"
# sync-cli-version.mjs 写过的具体路径；wrapper 在 cli-js，平台子包在 cli-*-* 下。
git add packages/cli-js/package.json
git add packages/cli-darwin-arm64/package.json
git add packages/cli-darwin-x64/package.json
git add packages/cli-linux-x64-gnu/package.json
git add packages/cli-linux-arm64-gnu/package.json
git add packages/cli-win32-x64-msvc/package.json
git add packages/cli-win32-arm64-msvc/package.json

if git diff --cached --quiet; then
  echo "::error:: 没有改动被 staged（脚本期望 7 个 package.json 至少有 version 变化）"
  exit 1
fi

echo "→ git commit"
git commit -m "chore(cli): release v$VERSION

Bump @astralsight/astroforge + 6 个平台子包到 $VERSION。push tag cli-v$VERSION
会触发 release-cli.yml 多平台矩阵构建并发布至 npm（OIDC trusted publishing）。"

echo "→ git tag $TAG"
git tag "$TAG"

if [[ "$PUSH" == "true" ]]; then
  echo "→ git push origin $CURRENT_BRANCH"
  git push origin "$CURRENT_BRANCH"
  echo "→ git push origin $TAG"
  git push origin "$TAG"
  echo
  echo "已 push tag $TAG，CI 应已开始：https://github.com/AstralSightStudios/AstroForge/actions"
else
  echo
  echo "本地准备完成。手动推送："
  echo "  git push origin $CURRENT_BRANCH"
  echo "  git push origin $TAG"
fi
