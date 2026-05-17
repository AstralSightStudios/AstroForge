# 兼容性测试

本文档介绍 AstroForge 的兼容性测试体系，包括 fixture 体系和测试方法。

## 目标

验证 AstroForge 生成的 `.rpk` 与官方 `aiot-toolkit` 生成的产物字节级兼容。

## 测试维度

兼容性测试从 4 个维度对比两侧产物：

| 维度 | 说明 |
|------|------|
| `files` | ZIP 内文件列表和路径 |
| `manifest` | manifest.json 字段值 |
| `runtime_calls` | JS 运行时调用序列（`__ce__`、`__cc__` 等） |
| `rpk_structure` | ZIP 结构、排序、签名块 |

## Fixture 体系

```
fixtures/<NN>-<name>/
  astroforge/         # AstroForge 项目（TSX）
    src/
    astroforge.config.ts
    rsbuild.config.ts
    package.json
  official/           # 等价的官方 UX 项目
    src/
    package.json
    sign/             # 可选
  golden/
    astroforge/       # AstroForge 构建产物
      app.rpk
      unpacked/
      summary.json
    aiot/             # 官方构建产物
      app.rpk
      unpacked/
      summary.json
```

## 现有 Fixtures

| Fixture | 覆盖点 |
|---------|--------|
| `01-hello-text` | 静态文本和最小 manifest/route 生成 |
| `02-static-style` | 静态样式提取 |
| `03-image-asset` | manifest icon 与图片资源 |
| `04-click-event` | onClick 事件绑定 |
| `05-use-state-counter` | useState 初值、文本绑定、setter |
| `06-conditional-render` | 三元表达式条件渲染 |
| `07-list-render` | .map 列表渲染 |
| `08-page-lifecycle` | 页面 lifecycle |
| `09-app-lifecycle` | 应用 lifecycle |
| `10-navigation` | 路由桥接 |
| `11-storage-api` | storage 桥接 |
| `12-network-api` | network 桥接 |
| `13-timer` | timer 调用 |
| `14-nested-component` | 本地组件 |
| `15-multi-page` | 多页面 |
| `16-permission-manifest` | manifest features |
| `17-resource-path` | 资源收集 |
| `18-css-edge-cases` | CSS 解析 |
| `19-system-prompt` | prompt 桥接 |
| `20-react-static-subset` | React hooks 静态展开 |

## 运行兼容性测试

### 需要官方工具链

```bash
cargo build --release -p astroforge-cli
./target/release/astroforge test-compat --fixtures fixtures --official
```

解析 stdout 末尾的 JSON envelope，所有 fixture 的 4 个 diff 桶必须全 0。

### 离线回归（无官方工具链）

```bash
cargo test -p astroforge-compat --test compat_goldens
```

读取 `golden/summary.json`，校验两侧差异为 0。

## 添加新 Fixture

1. 创建 `astroforge/` 和 `official/` 目录，确保逻辑等价
2. 运行 `test-compat --official` 生成 golden
3. 确认 4 个 diff 桶全 0
4. 提交 golden 和 summary.json

## IR Diff 工具

`astroforge-compat` 提供 IR/JSON diff 工具：

```rust
use astroforge_compat::ir_diff::diff;

let diffs = diff(&left_doc, &right_doc)?;
```

Diff 类型：
- `Value`：值不同
- `TypeMismatch`：类型不匹配
- `Extra`：右独有
- `Missing`：左独有
- `ArrayLength`：数组长度不同

## 下一步

- [架构总览](architecture-overview.md)
- [IR 中间表示](ir-format.md)
