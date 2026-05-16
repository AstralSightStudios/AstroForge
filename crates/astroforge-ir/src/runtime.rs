//! 运行时 IR：编译流程的末层，直接对应 Vela JS 运行时可执行的指令。
//!
//! 每个 [`RuntimeNode`] 对应一次 `aiot.__ce__` 或 `aiot.__cc__` 调用，每个
//! [`StyleEntry`] 对应 `$app_style$` 中的一行，每个 [`RuntimeModule`] 对应
//! 一份包好包装函数的 JS 模块。
//!
//! 此层将"打印 JS"建立在结构化 IR 之上而非字符串拼接，使对照测试可在 AST 层
//! 面 diff：源码格式差异（空白、换行）不影响等价性判定，仅运行时调用形状
//! 决定兼容性。

use indexmap::IndexMap;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 设备运行时装载的最小单元：应用入口、页面入口或自定义组件入口。
///
/// 序列化策略与 [`OptValue`] 一致，使用 adjacent tagging 以保持跨 IR 枚举
/// 形态对称。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum RuntimeModule {
    App(AppHandler),
    Page(PageHandler),
    Component(ComponentHandler),
}

/// 应用入口模块（`app.js`）的运行时形态。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AppHandler {
    /// 包装函数名。当前固定为 `"createAppHandler"`，以字段形式存储以便后续
    /// 适配其它运行时变体。
    pub create_handler: String,

    /// 用户 `app.ux` 中 `export default { ... }` 对象的源码片段，整段写入
    /// `exports.default = ...` 赋值位置。本层不解析内部结构，仅保证语法位置
    /// 正确。
    pub script_body: String,

    /// 应用模块按惯例无样式，但保留字段以维持模块结构同构。序列化结果为
    /// `$app_style$ = []`。
    pub style_table: Vec<StyleEntry>,

    /// 内联 `manifest.json` 文本。后端注册为 `./src/manifest.json` 这个
    /// webpack 模块，模块体为 `module.exports = JSON.parse(...)`。
    pub manifest_json: String,

    /// 是否在 `__webpack_require__.g` 上注入 `$translateStyle$`。仅 app 模块
    /// 安装一次，全局共享。
    pub install_translate_style: bool,
}

/// 页面入口模块（`pages/<name>/<name>.js`）的运行时形态。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PageHandler {
    /// 当前固定为 `"createPageHandler"`。
    pub create_handler: String,

    pub script_body: String,
    pub template_root: RuntimeNode,
    pub style_table: Vec<StyleEntry>,

    /// 页面引用的自定义组件清单，将在页面 entry 之前注册到 `$app_exports$`。
    /// 键为模板中使用的 kebab-case 标签名，值为 webpack moduleId（沿用厂商
    /// 形式 `"./src/components/<name>.ux"` 以利对照 diff）。
    #[serde(default)]
    pub component_imports: IndexMap<String, String>,
}

/// 自定义组件模块的运行时形态。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ComponentHandler {
    pub name: String,
    pub script_body: String,
    pub template_root: RuntimeNode,
    pub style_table: Vec<StyleEntry>,
}

/// 一次运行时元素创建调用。
///
/// 子节点采用同型结构递归。运行时层不存在 React 中的组件边界——每个节点都
/// 是一次直接调用。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RuntimeNode {
    pub creator: Creator,
    pub tag: String,

    /// `__opts__` 对象内容。使用 [`IndexMap`] 以保留属性顺序——厂商产物的
    /// 属性顺序稳定，对照测试需按位对齐，HashMap 不可用。
    pub opts: IndexMap<String, OptValue>,

    pub children: Vec<RuntimeNode>,
}

/// 节点创建器类型。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Creator {
    /// 内置元素，下沉为 `aiot.__ce__`。
    Builtin,
    /// 自定义组件，下沉为 `aiot.__cc__`。
    Component,
}

/// `__opts__` 中各槽位的值。各变体形状参见 `docs/vela-runtime-abi.md` §7。
///
/// 下沉阶段的主要职责即将 Component IR 中的属性归类至本枚举的合适变体。
///
/// 序列化采用 adjacent tagging（`{ "kind": ..., "value": ... }`），保持与
/// Component IR 中 [`crate::component::Node`] 等枚举一致的形态。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum OptValue {
    /// 静态 class 列表，形如 `classList: ["title", "active"]`。
    /// 动态 class 应使用 [`OptValue::Dynamic`]。
    ClassList(Vec<String>),

    /// 任意 JSON 可序列化字面量：字符串、数字、布尔。
    Static(serde_json::Value),

    /// 动态求值表达式。`expr` 为返回值表达式的 JS 源码片段，例如
    /// `"_vm_.message"`。打印阶段套用 `function() { return <expr>; }`。
    Dynamic { expr: String },

    /// 内联 style 的动态表达式。`expr` 一般形如
    /// `__webpack_require__.g.$translateStyle$("background-color: " + _vm_.color)`。
    ///
    /// 单独成变体的原因：内联 style 必须经 `$translateStyle$` 中转为属性对
    /// 象，此过程涉及运行时行为而非单纯求值，与 [`OptValue::Dynamic`] 的处
    /// 理路径不同。
    DynamicStyle { expr: String },

    /// 事件回调表，形如 `events: { click: function(evt) { return _vm_.onTap(evt) } }`。
    Events(IndexMap<String, EventHandler>),

    /// 属性装饰器，对应 UX 模板中 `attr.modifier` 语法。
    Modifiers(IndexMap<String, IndexMap<String, bool>>),
}

/// 事件回调描述。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EventHandler {
    /// 视图模型上的方法名，例如 `"onCardTap"`。打印阶段拼接为
    /// `function(evt) { return _vm_.<method>(evt); }`。
    pub method: String,
}

/// 样式表中的一行。
///
/// 序列化目标形态为嵌套数组：
/// `[ [[selectorKind, name], ...], { camelCaseProp: "value" } ]`
/// 本结构保持字段命名，打印阶段压缩为位置敏感数组。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StyleEntry {
    /// 单个样式项的选择器描述。
    ///
    /// 外层 [`Vec`] 为兼容早期 IR 保留；Vela 打印阶段会将其中的 simple
    /// selector 链压平为官方 `selectorArr`。逗号分隔的多个 selector 应在
    /// 下沉阶段拆成多个 [`StyleEntry`]，不能在单项中多包一层数组。
    pub selectors: Vec<Vec<(u8, String)>>,

    /// camelCase 属性名 → 带单位字符串值。
    pub declarations: IndexMap<String, String>,
}
