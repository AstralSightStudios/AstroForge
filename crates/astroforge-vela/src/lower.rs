//! Page IR → Vela backend model 下沉规则。
//!
//! 本模块只负责结构化归一化，不负责 JS 文本打印。下沉后的模型仍保留
//! `astroforge_ir::component::Node`，因为条件渲染与列表渲染需要打印为
//! `aiot.__ci__` / `aiot.__cf__` 包装表达式，不能强行压扁为普通
//! `RuntimeNode`。普通元素、事件、样式和脚本对象在此阶段完成归类。

use anyhow::{Context, Result};
use astroforge_ir::page::{
    AppModule, Component, IrDocument, Manifest, Page, Script, Selector, StyleRule, StyleTable,
};
use astroforge_ir::runtime::StyleEntry;
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::{Map, Value};

/// Vela 后端打印器的完整输入。
#[derive(Debug, Clone)]
pub struct LoweredDocument {
    pub manifest_json: String,
    pub device_manifests: IndexMap<String, String>,
    pub app: LoweredApp,
    pub pages: IndexMap<String, LoweredPage>,
    pub components: IndexMap<String, LoweredComponent>,
}

/// 应用模块下沉结果。
#[derive(Debug, Clone)]
pub struct LoweredApp {
    pub script_object: String,
}

/// 页面模块下沉结果。
#[derive(Debug, Clone)]
pub struct LoweredPage {
    pub route: String,
    pub component: String,
    pub script_object: String,
    pub system_requires: Vec<SystemRequire>,
    pub style_table: Vec<StyleEntry>,
    pub component_imports: IndexMap<String, String>,
}

/// 自定义组件模块下沉结果。
#[derive(Debug, Clone)]
pub struct LoweredComponent {
    pub name: String,
    pub script_object: String,
    pub system_requires: Vec<SystemRequire>,
    pub style_table: Vec<StyleEntry>,
}

/// 页面脚本中需要从 `$app_require$` 获取的系统桥接模块。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemRequire {
    pub local: &'static str,
    pub module: &'static str,
}

/// 将 Page IR 下沉为 Vela 后端模型。
pub fn lower_document(ir: &IrDocument) -> Result<LoweredDocument> {
    let manifest_json = manifest_to_vela_json(&ir.manifest)?;
    let device_manifests = lower_device_manifests(&ir.manifest)?;
    let app = LoweredApp {
        script_object: app_script_object(&ir.app),
    };

    let mut components = IndexMap::new();
    for (name, component) in &ir.components {
        components.insert(name.clone(), lower_component(component)?);
    }

    let mut pages = IndexMap::new();
    for (route, page) in &ir.pages {
        let route_config = ir
            .manifest
            .router
            .pages
            .get(route)
            .with_context(|| format!("manifest.router.pages 缺少页面路由：{route}"))?;
        pages.insert(route.clone(), lower_page(page, &route_config.component)?);
    }

    Ok(LoweredDocument {
        manifest_json,
        device_manifests,
        app,
        pages,
        components,
    })
}

fn lower_page(page: &Page, component_name: &str) -> Result<LoweredPage> {
    let script_object = script_object(&page.script);
    Ok(LoweredPage {
        route: page.route.clone(),
        component: component_name.to_owned(),
        system_requires: detect_system_requires(&script_object),
        script_object,
        style_table: lower_style_table(&page.style),
        component_imports: page.imports.clone(),
    })
}

fn lower_component(component: &Component) -> Result<LoweredComponent> {
    let script_object = script_object(&component.script);
    Ok(LoweredComponent {
        name: component.name.clone(),
        system_requires: detect_system_requires(&script_object),
        script_object,
        style_table: lower_style_table(&component.style),
    })
}

fn app_script_object(app: &AppModule) -> String {
    if app.lifecycle.is_empty() {
        return "{}".to_owned();
    }

    let mut entries = Vec::new();
    for (name, body) in &app.lifecycle {
        entries.push(format!("{name}: function {name}() {{\n{body}\n}}"));
    }
    format!("{{\n{}\n}}", indent_lines(&entries.join(",\n"), 2))
}

fn script_object(script: &Script) -> String {
    let mut entries = Vec::new();

    if !script.props.is_empty() {
        entries.push(format!("props: {}", json_value_source(&script.props)));
    }

    if !script.private_data.is_empty() {
        entries.push(format!(
            "private: {}",
            json_value_source(&script.private_data)
        ));
    }

    for (name, body) in &script.methods {
        entries.push(format!("{name}: {body}"));
    }

    for (name, body) in &script.lifecycle {
        entries.push(format!("{name}: {body}"));
    }

    if entries.is_empty() {
        "{}".to_owned()
    } else {
        format!("{{\n{}\n}}", indent_lines(&entries.join(",\n"), 2))
    }
}

fn detect_system_requires(source: &str) -> Vec<SystemRequire> {
    let mut out = Vec::new();
    let candidates = [
        SystemRequire {
            local: "router",
            module: "system.router",
        },
        SystemRequire {
            local: "storage",
            module: "system.storage",
        },
        SystemRequire {
            local: "network",
            module: "system.fetch",
        },
    ];

    for item in candidates {
        if contains_identifier(source, item.local) {
            out.push(item);
        }
    }
    out
}

