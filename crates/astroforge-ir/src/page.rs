//! 页面 IR：单个快应用单位（页面或自定义组件）的完整描述。
//!
//! 此层将用户源码拆解为以下结构化部分：模板（沿用 Component IR）、私有数据、
//! 方法、生命周期、props（仅组件）、样式表、资源引用。后端可据此直接下沉，
//! 不再回溯 TSX 源码。
//!
//! 本层为跨进程接口：Rsbuild 前端插件序列化为 JSON 传递给 Rust 后端，
//! 因此所有字段均为 owned 类型并实现 `serde` 协议。

use indexmap::IndexMap;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::IR_VERSION;
use crate::component::Node;

/// 单次编译产物的根 IR 节点。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct IrDocument {
    /// 序列化时取 [`IR_VERSION`]，后端读到不一致版本立即拒绝处理。
    pub ir_version: u32,

    pub manifest: Manifest,

    /// 对应 `app.ux` 的内容。用户未提供时保留默认值，后端生成最小 app 壳。
    #[serde(default)]
    pub app: AppModule,

    /// 路由到页面的映射。键形如 `"pages/index"`，与
    /// [`Manifest::router`] 的 `pages` 字段一一对应。
    pub pages: IndexMap<String, Page>,

    /// 自定义组件表。键为模板中实际使用的 kebab-case 标签名。
    #[serde(default)]
    pub components: IndexMap<String, Component>,

    /// 去重后的资源清单，packager 依此拷贝文件。
    #[serde(default)]
    pub assets: Vec<AssetRef>,
}

impl IrDocument {
    pub fn new(manifest: Manifest) -> Self {
        Self {
            ir_version: IR_VERSION,
            manifest,
            app: AppModule::default(),
            pages: IndexMap::new(),
            components: IndexMap::new(),
            assets: Vec::new(),
        }
    }
}

/// 应用清单。
///
/// 字段命名对齐 Vela 厂商 manifest.json 的 camelCase 键，详见
/// `docs/vela-runtime-abi.md` §8。
///
/// IR 中存在两种表示：
///
/// - 强类型字段（`package` / `router` / `device_type_list` 等）：供 IR
///   消费方（Vela 后端、packager、test-compat runner）做派生计算与校验。
/// - `source`：源 manifest 的原始 JSON 对象，按用户书写顺序保留所有字段，
///   包括 IR 未显式建模的扩展字段（如 `subpackages`、`widgets`、
///   `router.params`、`config.*` 厂商扩展）。
///
/// 后端在生成 Vela `manifest.json` 时，**优先**以 `source` 作为基础对象按
/// 源序输出，并仅追加 `minAPILevel`、`packageInfo` 等流水线注入项；只有当
/// `source` 缺失（如来自旧版前端或单测构造）时才退回按强类型字段重建。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Manifest {
    pub package: String,
    pub name: String,
    pub version_name: String,
    pub version_code: u32,
    pub min_platform_version: u32,
    pub icon: String,

    #[serde(default)]
    pub simulation_version: Option<String>,

    pub device_type_list: Vec<String>,

    /// `system.*` 桥接白名单。未声明的 import 会被运行时拒绝。
    #[serde(default)]
    pub features: Vec<Feature>,

    #[serde(default)]
    pub config: AppConfig,

    pub router: Router,

    /// 源 manifest 的 camelCase 原始 JSON 对象。
    ///
    /// 当前端能提供时，必须是一个 JSON object 且至少包含 `package`、`name`、
    /// `router.entry` 与 `router.pages` 这些 Vela 必需字段；其余字段按用户
    /// 原顺序保留。后端 / packager 不应原地修改本字段。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Feature {
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct AppConfig {
    #[serde(default)]
    pub log_level: Option<String>,

    /// 取值 `"device-width"` 或具体像素数。影响 750 设计稿尺寸换算。
    #[serde(default)]
    pub design_width: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Router {
    pub entry: String,
    pub pages: IndexMap<String, RoutePage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RoutePage {
    /// 通常固定为 `"index"`。每个页面 bundle 的模板都注册在 entry 槽位上。
    pub component: String,
}

/// 应用级模块。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct AppModule {
    /// 应用生命周期方法（`onCreate`、`onDestroy` 等）。值为用户函数体源码
    /// （不含签名），后端负责套用函数外壳。
    #[serde(default)]
    pub lifecycle: IndexMap<String, String>,
}

/// 单个页面单元。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Page {
    pub route: String,

    /// 模板中可见的自定义组件表：kebab-case 标签 →
    /// [`IrDocument::components`] 中的 key。模板中未在此声明的标签视为非法。
    #[serde(default)]
    pub imports: IndexMap<String, String>,

    pub template: Vec<Node>,
    pub script: Script,
    pub style: StyleTable,
}

