# RPK 打包与发布

本文档介绍 AstroForge 的构建、打包和发布流程，以及与 aiot-toolkit 的差异。

## 构建命令

### 开发构建

```bash
astroforge build
# 或
pnpm build
```

生成 `dist/<package>.debug.rpk`，使用 debug 签名证书。

### 生产构建

```bash
astroforge build --release
```

生成 `dist/<package>.release.rpk`，使用配置的 release 证书。

## 签名配置

### Debug 签名（自动）

开发阶段不需要配置。AstroForge 按以下顺序寻找 debug 证书：

1. `sign/debug/`（项目根目录）
2. `~/.astroforge/sign/debug/`（用户目录）
3. 内置默认 debug 证书

### Release 签名

创建 `sign/release/` 目录：

```text
sign/
  release/
    private.pem
    cert.pem
```

然后在 `astroforge.config.ts` 中配置：

```ts
export default {
  signing: {
    release: {
      keyStore: 'sign/release/private.pem',
      cert: 'sign/release/cert.pem',
    },
  },
};
```

## 产物结构

构建生成的 `.rpk` 是标准 ZIP 文件，内部结构：

```text
manifest.json
app.js
pages/
  index/
    index.js
  detail/
    detail.js
common/
  logo.png
  ...
i18n/
  zh.json
  en.json
META-INF/
  build.txt
  CERT
```

与 aiot-toolkit 产物完全兼容。

## 安装到设备

### 模拟器

1. 启动 Vela 模拟器
2. 将 `.rpk` 拖拽到模拟器窗口，或通过命令行安装

### 真机

通过小米运动健康 App：
1. 打开开发者模式
2. 选择「安装本地应用」
3. 选择构建的 `.rpk` 文件

或通过 adb：

```bash
adb install -r dist/my-app.debug.rpk
```

## 与 aiot-toolkit 的构建差异

| 维度 | aiot-toolkit | AstroForge |
|------|-------------|------------|
| 构建工具 | webpack | Rsbuild (Rspack) |
| 构建速度 | 较慢 | 快（Rust 核心） |
| 产物格式 | `.rpk` (zip) | `.rpk` (zip) |
| 签名方式 | 自动 debug / 配置 release | 相同 |
| 产物兼容性 | 官方标准 | 字节级兼容 |

## 下一步

[迁移排错](10-troubleshooting.md)