fn contains_identifier(source: &str, ident: &str) -> bool {
    let bytes = source.as_bytes();
    let needle = ident.as_bytes();
    if needle.is_empty() || bytes.len() < needle.len() {
        return false;
    }

    for idx in 0..=bytes.len() - needle.len() {
        if &bytes[idx..idx + needle.len()] != needle {
            continue;
        }
        let before = idx.checked_sub(1).and_then(|i| bytes.get(i)).copied();
        let after = bytes.get(idx + needle.len()).copied();
        if !is_ident_byte(before) && !is_ident_byte(after) {
            return true;
        }
    }
    false
}

fn is_ident_byte(byte: Option<u8>) -> bool {
    matches!(
        byte,
        Some(b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'$')
    )
}

fn lower_style_table(style: &StyleTable) -> Vec<StyleEntry> {
    style.rules.iter().map(lower_style_rule).collect()
}

fn lower_style_rule(rule: &StyleRule) -> StyleEntry {
    StyleEntry {
        selectors: rule.selectors.iter().map(lower_selector).collect(),
        declarations: rule
            .declarations
            .iter()
            .map(|(name, value)| (kebab_to_camel(name), value.clone()))
            .collect(),
    }
}

fn lower_selector(selector: &Selector) -> Vec<(u8, String)> {
    vec![(selector.kind.index(), selector.name.clone())]
}

fn manifest_to_vela_json(manifest: &Manifest) -> Result<String> {
    let mut root = manifest_base_object(manifest)?;
    // `minAPILevel` 由 aiot-toolkit 在 `updateManifest` 阶段追加在最后，
    // 此处保持同样的位置以保证字段顺序与官方产物一致。`packageInfo` 不在此
    // 处注入，由 packager 在签名前补写，与官方流程一致。
    root.insert("minAPILevel".into(), Value::from(1));

    let mut s = serde_json::to_string_pretty(&Value::Object(root))?;
    s.push('\n');
    Ok(s)
}

/// 生成所有 `manifest-<device>.json` 文本。
///
/// 与 aiot-toolkit 一致：每个 `deviceTypeList` 条目对应一份 manifest 变体，
/// 内容为源 manifest 经 `lodash.merge` 与可选的 `config-<device>.json` 合并
/// 后的结果。MVP 暂未引入配置覆盖渠道，故等价于源 manifest 本身（不包含
/// `minAPILevel` 与 `packageInfo` 这两个 packager / build pipeline 注入项）。
pub fn lower_device_manifests(manifest: &Manifest) -> Result<IndexMap<String, String>> {
    let mut out = IndexMap::new();
    for device in &manifest.device_type_list {
        let base = manifest_base_object(manifest)?;
        let mut text = serde_json::to_string_pretty(&Value::Object(base))?;
        text.push('\n');
        out.insert(device.clone(), text);
    }
    Ok(out)
}

/// 按官方源 manifest 的字段顺序生成基础对象，不包含任何打包阶段注入字段。
///
/// 优先使用 `Manifest::source`：源对象已经携带用户书写的完整字段集与顺序，
/// 直接克隆即可，不必关心 IR 是否建模了某个字段（如 `subpackages`、
/// `widgets`、`router.params` 等扩展点）。
///
/// 仅当 `source` 缺失（IR 由旧版前端或测试直接构造）时退化为按 typed
/// 字段重建。该路径仅维持 IR 兼容性，**不**保证字段顺序与源 manifest 完
/// 全一致。
fn manifest_base_object(manifest: &Manifest) -> Result<Map<String, Value>> {
    if let Some(source) = &manifest.source {
        let object = source
            .as_object()
            .context("manifest.source 必须是 JSON 对象")?;
        return Ok(object.clone());
    }

    let mut root = Map::new();
    root.insert("package".into(), Value::String(manifest.package.clone()));
    root.insert("name".into(), Value::String(manifest.name.clone()));
    root.insert(
        "versionName".into(),
        Value::String(manifest.version_name.clone()),
    );
    root.insert("versionCode".into(), Value::from(manifest.version_code));
    root.insert(
        "minPlatformVersion".into(),
        Value::from(manifest.min_platform_version),
    );
    root.insert("icon".into(), Value::String(manifest.icon.clone()));
    if let Some(simulation_version) = &manifest.simulation_version {
        root.insert(
            "simulationVersion".into(),
            Value::String(simulation_version.clone()),
        );
    }
    root.insert(
        "deviceTypeList".into(),
        serde_json::to_value(&manifest.device_type_list)?,
    );
    root.insert("features".into(), serde_json::to_value(&manifest.features)?);

    let mut config = Map::new();
    if let Some(log_level) = &manifest.config.log_level {
        config.insert("logLevel".into(), Value::String(log_level.clone()));
    }
    if let Some(design_width) = &manifest.config.design_width {
        config.insert("designWidth".into(), Value::String(design_width.clone()));
    }
    root.insert("config".into(), Value::Object(config));

    let mut pages = Map::new();
    for (route, page) in &manifest.router.pages {
        let mut entry = Map::new();
        entry.insert("component".into(), Value::String(page.component.clone()));
        pages.insert(route.clone(), Value::Object(entry));
    }
    let mut router = Map::new();
    router.insert("entry".into(), Value::String(manifest.router.entry.clone()));
    router.insert("pages".into(), Value::Object(pages));
    root.insert("router".into(), Value::Object(router));

    Ok(root)
}