/// 自定义组件单元。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Component {
    pub name: String,
    pub template: Vec<Node>,
    pub script: Script,
    pub style: StyleTable,
}

/// 脚本部分：响应式数据、方法、生命周期、props（仅组件）。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct Script {
    /// 组件 props 定义。页面单元此字段保持为空。
    #[serde(default)]
    pub props: IndexMap<String, Prop>,

    /// 私有响应式数据。Vela 运行时将 `public` / `protected` / `private` 三
    /// 个访问性桶合并为 `data`。MVP 仅暴露 `private`，其余暂不开放。
    #[serde(default)]
    pub private_data: IndexMap<String, serde_json::Value>,

    /// 方法体源码。值为完整函数表达式（`function (...) { ... }` 或箭头形
    /// 式），由前端 TS 流水线产生，后端原样写入脚本模块。
    #[serde(default)]
    pub methods: IndexMap<String, String>,

    /// 页面或组件级生命周期方法（`onInit` / `onReady` / `onShow` / `onHide`
    /// 等）。值规则同 [`Script::methods`]。
    #[serde(default)]
    pub lifecycle: IndexMap<String, String>,
}

/// 组件 prop 定义。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Prop {
    /// 字面量取值为 `"String"` / `"Number"` / `"Boolean"` / `"Object"` /
    /// `"Array"` / `"Function"`，与厂商 props 定义的 `type` 字段对齐。
    pub r#type: String,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
}

/// 页面或组件作用域的样式表。下沉到运行时层时压缩为 `$app_style$` 的嵌套数组。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct StyleTable {
    pub rules: Vec<StyleRule>,
}

/// 单条样式规则。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StyleRule {
    /// 共享同一声明块的选择器列表。`.a, .b { color: red }` 在此层展开为两个
    /// selector 共享同一 declarations。
    pub selectors: Vec<Selector>,

    /// 此层属性名保持 kebab-case。运行时层转换为 camelCase 以匹配厂商产物。
    pub declarations: IndexMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Selector {
    pub kind: SelectorKind,
    pub name: String,
}

/// 选择器类型。
///
/// 数字索引与 Vela 运行时 `StyleSelectorType.findSelectorIndex` 完全一致，
/// 任何调整都将破坏样式表的二进制兼容性。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SelectorKind {
    Class,
    Id,
    Tag,
    Keyframes,
    FontFace,
}

impl SelectorKind {
    pub const fn index(self) -> u8 {
        match self {
            SelectorKind::Class => 0,
            SelectorKind::Id => 1,
            SelectorKind::Tag => 2,
            SelectorKind::Keyframes => 3,
            SelectorKind::FontFace => 4,
        }
    }
}

/// 静态资源引用。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AssetRef {
    /// 相对项目 `src/` 的路径，带前导 `/`，例如 `"/common/logo.png"`。
    /// 运行时仅识别此种形式。
    pub path: String,

    /// 源文件磁盘绝对路径。packager 据此读取实际字节。
    pub source_path: String,

    /// 内容 SHA-1。厂商 `dynamicAssets` 目录以此构造去重文件名，AstroForge
    /// 沿用同一方案，便于对照测试时 diff 资源图。
    pub digest: String,
}
