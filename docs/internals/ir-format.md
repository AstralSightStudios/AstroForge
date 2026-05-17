# IR 中间表示

本文档介绍 AstroForge 的三层 IR（中间表示）设计，包括数据结构、序列化规则和跨进程契约。

## 三层架构

AstroForge 使用三层 IR 分离关注点：

```
Component IR    ← 前端 TSX 提取器生成
    │
    ▼
Page IR         ← 组装为完整编译产物
    │
    ▼
Runtime IR      ← Vela 后端内部使用
```

### Component IR

编译器从 TSX 解析后的组件树，包含：

- 元素（内置 / 自定义）
- 静态文本
- 表达式插值
- 条件分支
- 列表渲染
- Fragment

```rust
pub enum Node {
    Element(Element),
    Text(String),
    Expression(Binding),
    Conditional(Conditional),
    List(List),
    Fragment(Vec<Node>),
}
```

### Page IR

单次编译产物的完整描述：

```rust
pub struct IrDocument {
    pub ir_version: i32,
    pub manifest: Manifest,
    pub app: AppModule,
    pub pages: IndexMap<String, Page>,
    pub components: IndexMap<String, Component>,
    pub assets: Vec<AssetRef>,
}
```

### Runtime IR

Vela 后端内部表示，每个节点直接对应一次 `aiot.__ce__` / `__cc__` 调用：

```rust
pub struct RuntimeNode {
    pub creator: Creator,
    pub tag: String,
    pub opts: IndexMap<String, OptValue>,
    pub children: Vec<RuntimeNode>,
}
```

## JSON 序列化规则

### Adjacent Tagging

所有枚举使用 `#[serde(tag = "kind", content = "value")]`，序列化形态对称：

```json
{ "kind": "element", "value": { "tag": "div", ... } }
{ "kind": "text", "value": "Hello" }
{ "kind": "expression", "value": { "path": "name", "is_callable": false } }
```

不采用 internal tagging 的原因：部分变体载荷为非结构体（`String`、`Vec`），serde 的内部标签模式不支持。

### 字段命名

Rust 端字段为 `snake_case`，JSON 端保持同名。`Manifest` 内部字段在 Vela 后端生成 `manifest.json` 时手工转写为 `camelCase`。

### 顺序敏感性

以下集合使用 `IndexMap` 保留插入顺序：

- `Element.attrs`、`Element.events`
- `Manifest.router.pages`、`IrDocument.pages`
- `Script.props`、`Script.methods`、`Script.lifecycle`
- `RuntimeNode.opts`

### 默认行为

所有 `Option<T>` 与 `T: Default` 的容器启用 `#[serde(default)]`，写出方可省略空值，读取方永远能正常解析。

## 核心数据结构

### Element

```rust
pub struct Element {
    pub tag: String,
    pub is_component: bool,
    pub attrs: IndexMap<String, Attr>,
    pub events: IndexMap<String, Binding>,
    pub children: Vec<Node>,
    pub spreads: Vec<Binding>,
    pub tag_binding: Option<Binding>,
}
```

### Binding

```rust
pub struct Binding {
    pub path: String,
    pub expr: Option<String>,
    pub is_callable: bool,
}
```

- `path`：最常见形态，如 `"message"`、`"user.name"`
- `expr`：已完成作用域归一的 JS 片段，如 `"_vm_.message + 1"`
- `is_callable`：是否指向函数，决定事件绑定形态

### Script

```rust
pub struct Script {
    pub props: IndexMap<String, Prop>,
    pub private_data: IndexMap<String, serde_json::Value>,
    pub methods: IndexMap<String, String>,
    pub lifecycle: IndexMap<String, String>,
}
```

### Page

```rust
pub struct Page {
    pub route: String,
    pub imports: IndexMap<String, String>,
    pub template: Vec<Node>,
    pub script: Script,
    pub style: StyleTable,
}
```

## 版本控制

`IR_VERSION` 当前为 `1`，锁在 `crates/astroforge-ir/src/lib.rs`。

递增触发条件：
1. 任何字段删除或重命名
2. 任何字段从可选收紧为必填
3. 任何枚举变体删除或重命名
4. 枚举标签策略变更
5. `SelectorKind::index()` 返回值变更
6. `Creator` / `SelectorKind` 的 serde 标签命名变更
7. 任意结构由 `Vec<T>` 改为无序集合或反之

## 跨进程契约

### 写出方（Rsbuild 插件）

```ts
// 默认输出位置
node_modules/.cache/astroforge/ir-document.json
```

### 读取方（Rust CLI）

```rust
use astroforge_ir::io::load_ir_from_path;

let doc = load_ir_from_path("node_modules/.cache/astroforge/ir-document.json")?;
```

加载时强制校验 `ir_version`，不一致返回 `IrError::Version`。

## 测试

| 测试文件 | 覆盖 |
|---------|------|
| `tests/invariants.rs` | 数值与命名不变式 |
| `tests/snapshot_component.rs` | Component IR 全部变体 |
| `tests/snapshot_page.rs` | Page IR 全部结构 |
| `tests/snapshot_runtime.rs` | Runtime IR 全部变体 |
| `tests/snapshot_fixture_01.rs` | fixture 01 端到端 IR |
| `tests/roundtrip.rs` | 关键结构 JSON 往返等价 |
| `tests/io.rs` | 文件 I/O、版本校验 |
| `tests/schema.rs` | JSON Schema 元数据 |

## 下一步

- [Vela 后端](vela-backend.md)
- [打包器](packager.md)
