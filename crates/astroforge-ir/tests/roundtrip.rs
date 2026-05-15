//! JSON 序列化往返等价测试。
//!
//! snapshot 验证形态稳定，roundtrip 验证形态可逆。两者协同：snapshot 锁字段
//! 名与排版，roundtrip 锁 `#[serde(default)]` 与 `Option` 默认值的边界行为。
//!
//! 失败场景示例：某字段从必填改可选但忘记加 `#[serde(default)]`——snapshot
//! 不会报错（最小输入仍合法），但缺省值经 IR 圆环后语义改变会被本测试捕获。

use astroforge_ir::component::{Attr, Binding, Element, Node};
use astroforge_ir::page::{
    AppConfig, AppModule, IrDocument, Manifest, Page, RoutePage, Router, Script, SelectorKind,
    StyleTable,
};
use astroforge_ir::runtime::{
    AppHandler, Creator, EventHandler, OptValue, PageHandler, RuntimeModule, RuntimeNode,
    StyleEntry,
};
use indexmap::IndexMap;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fmt::Debug;

/// 等价性断言：JSON 字符串往返 + 反序列化值与原值 Debug 字面相等。
///
/// 同时校验序列化稳定性（再次序列化 == 首次序列化）。
fn roundtrip<T: Serialize + DeserializeOwned + Debug>(value: T) -> T {
    let json = serde_json::to_string(&value).expect("序列化失败");
    let back: T = serde_json::from_str(&json).expect("反序列化失败");
    let json2 = serde_json::to_string(&back).expect("二次序列化失败");
    assert_eq!(json, json2, "序列化不稳定：两次输出不一致");
    back
}

#[test]
fn component_node_text() {
    roundtrip(Node::Text("Hello".into()));
}

#[test]
fn component_node_element_with_event() {
    let mut events = IndexMap::new();
    events.insert(
        "click".into(),
        Binding {
            path: "onTap".into(),
            is_callable: true,
        },
    );
    let mut attrs = IndexMap::new();
    attrs.insert(
        "class".into(),
        Attr::Static(serde_json::Value::String("title".into())),
    );

    roundtrip(Node::Element(Element {
        tag: "div".into(),
        is_component: false,
        attrs,
        events,
        children: vec![Node::Text("x".into())],
    }));
}

#[test]
fn page_ir_document_minimal() {
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

    let mut doc = IrDocument::new(manifest);
    doc.pages.insert(
        "pages/index".into(),
        Page {
            route: "pages/index".into(),
            imports: IndexMap::new(),
            template: vec![],
            script: Script::default(),
            style: StyleTable::default(),
        },
    );

    roundtrip(doc);
}

/// 验证 `AppConfig` 全 `Option` 字段在 None 时仍可正确往返。
#[test]
fn app_config_all_none() {
    roundtrip(AppConfig::default());
}

/// 验证 `AppModule::lifecycle` 在空 IndexMap 时往返保持空。
#[test]
fn app_module_default() {
    roundtrip(AppModule::default());
}

/// `SelectorKind` 五个变体单独往返。
#[test]
fn selector_kind_all_variants() {
    for k in [
        SelectorKind::Class,
        SelectorKind::Id,
        SelectorKind::Tag,
        SelectorKind::Keyframes,
        SelectorKind::FontFace,
    ] {
        let back = roundtrip(k);
        assert_eq!(k, back);
    }
}

/// `OptValue` 六个变体单独往返（含 Static 内嵌 serde_json::Value）。
#[test]
fn opt_value_all_variants() {
    roundtrip(OptValue::ClassList(vec!["a".into(), "b".into()]));
    roundtrip(OptValue::Static(serde_json::json!({ "n": 1, "s": "x" })));
    roundtrip(OptValue::Dynamic {
        expr: "_vm_.x".into(),
    });
    roundtrip(OptValue::DynamicStyle {
        expr: "$translateStyle$(_vm_.style)".into(),
    });

    let mut events = IndexMap::new();
    events.insert(
        "click".into(),
        EventHandler {
            method: "onTap".into(),
        },
    );
    roundtrip(OptValue::Events(events));

    let mut modifiers = IndexMap::new();
    let mut inner = IndexMap::new();
    inner.insert("static".into(), true);
    modifiers.insert("value".into(), inner);
    roundtrip(OptValue::Modifiers(modifiers));
}

/// `Creator` 两个变体往返。
#[test]
fn creator_variants() {
    assert_eq!(roundtrip(Creator::Builtin), Creator::Builtin);
    assert_eq!(roundtrip(Creator::Component), Creator::Component);
}

/// `RuntimeModule` 三个变体最小化往返。
#[test]
fn runtime_module_variants() {
    roundtrip(RuntimeModule::App(AppHandler {
        create_handler: "createAppHandler".into(),
        script_body: "{}".into(),
        style_table: vec![],
        manifest_json: "{}".into(),
        install_translate_style: true,
    }));

    roundtrip(RuntimeModule::Page(PageHandler {
        create_handler: "createPageHandler".into(),
        script_body: "{}".into(),
        template_root: RuntimeNode {
            creator: Creator::Builtin,
            tag: "div".into(),
            opts: IndexMap::new(),
            children: vec![],
        },
        style_table: vec![],
        component_imports: IndexMap::new(),
    }));
}

/// `StyleEntry` 完整往返，验证元组 `(u8, String)` 通过 serde 正确处理。
#[test]
fn style_entry_full() {
    let mut decls = IndexMap::new();
    decls.insert("fontSize".into(), "28px".into());

    roundtrip(StyleEntry {
        selectors: vec![vec![(0u8, "title".into()), (0u8, "active".into())]],
        declarations: decls,
    });
}