fn json_value_source<T: Serialize>(value: &T) -> String {
    serde_json::to_string_pretty(value).expect("Vela script JSON serialization")
}

fn kebab_to_camel(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut upper_next = false;
    for ch in input.chars() {
        if ch == '-' {
            upper_next = true;
            continue;
        }
        if upper_next {
            out.extend(ch.to_uppercase());
            upper_next = false;
        } else {
            out.push(ch);
        }
    }
    out
}

fn indent_lines(input: &str, spaces: usize) -> String {
    let indent = " ".repeat(spaces);
    input
        .lines()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("{indent}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use astroforge_ir::page::{AppConfig, Feature, RoutePage, Router};

    #[test]
    fn manifest_uses_vela_field_names() {
        let manifest = Manifest {
            package: "com.example".into(),
            name: "example".into(),
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
                pages: [(
                    "pages/index".into(),
                    RoutePage {
                        component: "index".into(),
                    },
                )]
                .into_iter()
                .collect(),
            },
            source: None,
        };

        let json = manifest_to_vela_json(&manifest).unwrap();
        assert!(json.contains("\"versionName\""));
        assert!(json.contains("\"minPlatformVersion\""));
        assert!(json.contains("\"deviceTypeList\""));
        assert!(!json.contains("version_name"));

        // `minAPILevel` 必须紧跟 `router` 之后，与 aiot-toolkit 的 `updateManifest`
        // 行为保持一致；它是 build pipeline 追加项，不应出现在源字段之间。
        let router_pos = json.find("\"router\"").expect("router field present");
        let min_api_pos = json
            .find("\"minAPILevel\"")
            .expect("minAPILevel field present");
        assert!(min_api_pos > router_pos, "minAPILevel 应在 router 之后追加");

        let devices = lower_device_manifests(&manifest).unwrap();
        assert_eq!(
            devices.keys().collect::<Vec<_>>(),
            vec![&"watch".to_owned()]
        );
        let watch = devices.get("watch").unwrap();
        assert!(!watch.contains("\"minAPILevel\""));
        assert!(!watch.contains("\"packageInfo\""));
    }

    #[test]
    fn manifest_source_overrides_typed_fields_and_preserves_unknown_keys() {
        let source = serde_json::json!({
            "package": "com.example",
            "name": "example",
            "versionName": "1.0.0",
            "versionCode": 1,
            "minPlatformVersion": 1200,
            "icon": "/common/logo.png",
            "deviceTypeList": ["watch"],
            // 下面是 IR `Manifest` 没有显式建模、但用户可能写在源 manifest
            // 中的扩展字段，必须原样透传到 Vela manifest.json。
            "subpackages": [
                { "name": "extra", "resource": "pages/extra" }
            ],
            "router": {
                "entry": "pages/index",
                "pages": { "pages/index": { "component": "index" } },
                "params": { "from": "main" }
            },
            "config": {
                "logLevel": "log",
                "vendorExtension": { "fingerprint": true }
            }
        });

        let manifest = Manifest {
            package: "com.example".into(),
            name: "example".into(),
            version_name: "1.0.0".into(),
            version_code: 1,
            min_platform_version: 1200,
            icon: "/common/logo.png".into(),
            simulation_version: None,
            device_type_list: vec!["watch".into()],
            features: vec![],
            config: AppConfig::default(),
            router: Router {
                entry: "pages/index".into(),
                pages: [(
                    "pages/index".into(),
                    RoutePage {
                        component: "index".into(),
                    },
                )]
                .into_iter()
                .collect(),
            },
            source: Some(source),
        };

        let json = manifest_to_vela_json(&manifest).unwrap();
        assert!(
            json.contains("\"subpackages\""),
            "扩展字段 subpackages 应原样透传"
        );
        assert!(
            json.contains("\"params\""),
            "router.params 等嵌套扩展字段应保留"
        );
        assert!(
            json.contains("\"vendorExtension\""),
            "config 嵌套扩展字段应保留"
        );
        // minAPILevel 仍应追加在末尾。
        let subpackages_pos = json.find("\"subpackages\"").unwrap();
        let min_api_pos = json.find("\"minAPILevel\"").unwrap();
        assert!(min_api_pos > subpackages_pos);
    }

    #[test]
    fn detects_known_system_requires() {
        let requires = detect_system_requires(
            r#"{
              go: function go() { router.push({ uri: "pages/detail" }); },
              save: function save() { storage.set({ key: "token" }); }
            }"#,
        );
        assert_eq!(
            requires
                .iter()
                .map(|item| (item.local, item.module))
                .collect::<Vec<_>>(),
            vec![("router", "system.router"), ("storage", "system.storage")]
        );
    }
}
