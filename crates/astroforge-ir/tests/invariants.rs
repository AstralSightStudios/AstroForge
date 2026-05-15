//! 数值与命名不变式锁定。
//!
//! 这些值与 Vela 设备运行时 ABI 直接相关——任何变更都会破坏与 aiot-toolkit
//! 产物的二进制级兼容。本文件以测试形式将其钉死，未来调整必须显式 review。
//!
//! 参考：`docs/vela-runtime-abi.md` §6 / §7、`parser/lib/ux/enum/StyleSelectorType.js`。

use astroforge_ir::IR_VERSION;
use astroforge_ir::page::SelectorKind;
use astroforge_ir::runtime::Creator;

/// IR 线格式版本号锁。
///
/// 修改需同步：
/// - 所有产物的反序列化兼容策略；
/// - `astroforge-compiler` / `astroforge-vela` 中读取 IR 的版本校验位；
/// - 本测试常量。
#[test]
fn ir_version_locked() {
    assert_eq!(IR_VERSION, 1, "IR_VERSION 调整需同步全链路兼容性策略");
}

/// 选择器类型索引锁。
///
/// 索引值由 Vela 运行时（`StyleSelectorType.findSelectorIndex`）使用，
/// 必须与厂商一致；调整索引等同于破坏样式表二进制格式。
#[test]
fn selector_kind_index_locked() {
    assert_eq!(SelectorKind::Class.index(), 0);
    assert_eq!(SelectorKind::Id.index(), 1);
    assert_eq!(SelectorKind::Tag.index(), 2);
    assert_eq!(SelectorKind::Keyframes.index(), 3);
    assert_eq!(SelectorKind::FontFace.index(), 4);
}

/// 选择器类型的 serde tag 命名锁。
///
/// IR JSON 中 `selector.kind` 字段值固定为 snake_case。其它工具读取 IR 时
/// 依赖该命名稳定性。
#[test]
fn selector_kind_serde_tags() {
    let cases = [
        (SelectorKind::Class, "class"),
        (SelectorKind::Id, "id"),
        (SelectorKind::Tag, "tag"),
        (SelectorKind::Keyframes, "keyframes"),
        (SelectorKind::FontFace, "font_face"),
    ];
    for (kind, expected) in cases {
        let serialized = serde_json::to_value(kind).unwrap();
        assert_eq!(
            serialized.as_str(),
            Some(expected),
            "SelectorKind::{kind:?} serde tag 期望 {expected:?}",
        );
    }
}

/// Creator 的 serde tag 命名锁。
///
/// `RuntimeNode.creator` 字段在 IR JSON 中固定为 `"builtin"` / `"component"`，
/// 该值进入对照测试的稳定 diff 输入。
#[test]
fn creator_serde_tags() {
    assert_eq!(
        serde_json::to_value(Creator::Builtin).unwrap().as_str(),
        Some("builtin"),
    );
    assert_eq!(
        serde_json::to_value(Creator::Component).unwrap().as_str(),
        Some("component"),
    );
}
