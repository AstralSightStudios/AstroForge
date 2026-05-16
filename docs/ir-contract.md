# AstroForge IR 契约

本文档面向所有需要生产或消费 AstroForge IR 的工具作者（Rsbuild 插件、Vela
后端、对照测试、第三方代码生成器等），描述 IR 的稳定接口约束。所有规则与
`crates/astroforge-ir/` 的代码定义一致；二者发生不一致时以代码为准并修订
本文档。

## 1. 三层 IR 与各自职责

| 层级 | 模块 | 职责 | 序列化形态 |
| ---- | ---- | ---- | ---------- |
| Component | `astroforge_ir::component` | 编译器从 TSX 解析后的组件树，含静态/动态属性、事件、绑定路径、条件、列表、Fragment。 | 跨进程，纳入 IR 文件 |
| Page | `astroforge_ir::page` | 单次编译产物的完整描述：manifest、应用模块、页面、组件、脚本、样式、资源。 | 跨进程，纳入 IR 文件 |
| Runtime | `astroforge_ir::runtime` | Vela 后端内部表示：每个节点直接对应一次 `aiot.__ce__` / `__cc__` 调用。 | 后端内部，不纳入 IR 文件 |

## 2. 跨进程 IR 文件

Rsbuild 插件向 Rust 后端传递的契约即 [`astroforge_ir::page::IrDocument`]，
其 JSON Schema 位于 [`./ir-document.schema.json`](./ir-document.schema.json)。

- **加载入口**：[`astroforge_ir::io::load_ir_from_path`]。
- **写出入口**：[`astroforge_ir::io::save_ir_to_path`]（紧凑）/
  [`astroforge_ir::io::save_ir_pretty`]（带缩进）。
- 加载阶段强制校验 `ir_version` 字段与 [`astroforge_ir::IR_VERSION`] 一致，
  不一致时返回 `IrError::Version`。**不允许**前向兼容兜底。

后端内部表示 [`astroforge_ir::runtime::RuntimeModule`] 的 JSON Schema 位于
[`./runtime-module.schema.json`](./runtime-module.schema.json)，仅供对照
工具与代码生成器参考；用户项目无须直接生产此结构。

## 3. JSON 形态规则

### 3.1 枚举：adjacent tagging

所有 IR 枚举使用 `#[serde(tag = "kind", content = "value")]`，序列化形态对称：

```json
{ "kind": "<variant>", "value": <payload> }
```

例：

```json
// Node::Element
{ "kind": "element", "value": { "tag": "div", "is_component": false, ... } }

// Node::Text
{ "kind": "text", "value": "Hello, Vela!" }

// Node::Expression，`expr` 用于已完成作用域归一的复合表达式
{
  "kind": "expression",
  "value": {
    "path": "`Hi ${name}`",
    "expr": "\"Hi \" + (_vm_.name)",
    "is_callable": false
  }
}

// Attr::StyleObject
{
  "kind": "style_object",
  "value": [
    {
      "name": "color",
      "value": {
        "kind": "dynamic",
        "value": { "path": "theme.color", "is_callable": false }
      }
    }
  ]
}

// OptValue::ClassList
{ "kind": "class_list", "value": ["title", "active"] }
```

不采用 internal tagging（`{ "kind": ..., ...payload }`）的原因：部分变体载
荷为非结构体（`String`、`Vec`、`serde_json::Value`），internal tagging 在
serde 实现层不支持此形态。adjacent tagging 同时使新增变体的形态可预测，避
免引入二义性。

### 3.2 字段命名

- Rust 端字段为 `snake_case`；JSON 端保持同名（未启用 `rename_all = "camelCase"`）。
- 例外：`Manifest` 内部字段（`version_name`、`device_type_list` 等）在 JSON
  中仍为 `snake_case`——Vela 后端在生成 `manifest.json` 时**手工**转写为厂商
  期望的 `camelCase`，避免在 IR 层混淆原始结构与产物格式。

### 3.3 顺序敏感性

以下集合使用 [`IndexMap`] 保留插入顺序，序列化时输出顺序与 Rust 端一致：

- `Element.attrs`、`Element.events`：模板属性在源码中的书写顺序，对照测试
  需按位对齐。
- `Manifest.router.pages`、`IrDocument.pages`、`IrDocument.components`：路
  由表与模块表，顺序影响 Vela 启动加载时的页面注册顺序。
- `Script.props`、`Script.private_data`、`Script.methods`、`Script.lifecycle`：
  影响后端生成的对象字面量字段顺序，与厂商产物对齐。
