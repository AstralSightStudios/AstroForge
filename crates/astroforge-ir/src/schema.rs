//! IR JSON Schema 导出。
//!
//! 提供两组 schema：
//!
//! - [`ir_document_schema`]：Component + Page IR。这是 Rsbuild 插件向 Rust
//!   后端传递的跨进程接口契约，是用户工具最常消费的文档。
//! - [`runtime_module_schema`]：Runtime IR。Vela 后端内部表示——AST diff 工
//!   具与对照测试需要据此理解 RuntimeModule 形态，不进入用户 IR 文件。
//!
//! schema 由 [`schemars`] 反射类型定义自动生成。使用 Draft 7 以最大化下游
//! validator（ajv 等）兼容性。

use schemars::JsonSchema;
use schemars::r#gen::SchemaSettings;
use schemars::schema::RootSchema;

use crate::page::IrDocument;
use crate::runtime::RuntimeModule;

/// Component + Page IR 的根 schema：跨进程 IR 文件契约。
pub fn ir_document_schema() -> RootSchema {
    schema_for::<IrDocument>()
}

/// Runtime IR 的根 schema：后端内部形态的契约。
pub fn runtime_module_schema() -> RootSchema {
    schema_for::<RuntimeModule>()
}

/// [`ir_document_schema`] 的带缩进 JSON 形态。
pub fn ir_document_schema_pretty() -> String {
    schema_to_pretty(&ir_document_schema())
}

/// [`runtime_module_schema`] 的带缩进 JSON 形态。
pub fn runtime_module_schema_pretty() -> String {
    schema_to_pretty(&runtime_module_schema())
}

fn schema_for<T: JsonSchema>() -> RootSchema {
    let settings = SchemaSettings::draft07();
    let generator = settings.into_generator();
    generator.into_root_schema_for::<T>()
}

fn schema_to_pretty(schema: &RootSchema) -> String {
    serde_json::to_string_pretty(schema)
        .expect("RootSchema 序列化不应失败：仅含 JSON 兼容类型")
}
