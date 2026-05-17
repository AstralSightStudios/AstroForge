# 环境准备（aiot-toolkit 迁移者）

## 前置要求

### Node.js 版本

AstroForge 需要 Node.js **18.0.0** 或更高版本。建议使用最新的 LTS 版本。

```bash
node -v  # 应输出 v18.x.x 或更高
```

### 包管理器

项目使用 pnpm 作为包管理器。如果你还没有安装：

```bash
npm install -g pnpm
```

### Rust 工具链（可选）

如果你需要从源码编译 CLI 或贡献代码，需要安装 Rust：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

如果只是使用 AstroForge 开发应用，npm 安装的预编译 CLI 已经足够。

## 安装 AstroForge CLI

```bash
npm install -g astroforge
# 或
pnpm add -g astroforge
```

安装后验证：

```bash
astroforge --version
```

## 与 aiot-toolkit 的环境对比

| 工具 | aiot-toolkit | AstroForge |
|------|--------------|------------|
| Node.js | 14+ | 18+ |
| 包管理器 | npm | pnpm（推荐） |
| 全局命令 | `aiot` | `astroforge` |
| 开发服务器 | `aiot dev` | `astroforge dev`（调用 Rsbuild） |
| 构建 | `aiot build` | `astroforge build` |
| 预览 | `aiot preview` | `astroforge preview` |

## IDE 配置

### VS Code 推荐扩展

- **ESLint** —— 代码规范检查
- **Prettier** —— 代码格式化
- **TypeScript Importer** —— 自动 import 补全
- **Tailwind CSS IntelliSense**（如果使用 Tailwind 子集）

### TypeScript 配置要点

AstroForge 项目的 `tsconfig.json` 通常包含以下关键配置：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@astralsight/astroforge-core",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

注意 `jsxImportSource` 必须指向 `@astralsight/astroforge-core`，这样 JSX 转换器才能正确识别内置组件。

## Vela 设备调试环境

### 模拟器

AstroForge 构建的 `.rpk` 可以使用官方 Vela 模拟器运行。模拟器安装方式与 aiot-toolkit 项目一致，没有额外要求。

### 真机调试

1. 确保手表开启开发者模式
2. 使用 `astroforge build` 生成 `.rpk`
3. 通过小米运动健康 App 或 adb 安装

构建产物路径：

```text
dist/
  <package>.debug.rpk     # 开发构建（自动使用 debug 签名）
  <package>.release.rpk   # 生产构建（需要配置 release 签名）
```

## 签名配置

与 aiot-toolkit 类似，AstroForge 支持 debug 与 release 两种签名模式。

### Debug 签名（自动）

开发阶段不需要额外配置。AstroForge 会自动寻找以下位置的 debug 证书：

1. 项目根目录 `sign/debug/` 
2. 用户目录 `~/.astroforge/sign/debug/`
3. 内置默认 debug 证书

### Release 签名

生产构建需要配置自己的证书：

```text
sign/
  release/
    private.pem    # 私钥
    cert.pem       # 证书
```

然后在 `astroforge.config.ts` 中声明：

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

## 下一步

[项目脚手架](03-project-scaffold.md)
