//! IR JSON Schema 测试。
//!
//! Schema 是给外部工具消费的契约，需要长期稳定。但 schemars 生成的完整文档
//! 体积较大且对字段顺序敏感（serde_json::Value 内部字段排序在 schemars 0.8
//! 中并非完全确定）；做整体 snapshot 容易在无关变更上抖动。
//!
//! 因此本测试只盯关键不变式：
//! - 根 schema 含 `$schema` 与 `title`；
//! - `definitions` 中包含所有用户可见的核心类型；
//! - 同一进程内多次生成稳定。

use astroforge_ir::schema::{ir_document_schema, runtime_module_schema};
use schemars::schema::RootSchema;

fn definitions(schema: &RootSchema) -> serde_json::Map<String, serde_json::Value> {
    let value = serde_json::to_value(schema).unwrap();
    value
        .get("definitions")
        .and_then(|v| v.as_object())
        .expect("schema 应含 definitions")
        .clone()
}

fn assert_contains_types(defs: &serde_json::Map<String, serde_json::Value>, required: &[&str]) {
    let missing: Vec<&str> = required
        .iter()
        .copied()
        .filter(|name| !defs.contains_key(*name))
        .collect();
    assert!(
        missing.is_empty(),
        "schema 缺失类型：{missing:?}\n现有定义：{:?}",
        defs.keys().collect::<Vec<_>>(),
    );
}

#[test]
fn ir_document_schema_metadata() {
    let value = serde_json::to_value(ir_document_schema()).unwrap();
    assert_eq!(
        value.get("$schema").and_then(|v| v.as_str()),
        Some("http://json-schema.org/draft-07/schema#"),
    );
    assert_eq!(
        value.get("title").and_then(|v| v.as_str()),
        Some("IrDocument"),
    );
}

#[test]
fn ir_document_schema_contains_component_and_page_types() {
    let defs = definitions(&ir_document_schema());
    assert_contains_types(
        &defs,
        &[
            // Component IR
            "Node",
            "Element",
            "Attr",
            "Binding",
            "Conditional",
            "ConditionalBranch",
            "List",
            // Page IR
            "Manifest",
            "Router",
            "RoutePage",
            "Feature",
            "AppConfig",
            "AppModule",
            "Page",
            "Component",
            "Script",
            "Prop",
            "StyleTable",
            "StyleRule",
            "Selector",
            "SelectorKind",
            "AssetRef",
        ],
    );
}

#[test]
fn runtime_module_schema_metadata() {
    let value = serde_json::to_value(runtime_module_schema()).unwrap();
    assert_eq!(
        value.get("$schema").and_then(|v| v.as_str()),
        Some("http://json-schema.org/draft-07/schema#"),
    );
    assert_eq!(
        value.get("title").and_then(|v| v.as_str()),
        Some("RuntimeModule"),
    );
}

#[test]
fn runtime_module_schema_contains_runtime_types() {
    let defs = definitions(&runtime_module_schema());
    assert_contains_types(
        &defs,
        &[
            "RuntimeNode",
            "Creator",
            "OptValue",
            "EventHandler",
            "StyleEntry",
            "AppHandler",
            "PageHandler",
            "ComponentHandler",
        ],
    );
}

#[test]
fn ir_document_schema_excludes_runtime_internals() {
    let defs = definitions(&ir_document_schema());
    for runtime_only in [
        "RuntimeModule",
        "RuntimeNode",
        "OptValue",
        "AppHandler",
        "PageHandler",
        "ComponentHandler",
    ] {
        assert!(
            !defs.contains_key(runtime_only),
            "{runtime_only} 是后端内部类型，不应出现在 IrDocument schema 中",
        );
    }
}

#[test]
fn schema_generation_is_deterministic() {
    let a = serde_json::to_string(&ir_document_schema()).unwrap();
    let b = serde_json::to_string(&ir_document_schema()).unwrap();
    assert_eq!(a, b, "ir_document_schema 生成结果不稳定");

    let a = serde_json::to_string(&runtime_module_schema()).unwrap();
    let b = serde_json::to_string(&runtime_module_schema()).unwrap();
    assert_eq!(a, b, "runtime_module_schema 生成结果不稳定");
}
