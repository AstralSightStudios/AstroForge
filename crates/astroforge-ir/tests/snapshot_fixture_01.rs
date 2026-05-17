//! fixture 01 hello-text 的完整 IR 文档 snapshot。
//!
//! 此 snapshot 是后续 Vela 后端的"输入合同"：当 Rsbuild 插件从
//! `fixtures/01-hello-text/astroforge/` 解析得到 IR，或当对照工具从
//! `fixtures/01-hello-text/official/` 经 UX → IR 反推得到 IR 时，二者均应等
//! 价于此 snapshot。源码差异（TSX vs UX）不应影响 IR 形态。

use astroforge_ir::component::{Element, Node};
use astroforge_ir::page::{
    AppConfig, IrDocument, Manifest, Page, RoutePage, Router, Script, StyleTable,
};
use indexmap::IndexMap;
use insta::assert_json_snapshot;

#[test]
fn fixture_01_hello_text_ir_document() {
    let mut router_pages = IndexMap::new();
    router_pages.insert(
        "pages/index".into(),
        RoutePage {
            component: "index".into(),
        },
    );

    let manifest = Manifest {
        package: "com.astroforge.fixture.hello".into(),
        name: "fixture-01-hello-text".into(),
        version_name: "1.0.0".into(),
        version_code: 1,
        min_platform_version: 1200,
        icon: "/common/logo.png".into(),
        simulation_version: Some("default".into()),
        device_type_list: vec!["watch".into()],
        features: vec![],
        config: AppConfig {
            log_level: Some("log".into()),
            design_width: Some("device-width".into()),
        },
        router: Router {
            entry: "pages/index".into(),
            pages: router_pages,
        },
        source: None,
    };

    let mut doc = IrDocument::new(manifest);

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
                spreads: Vec::new(),
                tag_binding: None,
                children: vec![Node::Element(Element {
                    tag: "text".into(),
                    is_component: false,
                    attrs: IndexMap::new(),
                    events: IndexMap::new(),
                    spreads: Vec::new(),
                    tag_binding: None,
                    children: vec![Node::Text("Hello, Vela!".into())],
                })],
            })],
            script: Script::default(),
            style: StyleTable::default(),
        },
    );

    assert_json_snapshot!("fixture_01_hello_text_ir_document", doc);
}
