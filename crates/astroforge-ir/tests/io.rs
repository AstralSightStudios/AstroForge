//! IR 文件 I/O 单元测试。
//!
//! 覆盖：紧凑写出 ↔ 加载等价、pretty 写出 ↔ 加载等价、版本不匹配的错误路径、
//! 父目录自动创建。

use astroforge_ir::IR_VERSION;
use astroforge_ir::io::{IoError, load_ir_from_path, save_ir_pretty, save_ir_to_path};
use astroforge_ir::page::{
    AppConfig, IrDocument, Manifest, Page, RoutePage, Router, Script, StyleTable,
};
use camino::Utf8PathBuf;
use indexmap::IndexMap;

fn sample_doc() -> IrDocument {
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
    doc
}

#[test]
fn save_then_load_compact_roundtrips() {
    let dir = tempfile::tempdir().unwrap();
    let path = Utf8PathBuf::from_path_buf(dir.path().join("ir.json")).unwrap();

    let doc = sample_doc();
    save_ir_to_path(&path, &doc).unwrap();

    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(
        !raw.contains('\n'),
        "紧凑形态不应包含换行符，实际：{raw}",
    );

    let back = load_ir_from_path(&path).unwrap();
    assert_eq!(
        serde_json::to_string(&doc).unwrap(),
        serde_json::to_string(&back).unwrap(),
    );
}

#[test]
fn save_pretty_includes_indentation_and_trailing_newline() {
    let dir = tempfile::tempdir().unwrap();
    let path = Utf8PathBuf::from_path_buf(dir.path().join("ir.json")).unwrap();

    save_ir_pretty(&path, &sample_doc()).unwrap();

    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(raw.ends_with('\n'), "pretty 写出末尾应有换行符");
    assert!(raw.contains("\n  "), "pretty 写出应含 2 空格缩进");
}

#[test]
fn load_rejects_version_mismatch() {
    let dir = tempfile::tempdir().unwrap();
    let path = Utf8PathBuf::from_path_buf(dir.path().join("ir.json")).unwrap();

    // 构造带未来版本号的最小 IR 文档。
    let payload = serde_json::json!({
        "ir_version": IR_VERSION + 99,
        "manifest": serde_json::to_value(sample_doc().manifest).unwrap(),
        "app": { "lifecycle": {} },
        "pages": {},
        "components": {},
        "assets": [],
    });
    std::fs::write(&path, payload.to_string()).unwrap();

    let err = load_ir_from_path(&path).unwrap_err();
    match err {
        IoError::Ir(astroforge_ir::IrError::Version { expected, got }) => {
            assert_eq!(expected, IR_VERSION);
            assert_eq!(got, IR_VERSION + 99);
        }
        other => panic!("期望 Version 错误，实际：{other:?}"),
    }
}

#[test]
fn save_creates_missing_parent_dirs() {
    let dir = tempfile::tempdir().unwrap();
    let path = Utf8PathBuf::from_path_buf(
        dir.path().join("nested").join("more").join("ir.json"),
    )
    .unwrap();

    save_ir_to_path(&path, &sample_doc()).unwrap();
    assert!(path.exists(), "中间目录应自动创建");
}

#[test]
fn load_reports_parse_error_with_path() {
    let dir = tempfile::tempdir().unwrap();
    let path = Utf8PathBuf::from_path_buf(dir.path().join("ir.json")).unwrap();
    std::fs::write(&path, "{ not json").unwrap();

    let err = load_ir_from_path(&path).unwrap_err();
    match err {
        IoError::Parse { path: p, .. } => assert_eq!(p, path.to_string()),
        other => panic!("期望 Parse 错误，实际：{other:?}"),
    }
}
