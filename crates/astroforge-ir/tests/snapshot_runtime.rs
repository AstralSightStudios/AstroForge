//! Runtime IR 序列化形态 snapshot。
//!
//! 此层最贴近设备运行时 ABI——每一份 snapshot 都直接决定 Vela 后端的字面量
//! 形态。任何 diff 都需对照 `docs/vela-runtime-abi.md` 重新审阅。

use astroforge_ir::page::SelectorKind;
use astroforge_ir::runtime::{
    AppHandler, ComponentHandler, Creator, EventHandler, OptValue, PageHandler, RuntimeModule,
    RuntimeNode, StyleEntry,
};
use indexmap::IndexMap;
use insta::assert_json_snapshot;

fn manifest_json_literal() -> String {
    r#"{"package":"com.astroforge.fixture.hello","name":"fixture-01-hello-text","versionName":"1.0.0","versionCode":1,"minPlatformVersion":1200,"icon":"/common/logo.png","deviceTypeList":["watch"],"router":{"entry":"pages/index","pages":{"pages/index":{"component":"index"}}}}"#
        .into()
}

/// 一次 `aiot.__ce__("text", { value: "Hello" })` 调用的最小形态。
#[test]
fn runtime_node_builtin_static_text() {
    let mut opts = IndexMap::new();
    opts.insert(
        "value".into(),
        OptValue::Static(serde_json::Value::String("Hello, Vela!".into())),
    );

    let node = RuntimeNode {
        creator: Creator::Builtin,
        tag: "text".into(),
        opts,
        children: vec![],
    };

    assert_json_snapshot!("runtime_node_builtin_static_text", node);
}

/// `aiot.__cc__("avatar-card", { name: "张伟", color: "#E91E63", events: { cardtap: ... } })`。
///
/// 同时覆盖：用户 props 平铺于 opts 顶层 / events / classList / Dynamic / DynamicStyle。
#[test]
fn runtime_node_component_with_all_opt_value_variants() {
    let mut events = IndexMap::new();
    events.insert(
        "cardtap".into(),
        EventHandler {
            method: "onCardTap".into(),
        },
    );

    let mut opts = IndexMap::new();
    opts.insert(
        "classList".into(),
        OptValue::ClassList(vec!["avatar-card".into(), "active".into()]),
    );
    opts.insert(
        "name".into(),
        OptValue::Static(serde_json::Value::String("张伟".into())),
    );
    opts.insert(
        "title".into(),
        OptValue::Dynamic {
            expr: "_vm_.title".into(),
        },
    );
    opts.insert(
        "style".into(),
        OptValue::DynamicStyle {
            expr: r#"__webpack_require__.g.$translateStyle$("background-color: " + _vm_.color)"#
                .into(),
        },
    );
    opts.insert("events".into(), OptValue::Events(events));

    let node = RuntimeNode {
        creator: Creator::Component,
        tag: "avatar-card".into(),
        opts,
        children: vec![],
    };

    assert_json_snapshot!("runtime_node_component_with_all_opt_value_variants", node);
}

/// `OptValue::Modifiers` 单独覆盖——来源于 UX 的 `attr.mod` 装饰器语法。
#[test]
fn opt_value_modifiers() {
    let mut value_mods = IndexMap::new();
    value_mods.insert("static".into(), true);

    let mut modifiers = IndexMap::new();
    modifiers.insert("value".into(), value_mods);

    let mut opts = IndexMap::new();
    opts.insert("modifiers".into(), OptValue::Modifiers(modifiers));

    let node = RuntimeNode {
        creator: Creator::Builtin,
        tag: "text".into(),
        opts,
        children: vec![],
    };

    assert_json_snapshot!("opt_value_modifiers", node);
}

/// `StyleEntry`：覆盖 compound 选择器（链）与逗号分隔的多 selector 共享声明。
///
/// 数字选择器索引由 [`SelectorKind::index`] 提供，保留与 `parser/lib/ux/enum/
/// StyleSelectorType.js` 完全一致的语义。
#[test]
fn style_entry_compound_and_grouped_selectors() {
    let mut decls = IndexMap::new();
    decls.insert("flexDirection".into(), "column".into());
    decls.insert("backgroundColor".into(), "#1a1a1a".into());

    let entry = StyleEntry {
        selectors: vec![
            vec![
                (SelectorKind::Class.index(), "card".into()),
                (SelectorKind::Class.index(), "active".into()),
            ],
            vec![(SelectorKind::Id.index(), "main".into())],
        ],
        declarations: decls,
    };

    assert_json_snapshot!("style_entry_compound_and_grouped_selectors", entry);
}

/// `EventHandler` 单独序列化形态。
#[test]
fn event_handler_shape() {
    assert_json_snapshot!(
        "event_handler_shape",
        EventHandler {
            method: "handleClick".into(),
        }
    );
}

/// `RuntimeModule::App` 完整形态。
#[test]
fn runtime_module_app() {
    let module = RuntimeModule::App(AppHandler {
        create_handler: "createAppHandler".into(),
        script_body: "{ onCreate() { console.log('app created'); }, onDestroy() {} }".into(),
        style_table: vec![],
        manifest_json: manifest_json_literal(),
        install_translate_style: true,
    });

    assert_json_snapshot!("runtime_module_app", module);
}

/// `RuntimeModule::Page` 完整形态，含 component_imports 与一个最小模板。
#[test]
fn runtime_module_page_with_imports() {
    let mut component_imports = IndexMap::new();
    component_imports.insert(
        "avatar-card".into(),
        "./src/components/avatar-card.ux".into(),
    );

    let mut opts = IndexMap::new();
    opts.insert(
        "value".into(),
        OptValue::Static(serde_json::Value::String("Hello".into())),
    );

    let module = RuntimeModule::Page(PageHandler {
        create_handler: "createPageHandler".into(),
        script_body: "{}".into(),
        template_root: RuntimeNode {
            creator: Creator::Builtin,
            tag: "text".into(),
            opts,
            children: vec![],
        },
        style_table: vec![],
        component_imports,
    });

    assert_json_snapshot!("runtime_module_page_with_imports", module);
}

/// `RuntimeModule::Component` 完整形态。
#[test]
fn runtime_module_component() {
    let module = RuntimeModule::Component(ComponentHandler {
        name: "avatar-card".into(),
        script_body: "{ props: { name: { type: String, default: '用户' } } }".into(),
        template_root: RuntimeNode {
            creator: Creator::Builtin,
            tag: "div".into(),
            opts: IndexMap::new(),
            children: vec![],
        },
        style_table: vec![],
    });

    assert_json_snapshot!("runtime_module_component", module);
}
