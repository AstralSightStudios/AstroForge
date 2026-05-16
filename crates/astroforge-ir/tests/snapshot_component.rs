//! Component IR 序列化形态 snapshot。
//!
//! 每个 [`astroforge_ir::component::Node`] 变体一条 snapshot：粒度小、定位
//! 准、回归时差异行少。
//!
//! 接受 / 更新 snapshot：`INSTA_UPDATE=auto cargo test -p astroforge-ir`，
//! 后用 `cargo insta review` 逐条审阅。

use astroforge_ir::component::{
    Attr, Binding, Conditional, ConditionalBranch, Element, List, Node,
};
use indexmap::IndexMap;
use insta::assert_json_snapshot;

/// 内置元素 `<div class="title">Hello</div>`。
#[test]
fn builtin_element_with_static_attr_and_text_child() {
    let mut attrs = IndexMap::new();
    attrs.insert(
        "class".into(),
        Attr::Static(serde_json::Value::String("title".into())),
    );

    let node = Node::Element(Element {
        tag: "div".into(),
        is_component: false,
        attrs,
        events: IndexMap::new(),
        children: vec![Node::Text("Hello".into())],
    });

    assert_json_snapshot!("builtin_element_with_static_attr_and_text_child", node);
}

/// 自定义组件 `<AvatarCard name={user.name} color="#E91E63" onCardTap={onCardTap} />`。
///
/// 同时覆盖动态属性（`Attr::Dynamic`）、静态属性、事件回调。
#[test]
fn custom_component_with_mixed_attrs_and_event() {
    let mut attrs = IndexMap::new();
    attrs.insert(
        "name".into(),
        Attr::Dynamic(Binding {
            path: "user.name".into(),
            is_callable: false,
        }),
    );
    attrs.insert(
        "color".into(),
        Attr::Static(serde_json::Value::String("#E91E63".into())),
    );

    let mut events = IndexMap::new();
    events.insert(
        "cardtap".into(),
        Binding {
            path: "onCardTap".into(),
            is_callable: true,
        },
    );

    let node = Node::Element(Element {
        tag: "AvatarCard".into(),
        is_component: true,
        attrs,
        events,
        children: vec![],
    });

    assert_json_snapshot!("custom_component_with_mixed_attrs_and_event", node);
}

/// 表达式插值 `{message}`。
#[test]
fn expression_text_interpolation() {
    let node = Node::Expression(Binding {
        path: "message".into(),
        is_callable: false,
    });

    assert_json_snapshot!("expression_text_interpolation", node);
}

/// `if` / `elif` / `else` 三分支。
#[test]
fn conditional_three_branches() {
    let node = Node::Conditional(Conditional {
        branches: vec![
            ConditionalBranch {
                guard: Some(Binding {
                    path: "isLoading".into(),
                    is_callable: false,
                }),
                body: vec![Node::Text("Loading".into())],
            },
            ConditionalBranch {
                guard: Some(Binding {
                    path: "hasError".into(),
                    is_callable: false,
                }),
                body: vec![Node::Text("Error".into())],
            },
            ConditionalBranch {
                guard: None,
                body: vec![Node::Text("Ready".into())],
            },
        ],
    });

    assert_json_snapshot!("conditional_three_branches", node);
}

/// 列表渲染 `users.map((user, idx) => <div key={user.id}>{user.name}</div>)`。
///
/// 覆盖 source / item_var / index_var / key 全部字段。
#[test]
fn list_with_key_and_index() {
    let node = Node::List(List {
        source: Binding {
            path: "users".into(),
            is_callable: false,
        },
        item_var: "user".into(),
        index_var: Some("idx".into()),
        key: Some(Binding {
            path: "user.id".into(),
            is_callable: false,
        }),
        body: vec![Node::Element(Element {
            tag: "div".into(),
            is_component: false,
            attrs: IndexMap::new(),
            events: IndexMap::new(),
            children: vec![Node::Expression(Binding {
                path: "user.name".into(),
                is_callable: false,
            })],
        })],
    });

    assert_json_snapshot!("list_with_key_and_index", node);
}

/// Fragment 含两个兄弟节点。
#[test]
fn fragment_with_siblings() {
    let node = Node::Fragment(vec![Node::Text("A".into()), Node::Text("B".into())]);

    assert_json_snapshot!("fragment_with_siblings", node);
}

/// 嵌套树：`<div><AvatarCard /><AvatarCard /></div>`。
///
/// 验证 children 是有序数组（IndexMap-like 顺序敏感性的另一面：Vec 自然有
/// 序，但仍纳入 snapshot 以防未来误改为集合类容器）。
#[test]
fn nested_element_preserves_children_order() {
    let make_card = |name: &str| {
        let mut attrs = IndexMap::new();
        attrs.insert(
            "name".into(),
            Attr::Static(serde_json::Value::String(name.into())),
        );
        Node::Element(Element {
            tag: "AvatarCard".into(),
            is_component: true,
            attrs,
            events: IndexMap::new(),
            children: vec![],
        })
    };

    let node = Node::Element(Element {
        tag: "div".into(),
        is_component: false,
        attrs: IndexMap::new(),
        events: IndexMap::new(),
        children: vec![make_card("张伟"), make_card("李娜")],
    });

    assert_json_snapshot!("nested_element_preserves_children_order", node);
}
