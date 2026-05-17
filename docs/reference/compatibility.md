# 兼容性说明

本文档说明 AstroForge 与官方 `aiot-toolkit` 的兼容性状况。

## 产物兼容性

AstroForge 的设计目标是与 `aiot-toolkit` 生成的 `.rpk` 包字节级兼容。这意味着：

- ZIP 文件结构相同
- 文件排序相同
- `manifest.json` 字段顺序相同
- `META-INF/build.txt` 格式相同
- `META-INF/CERT` 签名结构相同
- V2 签名块格式相同

### 验证方式

使用兼容性测试工具：

```bash
cargo build --release -p astroforge-cli
./target/release/astroforge test-compat --fixtures fixtures --official
```

期望输出：所有 fixture 的 4 个 diff 桶（files / manifest / runtime_calls / rpk_structure）均为 0。

## 运行时兼容性

AstroForge 生成的 JS 代码运行在相同的 Vela QuickJS 运行时上，调用相同的 `aiot.__ce__` / `aiot.__cc__` API。

### 支持的运行时版本

- 最低支持 `minPlatformVersion: 1200`
- 与 `aiot-toolkit@2.0.x` 生成的产物运行时行为一致

### 桥接 API 兼容性

AstroForge 支持以下 Vela 桥接 API（通过 `@astralsight/astroforge-core` 导出）：

| 模块 | 说明 | 状态 |
|------|------|------|
| `system.router` | 路由导航 | 已支持 |
| `system.fetch` | 网络请求 | 已支持 |
| `system.storage` | 本地存储 | 已支持 |
| `system.prompt` | 提示框 | 已支持 |
| `system.app` | 应用信息 | 已支持 |
| `system.sensor` | 传感器 | 已支持 |
| `system.cipher` | 加密 | 已支持 |
| `system.configuration` | 系统配置 | 已支持 |

## 不兼容项

以下 `aiot-toolkit` 特性在 AstroForge 中没有等价实现：

- `.ux` 单文件组件语法（AstroForge 使用 `.tsx`）
- UX 模板指令（`if`/`elif`/`else`/`for`）
- UX 计算属性
- UX mixins
- UX 事件修饰符（`.stop`、`.prevent`）

这些不兼容是设计上的：AstroForge 采用 React/TSX 语义替代了 UX 语义。

## 版本对应关系

| AstroForge | aiot-toolkit | 说明 |
|-----------|-------------|------|
| 0.0.x | 2.0.5 | 初始版本，基础功能对齐 |

## 迁移兼容性

从 aiot-toolkit 迁移到 AstroForge 时：

- `manifest.json` 完全兼容，可直接复用
- 资源文件（图片、字体）完全兼容
- 业务逻辑需要重写为 TSX/Hooks
- 样式需要转换为 CSS 文件

## 下一步

查阅 [API 参考](api/) 了解具体的 API 支持状况。
