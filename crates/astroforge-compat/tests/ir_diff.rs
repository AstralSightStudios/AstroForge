//! `astroforge-compat::ir_diff` 单元测试。
//!
//! 用例覆盖：
//! - 完全相等输入 → 空差异列表；
//! - 单字段值差异 → 一条 `Value`；
//! - 类型不一致 → `TypeMismatch`；
//! - 对象键的左独有 / 右独有 → `Extra` / `Missing`；
//! - 数组长度差 → `ArrayLength` + 公共下标差 + 越界 `Extra` / `Missing`；
//! - JSON Pointer 转义（路径中含 `/`、`~`）；
//! - 在真实 IR 文档上的端到端 diff（fixture 01 vs 修改版）。

use astroforge_compat::ir_diff::{Diff, DiffKind, diff, diff_values};
use astroforge_ir::component::{Element, Node};
use astroforge_ir::page::{
    AppConfig, IrDocument, Manifest, Page, RoutePage, Router, Script, StyleTable,
};
use indexmap::IndexMap;
use serde_json::json;

fn collect_paths(diffs: &[Diff]) -> Vec<String> {
    diffs.iter().map(|d| d.path.clone()).collect()
}

#[test]
fn equal_inputs_produce_no_diffs() {
    let a = json!({ "x": 1, "y": [1, 2, 3], "z": { "n": null } });
    let b = a.clone();
    assert!(diff_values(&a, &b).is_empty());
}

#[test]
fn single_value_difference_reports_value_diff() {
    let a = json!({ "x": 1 });
    let b = json!({ "x": 2 });
    let diffs = diff_values(&a, &b);
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].path, "/x");
    assert!(matches!(diffs[0].kind, DiffKind::Value { .. }));
}

#[test]
fn type_mismatch_reports_type_diff() {
    let a = json!({ "x": "hello" });
    let b = json!({ "x": 42 });
    let diffs = diff_values(&a, &b);
    assert_eq!(diffs.len(), 1);
    assert!(matches!(diffs[0].kind, DiffKind::TypeMismatch { .. }));
}

#[test]
fn missing_and_extra_object_keys() {
    let a = json!({ "only_left": 1, "shared": 0 });
    let b = json!({ "only_right": 2, "shared": 0 });
    let diffs = diff_values(&a, &b);
    let paths = collect_paths(&diffs);
    assert!(paths.contains(&"/only_left".to_string()));
    assert!(paths.contains(&"/only_right".to_string()));
    assert_eq!(diffs.len(), 2);

    let extra = diffs.iter().find(|d| d.path == "/only_left").unwrap();
    let missing = diffs.iter().find(|d| d.path == "/only_right").unwrap();
    assert!(matches!(extra.kind, DiffKind::Extra { .. }));
    assert!(matches!(missing.kind, DiffKind::Missing { .. }));
}

#[test]
fn array_length_difference_reports_length_and_boundary_entries() {
    let a = json!([1, 2, 3, 4]);
    let b = json!([1, 9, 3]);
    let diffs = diff_values(&a, &b);

    // 期望：root 长度差 + /1 值差 + /3 Extra。
    let paths = collect_paths(&diffs);
    assert!(paths.iter().any(|p| p.is_empty()), "应记录根路径长度差: {paths:?}");
    assert!(paths.contains(&"/1".to_string()));
    assert!(paths.contains(&"/3".to_string()));

    assert!(matches!(
        diffs.iter().find(|d| d.path.is_empty()).unwrap().kind,
        DiffKind::ArrayLength { left: 4, right: 3 }
    ));
}

#[test]
fn json_pointer_escapes_slashes_in_keys() {
    let a = json!({ "pages/index": { "v": 1 } });
    let b = json!({ "pages/index": { "v": 2 } });
    let diffs = diff_values(&a, &b);
    assert_eq!(diffs.len(), 1);
    // 键中的 `/` 应转义为 `~1`，再以 `/` 分隔层级 → `/pages~1index/v`。
    assert_eq!(diffs[0].path, "/pages~1index/v");
}

#[test]
fn json_pointer_escapes_tilde_in_keys() {
    let a = json!({ "weird~key": 1 });
    let b = json!({ "weird~key": 2 });
    let diffs = diff_values(&a, &b);
    assert_eq!(diffs[0].path, "/weird~0key");
}

#[test]
fn end_to_end_ir_document_diff_locates_template_change() {
    let mut router_pages = IndexMap::new();
    router_pages.insert(
        "pages/index".into(),
        RoutePage {
            component: "index".into(),
        },
    );
    let manifest = Manifest {
        package: "com.x".into(),
        name: "x".into(),
        version_name: "1.0.0".into(),
        version_code: 1,
        min_platform_version: 1200,
        icon: "/i.png".into(),
        simulation_version: None,
        device_type_list: vec!["watch".into()],
        features: vec![],
        config: AppConfig::default(),
        router: Router {
            entry: "pages/index".into(),
            pages: router_pages,
        },
    };

    let make_doc = |text: &str| {
        let mut doc = IrDocument::new(manifest.clone());
        doc.pages.insert(
            "pages/index".into(),
            Page {
                route: "pages/index".into(),
                imports: IndexMap::new(),
                template: vec![Node::Element(Element {
                    tag: "div".into(),
                    is_component: false,
                    attrs: IndexMap::new(),
                    events: IndexMap::new(),
                    children: vec![Node::Text(text.into())],
                })],
                script: Script::default(),
                style: StyleTable::default(),
            },
        );
        doc
    };

    let left = make_doc("Hello, Vela!");
    let right = make_doc("Goodbye, Vela!");

    let diffs = diff(&left, &right).unwrap();
    assert_eq!(diffs.len(), 1, "应仅有文本节点 value 一处变更：{diffs:#?}");
    assert_eq!(
        diffs[0].path,
        "/pages/pages~1index/template/0/value/children/0/value",
        "diff 路径应精确定位到文本变更点",
    );
    assert!(matches!(diffs[0].kind, DiffKind::Value { .. }));
}

#[test]
fn diff_display_contains_path_and_arrow_marker() {
    let a = json!({ "k": 1 });
    let b = json!({ "k": 2 });
    let diffs = diff_values(&a, &b);
    let rendered = format!("{}", diffs[0]);
    assert!(rendered.contains("/k"), "rendered: {rendered}");
    assert!(rendered.contains("!="), "rendered: {rendered}");
}
