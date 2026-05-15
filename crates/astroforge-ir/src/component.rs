//! 组件树 IR：前端编译器从 TSX 解析得到的中间表示。
//!
//! 节点保留 JSX 语义但已脱离源码 AST。属性按求值时机划分为静态与动态两类：
//! 静态属性原样下沉到运行时 opts；动态属性下沉为零参闭包以支持响应式重求值。
//!
//! 本层不依赖厂商运行时概念。后端特有的节点创建、事件绑定、样式编码与系统
//! API 映射均由各目标后端在下沉阶段处理。

use indexmap::IndexMap;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 组件子树中的一个节点。
///
/// 采用 adjacent tagging（`{ "kind": ..., "value": ... }`）而非内部标签，
/// 原因是部分变体携带非结构体载荷（`String`、`Vec`、`serde_json::Value`），
/// serde 的内部标签模式不支持此类形态。adjacent tagging 让所有变体形态对
/// 称，未来新增变体不会引入二义性。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum Node {
    /// 内置元素或用户组件。区分依据为 [`Element::is_component`]，下沉阶段
    /// 据此选择 `__ce__` 或 `__cc__`。
    Element(Element),

    /// 静态文本。JSX 空白合并规则在前端阶段完成，此处为最终呈现字符串。
    Text(String),

    /// 文本插值，例如 `{message}`。下沉为
    /// `value: function() { return _vm_.message }`。
    Expression(Binding),

    /// `if` / `elif` / `else` 分支链。
    Conditional(Conditional),

    /// `array.map(...)` 形式的列表渲染。
    List(List),

    /// `<Fragment>` 或 `<>`。打印阶段不产生节点，仅将子树平铺。
    Fragment(Vec<Node>),
}

/// 单个元素节点。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Element {
    pub tag: String,

    /// 是否为用户组件。识别规则：PascalCase 视为组件，其它视为内置元素。
    /// 在解析阶段一次性确定，避免下沉阶段重复判别。
    pub is_component: bool,

    /// 属性集合。使用 [`IndexMap`] 以保留源码顺序——厂商产物的属性顺序稳定，
    /// 对照测试需按位对齐。
    #[serde(default)]
    pub attrs: IndexMap<String, Attr>,

    /// 事件回调表。键为运行时事件名（去 `on` 前缀、全小写），例如 `onClick`
    /// 映射为 `"click"`，`oncardtap` 映射为 `"cardtap"`。
    #[serde(default)]
    pub events: IndexMap<String, Binding>,

    #[serde(default)]
    pub children: Vec<Node>,
}

/// 属性值。
///
/// 标签策略与 [`Node`] 一致，使用 adjacent tagging。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum Attr {
    /// 字面量。任意 JSON 可序列化值，原样下沉为运行时 opts 中的静态项。
    Static(serde_json::Value),

    /// 来自 TSX 作用域的绑定，下沉为闭包以支持响应式更新。
    Dynamic(Binding),
}

/// 对视图模型上某个值的引用。
///
/// 仅记录路径而不记录表达式 AST：下沉阶段只需将 `path` 拼入
/// `function() { return _vm_.<path>; }` 的字符串模板。响应式追踪仅作用于路
/// 径根段，嵌套字段访问由 JS 成员表达式自然承担。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Binding {
    /// 形如 `"message"` 或 `"user.name"`。
    pub path: String,

    /// 是否指向函数。`true` 时下沉为
    /// `function(evt) { return _vm_.<path>(evt) }`；`false` 时按值读取。
    #[serde(default)]
    pub is_callable: bool,
}

/// `if` / `elif` / `else` 条件链。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Conditional {
    pub branches: Vec<ConditionalBranch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ConditionalBranch {
    /// 末尾 `else` 分支的 guard 为 `None`，其余分支必填。
    pub guard: Option<Binding>,
    pub body: Vec<Node>,
}

/// 列表渲染节点。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct List {
    /// 被迭代的集合。
    pub source: Binding,

    /// 源码中循环变量的标识符。下沉阶段用作闭包形参名以保留可读性。
    pub item_var: String,

    pub index_var: Option<String>,

    /// 节点 key 的提取路径。`None` 时运行时按索引复用节点。
    pub key: Option<Binding>,

    pub body: Vec<Node>,
}