- `RuntimeNode.opts`：`__opts__` 对象的字段顺序——厂商产物字段顺序稳定，
  对照工具按位 diff。

`Vec<T>` 的天然顺序同样有效，不再赘述。

### 3.4 序列化默认行为

- 所有 `Option<T>` 与 `T: Default` 的容器（`IndexMap` / `Vec`）启用
  `#[serde(default)]`，**写出方**可省略空值；**读取方**永远能正常解析。
- 未来字段添加策略：新字段必须带 `#[serde(default)]`，并保证旧 IR 文件解
  析时取合理默认值。否则必须同步 bump `IR_VERSION`。

## 4. 不变式锁

以下数值与字符串与 Vela 厂商运行时 ABI 直接绑定，调整即破坏二进制兼容：

| 项 | 值 | 锚点 |
| -- | -- | ---- |
| `IR_VERSION` | `1` | `crates/astroforge-ir/src/lib.rs` |
| `SelectorKind::Class.index()` | `0` | `parser/lib/ux/enum/StyleSelectorType.js` |
| `SelectorKind::Id.index()` | `1` | 同上 |
| `SelectorKind::Tag.index()` | `2` | 同上 |
| `SelectorKind::Keyframes.index()` | `3` | 同上 |
| `SelectorKind::FontFace.index()` | `4` | 同上 |
| `Creator::Builtin` serde tag | `"builtin"` | `docs/vela-runtime-abi.md` §7 |
| `Creator::Component` serde tag | `"component"` | 同上 |

测试位置：`crates/astroforge-ir/tests/invariants.rs`。任何改动都必须经过显
式 review，本文档同步更新。

## 5. 版本演进规则

`IR_VERSION` 递增触发条件（满足任一即必须 bump）：

1. 任何字段被删除或重命名；
2. 任何字段从 `Option<T>` / `T: Default` 收紧为必填；
3. 任何枚举变体被删除或重命名；
4. 枚举标签策略变更（adjacent → internal / external / untagged）；
5. `SelectorKind::index()` 任何返回值变更；
6. `Creator` / `SelectorKind` 的 serde 标签命名变更；
7. 任意结构由 `Vec<T>` 改为无序集合，或反之。

新增字段、新增枚举变体（不删旧）、修改文档注释、调整 dev-dependency——这些
**不**触发版本号变更。

## 6. 工具入口速查

| 任务 | 命令 / API |
| ---- | ---------- |
| 加载并校验 IR 文件 | `astroforge_ir::io::load_ir_from_path` |
| 写出 IR 文件 | `astroforge_ir::io::save_ir_to_path` / `save_ir_pretty` |
| 获取 IR 文件 JSON Schema | `astroforge inspect schema --target ir-document` |
| 获取 Runtime IR JSON Schema | `astroforge inspect schema --target runtime-module` |
| 检视一个 IR 文件 | `astroforge inspect ir <path>` |
| 重新生成 docs/ 下两份 schema | `cargo run -p astroforge-ir --example dump-ir-schema` |
| 在 IR / JSON 上做 diff | `astroforge_compat::ir_diff::{diff, diff_values}` |

## 7. 测试矩阵（Phase 1 落地）

| 文件 | 覆盖 |
| ---- | ---- |
| `crates/astroforge-ir/tests/invariants.rs` | §4 数值与命名不变式 |
| `crates/astroforge-ir/tests/snapshot_component.rs` | Component IR 全部变体序列化形态 |
| `crates/astroforge-ir/tests/snapshot_page.rs` | Page IR 全部结构序列化形态 |
| `crates/astroforge-ir/tests/snapshot_runtime.rs` | Runtime IR 全部变体序列化形态 |
| `crates/astroforge-ir/tests/snapshot_fixture_01.rs` | fixture 01 端到端 IR |
| `crates/astroforge-ir/tests/roundtrip.rs` | 关键结构 JSON 往返等价 |
| `crates/astroforge-ir/tests/io.rs` | 文件 I/O、版本校验、错误路径 |
| `crates/astroforge-ir/tests/schema.rs` | JSON Schema 元数据与必需类型清单 |
| `crates/astroforge-compat/tests/ir_diff.rs` | IR / JSON diff 行为 |

snapshot 文件位于 `crates/astroforge-ir/tests/snapshots/`，由 `insta` 管理。
更新流程：`INSTA_UPDATE=always cargo test -p astroforge-ir`，再 `cargo insta review`
逐条审阅。
