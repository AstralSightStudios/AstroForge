//! Page IR 序列化形态 snapshot。
//!
//! 单字段最小化构造，每个 snapshot 只验证一个结构的稳定形态。覆盖：
//! Manifest、AppModule、Page、Component、Script、StyleTable、AssetRef、IrDocument。

use astroforge_ir::component::{Element, Node};
use astroforge_ir::page::{
    AppConfig, AppModule, AssetRef, Component, Feature, IrDocument, Manifest, Page, Prop,
    RoutePage, Router, Script, Selector, SelectorKind, StyleRule, StyleTable,
};
use indexmap::IndexMap;
use insta::assert_json_snapshot;

fn watch_manifest() -> Manifest {
    let mut router_pages = IndexMap::new();
    router_pages.insert(
        "pages/index".into(),
        RoutePage {
            component: "index".into(),
        },
    );
    Manifest {
        package: "com.astroforge.fixture.hello".into(),
        name: "fixture-01-hello-text".into(),
        version_name: "1.0.0".into(),
        version_code: 1,
        min_platform_version: 1200,
        icon: "/common/logo.png".into(),
        simulation_version: Some("default".into()),
        device_type_list: vec!["watch".into()],
        features: vec![Feature {
            name: "system.router".into(),
        }],
        config: AppConfig {
            log_level: Some("log".into()),
            design_width: Some("device-width".into()),
        },
        router: Router {
            entry: "pages/index".into(),
            pages: router_pages,
        },
        source: None,
    }
}

/// `Manifest`：覆盖 features / config / router 全部子结构。
#[test]
fn manifest_full() {
    assert_json_snapshot!("manifest_full", watch_manifest());
}

/// `AppModule`：仅 lifecycle 字段，验证 `IndexMap<String, String>` 序列化形态。
#[test]
fn app_module_with_lifecycle() {
    let mut lifecycle = IndexMap::new();
    lifecycle.insert("onCreate".into(), "console.log('app created');".into());
    lifecycle.insert("onDestroy".into(), "console.log('app destroyed');".into());
    assert_json_snapshot!("app_module_with_lifecycle", AppModule { lifecycle });
}

/// `Script`：覆盖 props / private_data / methods / lifecycle 四类字段。
#[test]
fn script_full_shape() {
    let mut props = IndexMap::new();
    props.insert(
        "name".into(),
        Prop {
            r#type: "String".into(),
            default: Some(serde_json::Value::String("用户".into())),
        },
    );
    props.insert(
        "active".into(),
        Prop {
            r#type: "Boolean".into(),
            default: Some(serde_json::Value::Bool(false)),
        },
    );

    let mut private_data = IndexMap::new();
    private_data.insert(
        "message".into(),
        serde_json::Value::String("点击联系人查看信息".into()),
    );

    let mut methods = IndexMap::new();
    methods.insert(
        "onCardTap".into(),
        "function(evt) { this.message = evt.detail.name }".into(),
    );

    let mut lifecycle = IndexMap::new();
    lifecycle.insert("onInit".into(), "function() {}".into());

    let script = Script {
        props,
        private_data,
        methods,
        lifecycle,
    };

    assert_json_snapshot!("script_full_shape", script);
}

/// `StyleTable`：含逗号分隔的多 selector 与 kebab-case 属性名。
///
/// 注意属性在此层保持 kebab-case；camelCase 转换发生在 Runtime IR 层。
#[test]
fn style_table_with_multi_selectors_and_kebab_props() {
    let mut declarations = IndexMap::new();
    declarations.insert("flex-direction".into(), "column".into());
    declarations.insert("align-items".into(), "center".into());

    let style = StyleTable {
        rules: vec![StyleRule {
            selectors: vec![
                Selector {
                    kind: SelectorKind::Class,
                    name: "demo-page".into(),
                },
                Selector {
                    kind: SelectorKind::Class,
                    name: "alt-page".into(),
                },
            ],
            declarations,
        }],
    };

    assert_json_snapshot!("style_table_with_multi_selectors_and_kebab_props", style);
}

/// `AssetRef`：路径 / 源路径 / digest 三字段稳定。
#[test]
fn asset_ref_shape() {
    let asset = AssetRef {
        path: "/common/logo.png".into(),
        source_path: "<workspace>/fixtures/01-hello-text/astroforge/src/common/logo.png".into(),
        digest: "0123456789abcdef0123456789abcdef01234567".into(),
    };
    assert_json_snapshot!("asset_ref_shape", asset);
}

/// `Page`：含 imports / template / script / style 四块。
#[test]
fn page_minimal() {
    let mut imports = IndexMap::new();
    imports.insert("avatar-card".into(), "avatar-card".into());

    let page = Page {
        route: "pages/index".into(),
        imports,
        template: vec![Node::Element(Element {
            tag: "div".into(),
            is_component: false,
            attrs: IndexMap::new(),
            events: IndexMap::new(),
            spreads: Vec::new(),
            tag_binding: None,
            children: vec![],
        })],
        script: Script::default(),
        style: StyleTable::default(),
    };

    assert_json_snapshot!("page_minimal", page);
}

/// `Component`：与 Page 的差异在于自带 name 字段且无 route。
#[test]
fn component_minimal() {
    let component = Component {
        name: "avatar-card".into(),
        template: vec![Node::Element(Element {
            tag: "text".into(),
            is_component: false,
            attrs: IndexMap::new(),
            events: IndexMap::new(),
            spreads: Vec::new(),
            tag_binding: None,
            children: vec![],
        })],
        script: Script::default(),
        style: StyleTable::default(),
    };

    assert_json_snapshot!("component_minimal", component);
}

/// `IrDocument`：顶层结构，仅 manifest 必填，其余字段默认值序列化结果。
#[test]
fn ir_document_empty_app() {
    let doc = IrDocument::new(watch_manifest());
    assert_json_snapshot!("ir_document_empty_app", doc);
}
