# 打包器

本文档介绍 `crates/astroforge-packager/` 的实现，包括 ZIP 打包、文件排序和 V2 签名。

## 职责

打包器将构建产物（JS、manifest、资源）组装为标准的 `.rpk` 快应用包。

## 产物结构

```
.rpk (ZIP)
  manifest.json
  app.js
  pages/
    <route>/
      <comp>.js
  common/
    logo.png
    ...
  i18n/
    zh.json
    ...
  META-INF/
    build.txt
    CERT
```

## 打包流程

### 1. 文件收集

收集所有需要打包的文件：
- manifest 及 device manifests
- app.js
- 页面 JS
- 组件 JS
- 公共资源
- i18n 文件
- META-INF/

### 2. 文件排序

严格按 aiot-toolkit 的优先级表排序：

```rust
const PRIORITIES: &[&str] = &[
    "manifest.json",
    "app.js",
    // 页面文件
    // 公共文件
    // i18n
    // META-INF/
];
```

排序规则来源于 `aiotpack/lib/compiler/javascript/vela/utils/ZipUtil.js:getPriorities`。

### 3. META-INF 生成

#### build.txt

字段以 `\n` 分隔，无尾随换行：

```
originType=undefined
toolkit=astroforge
time=1715904000000
node=18.20.0
platform=darwin
arch=arm64
component=react
```

注意：`originType=undefined` 是官方工具链的遗留行为，必须原样输出。

#### CERT

内层 zip，包含：
- `hash.json`：文件 SHA-256 摘要
- V2 签名块

内层 zip 的 comment **必须为空字符串**。

### 4. V2 签名

签名块格式（来源于 `aiotpack/.../signature/SignUtil.js`）：

- 魔数：`RPK Sig Block 42`
- KV id：`0x01000101`（签名）/ `0x01000201`（文件 digest）
- algorithm id：`0x0103`
- 文件 digest 块：`CRC32(name) + u16(hash_len) + hash`
- Whole digest 头：`0x5a + LE(3) + section_hashes[]`
- 每个 section：`0xa5 + LE(len) + content`，SHA-256

### 5. 外层 ZIP

外层 zip 的 comment 是 JSON 字符串（`PackageMetadata::zip_comment()`），不含 `originType`。

## 签名模式

### Debug 签名

开发构建自动使用 debug 证书。查找顺序：

1. `sign/debug/`
2. `sign/`
3. 内置默认 debug 证书

### Release 签名

生产构建需要显式配置。找不到证书时**报错**，绝不退化到 debug 证书。

```rust
pub struct SigningConfig {
    pub private_key: Vec<u8>,
    pub certificate: Vec<u8>,
}
```

## 公共 API

### pack

旧形态，默认 debug 签名：

```rust
pub fn pack(inputs: PackInputs) -> Result<Vec<u8>>;
```

### pack_with

新形态，接受 `PackOptions`：

```rust
pub fn pack_with(inputs: PackInputs, options: &PackOptions) -> Result<Vec<u8>>;
```

### write_unpacked / write_unpacked_with

写出未打包的文件结构，用于调试。

## 测试

打包器测试位于 `crates/astroforge-packager/src/lib.rs`（`#[cfg(test)]` 模块），覆盖：

- 文件排序与 aiot-toolkit 对齐
- build.txt 格式
- debug 签名自动发现
- release 签名缺失报错
- 最小 RPK 打包与检视

## 下一步

- [兼容性测试](compatibility-testing.md)
