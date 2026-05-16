<div align="center">

# AstroForge

基于 Rust 的智能手表快应用开发工具链，使用 React/TSX 作为开发语言，产出与厂商运行时（小米 Vela / vivo BlueOS 等）字节级 ABI 兼容的产物。

[![npm version](https://img.shields.io/npm/v/@astralsight/astroforge.svg?label=%40astralsight%2Fastroforge)](https://www.npmjs.com/package/@astralsight/astroforge)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release CLI](https://github.com/AstralSightStudios/AstroForge/actions/workflows/release-cli.yml/badge.svg)](https://github.com/AstralSightStudios/AstroForge/actions/workflows/release-cli.yml)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518.18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Rust](https://img.shields.io/badge/rust-%E2%89%A51.89-dea584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)

</div>

## 简介

智能手表快应用生态高度割裂：小米 Vela 用 `aiot-toolkit`，vivo BlueOS 用各自工具链，二者均以 Vue 派生的 `.ux` 单文件组件为开发语言、各自一套构建流水线。AstroForge 把整条链路用 Rust 重写、把开发语言迁到 React/TSX，并把产物锁定在厂商运行时期望的字节形态：

- **现代开发体验**：完整 TypeScript 类型，TSX、`useState` / `useEffect` 等编译期 hook，相对路径组件 import 直接可用。
- **零厂商工具链依赖**：开发、调试、签名、打包、设备安装全链路脱离 `aiot-toolkit` 等工具；release 二进制开箱即可签名上设备。
- **稳定的三层 IR 契约**：TSX → Component IR → Page IR → Runtime IR，每层有 JSON Schema 与 snapshot 单测覆盖。

## 安装

```bash
pnpm add -g @astralsight/astroforge
astroforge --version
```

支持平台：

| OS | 架构 | npm 子包 |
|---|---|---|
| macOS | arm64 / x64 | `@astralsight/astroforge-cli-darwin-arm64` / `cli-darwin-x64` |
| Linux (glibc) | x64 / arm64 | `@astralsight/astroforge-cli-linux-x64-gnu` / `cli-linux-arm64-gnu` |
| Windows (MSVC) | x64 / arm64 | `@astralsight/astroforge-cli-win32-x64-msvc` / `cli-win32-arm64-msvc` |

## 快速开始

```bash
astroforge init my-watch-app
cd my-watch-app
pnpm install
astroforge build --target vela
```

`src/pages/index/index.tsx` 是标准 TSX：

```tsx
import { Text, View, useState } from "@astralsight/astroforge-core";

export default function Index() {
  const [count, setCount] = useState(0);
  return (
    <View class="page">
      <Text class="counter">已点 {count} 次</Text>
      <Text class="btn" onClick={() => setCount(count + 1)}>
        点击
      </Text>
    </View>
  );
}
```

`useState` 在 TSX → IR 阶段被静态展开为 vm `data` / `methods` / lifecycle，**没有任何浏览器或 React 调度器引入**。

## CLI

| 子命令 | 说明 |
|---|---|
| `astroforge init <path>` | 生成可直接构建的项目骨架 |
| `astroforge dev` | 监听源码增量重打 rpk，可选 `--install` 推送设备 |
| `astroforge build --target vela` | debug 构建 |
| `astroforge release --target vela` | release 构建（强制签名材料；缺失即报错） |
| `astroforge inspect rpk <file>` | 检视 rpk 内容：manifest、文件清单、签名块、build.txt |
| `astroforge inspect ir <file>` | 检视 IR 文档：版本、页面 / 组件 / 资源 / 路由表 |
| `astroforge inspect schema --target ir-document` | 导出 IR JSON Schema |
| `astroforge unpack <rpk> --out <dir>` | rpk 解压到目录 |

## 开发

环境要求：

- Rust 1.89+
- Node.js 18.18+
- pnpm 9.x

```bash
pnpm install
pnpm test           # cargo test --workspace + vitest
pnpm check:js       # tsc --noEmit
pnpm lint           # cargo clippy -D warnings
pnpm fmt            # cargo fmt + prettier
pnpm build:js       # 重建 tsdown 产出
```

跨链路改动（IR / Vela 后端 / packager / TSX 提取器）出 PR 前应额外跑：

```bash
cargo build --release -p astroforge-cli
./target/release/astroforge test-compat --fixtures fixtures --official
```

四个 diff 桶（files / manifest / runtime_calls / rpk_structure）必须全 0。无 `aiot-toolkit` 环境下可用离线回归：

```bash
cargo test -p astroforge-compat --test compat_goldens
```

如果你是 AI 模型：请先读 [AGENTS.md](AGENTS.md)，里面有用户偏好、字节级不变式、常见坑与发布规范。

## 兼容性

| 平台 runtime | 状态 | 备注 |
|---|---|---|
| 小米 Vela | 稳定 | 完整支持 |
| vivo BlueOS | 规划中 | 架构设计支持，待实现 |

## Next Step
- protobuf 资产 / jsc 字节码
- vivo BlueOS 后端

## License

[MIT](LICENSE) © AstralSightStudios
