//! Vela backend model → JS 文本打印器。
//!
//! 打印对象包括模块外层包装函数、`$translateStyle$`、`$app_style$`、
//! `$app_template$`、`$app_script$` 和页面 / 组件注册块。输出偏向稳定和可
//! 归一化，字节级格式差异由 `astroforge-compat` 在后续阶段处理。

use anyhow::{Context, Result};
use astroforge_ir::component::{Attr, Binding, Element, List, Node, StyleSlotValue};
use astroforge_ir::page::{Component, IrDocument, Page};
use astroforge_ir::runtime::StyleEntry;
use indexmap::IndexMap;
use serde_json::Value;

use crate::VelaBuildOutput;
use crate::lower::{LoweredComponent, LoweredDocument, LoweredPage, SystemRequire};

/// 打印完整 Vela 后端输出。
pub fn emit_build_output(ir: &IrDocument, lowered: LoweredDocument) -> Result<VelaBuildOutput> {
    let mut page_js = IndexMap::new();
    for (route, page) in &lowered.pages {
        let page_ir = ir
            .pages
            .get(route)
            .with_context(|| format!("页面 IR 缺失：{route}"))?;
        let file = format!("{route}/{}.js", page.component);
        page_js.insert(
            file,
            emit_page_js(page_ir, page, &ir.components, &lowered.components)?,
        );
    }

    Ok(VelaBuildOutput {
        app_js: emit_app_js(&lowered.manifest_json, &lowered.app.script_object),
        page_js,
        manifest_json: lowered.manifest_json,
        device_manifests: lowered.device_manifests,
        package: ir.manifest.package.clone(),
        assets: ir.assets.clone(),
    })
}

fn emit_app_js(manifest_json: &str, script_object: &str) -> String {
    let body = format!(
        r#"var __webpack_require__ = createRequire({{
  "./src/manifest.json": function(module) {{
    module.exports = JSON.parse({manifest});
  }}
}});
installTranslateStyle(__webpack_require__.g);

var $app_style$ = [];
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {{
  Object.defineProperty(exports, "__esModule", {{ value: true }});
  exports.default = {script};
}};

$app_script$({{}}, $app_exports$, $app_require$);
$app_exports$.default.style = $app_style$;
$app_exports$.default.manifest = __webpack_require__("./src/manifest.json");
return $app_exports$.default;
"#,
        manifest = js_string(manifest_json),
        script = script_object,
    );
    wrap_module("createAppHandler", &body)
}

fn emit_page_js(
    page_ir: &Page,
    page: &LoweredPage,
    components: &IndexMap<String, Component>,
    lowered_components: &IndexMap<String, LoweredComponent>,
) -> Result<String> {
    let mut component_registrations = String::new();
    for (tag, component_key) in &page.component_imports {
        let component_ir = components
            .get(component_key)
            .with_context(|| format!("页面 {} 引用了未知组件：{component_key}", page.route))?;
        let lowered = lowered_components
            .get(component_key)
            .with_context(|| format!("组件未下沉：{component_key}"))?;
        component_registrations.push_str(&emit_component_registration(tag, component_ir, lowered)?);
        component_registrations.push('\n');
    }

    let template = template_expression(&page_ir.template, &TemplateScope::default())?;
    let body = format!(
        r#"var __webpack_require__ = createRequire({{}});
var aiot = resolveAiot(global, globalThis, window, __webpack_require__.g);
{requires}
{components}
var $app_style$ = {style};
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {{
  Object.defineProperty(exports, "__esModule", {{ value: true }});
  exports.default = {script};
  normalizeVmModule(exports.default || module.exports);
}};
var $app_template$ = function(vm) {{
  var _vm_ = vm || this;
  return {template};
}};

$app_exports$["entry"] = function($app_exports$) {{
  $app_script$({{}}, $app_exports$, $app_require$);
  $app_exports$.default.template = $app_template$;
  $app_exports$.default.style = $app_style$;
}};
return $app_exports$["entry"];
"#,
        requires = emit_system_requires(&page.system_requires),
        components = component_registrations,
        style = style_table_source(&page.style_table),
        script = page.script_object,
        template = template,
    );
    Ok(wrap_module("createPageHandler", &body))
}

fn emit_component_registration(
    tag: &str,
    component_ir: &Component,
    component: &LoweredComponent,
) -> Result<String> {
    let template = template_expression(&component_ir.template, &TemplateScope::default())?;
    Ok(format!(
        r#"$app_exports$[{tag}] = function($component_exports$) {{
  {requires}
  var $app_style$ = {style};
  var $app_script$ = function __scriptModule__(module, exports, $app_require$) {{
    Object.defineProperty(exports, "__esModule", {{ value: true }});
    exports.default = {script};
    normalizeVmModule(exports.default || module.exports);
  }};
  var $app_template$ = function(vm) {{
    var _vm_ = vm || this;
    return {template};
  }};
  $app_script$({{}}, $component_exports$, $app_require$);
  $component_exports$.default.template = $app_template$;
  $component_exports$.default.style = $app_style$;
}};
"#,
        tag = js_string(tag),
        requires = indent_lines(&emit_system_requires(&component.system_requires), 2),
        style = style_table_source(&component.style_table),
        script = component.script_object,
        template = template,
    ))
}

fn wrap_module(handler_name: &str, body: &str) -> String {
    format!(
        r#"export default function(global, globalThis, window, $app_exports$, $app_evaluate$) {{
  var org_app_require = typeof $app_require$ === "undefined" ? undefined : $app_require$;
  (function(global, globalThis, window, $app_exports$, $app_evaluate$) {{
    var setTimeout = global && global.setTimeout;
    var setInterval = global && global.setInterval;
    var clearTimeout = global && global.clearTimeout;
    var clearInterval = global && global.clearInterval;
    var $app_require$ = global && global.$app_require$ || org_app_require || function(moduleId) {{
      throw new Error("AstroForge runtime require failed: " + moduleId);
    }};

    function createRequire(modules) {{
      var cache = {{}};
      function __webpack_require__(moduleId) {{
        var cached = cache[moduleId];
        if (cached !== void 0) return cached.exports;
        if (!modules[moduleId]) throw new Error("AstroForge module not found: " + moduleId);
        var module = cache[moduleId] = {{ exports: {{}} }};
        modules[moduleId](module, module.exports, __webpack_require__);
        return module.exports;
      }}
      __webpack_require__.g = (function() {{
        if (typeof globalThis === "object") return globalThis;
        try {{ return this || new Function("return this")(); }}
        catch (e) {{ if (typeof window === "object") return window; }}
        return {{}};
      }})();
      __webpack_require__.rv = function() {{ return "astroforge"; }};
      __webpack_require__.ruid = "bundler=astroforge";
      return __webpack_require__;
    }}

    function installTranslateStyle(target) {{
      if (target.$translateStyle$) return;
      target.$translateStyle$ = function(value) {{
        if (typeof value !== "string") return value;
        return Object.fromEntries(value.split(";").filter(function(item) {{
          return item && item.trim();
        }}).map(function(item) {{
          var match = item.match(/([^:]+):(.*)/);
          if (!match || match.length < 3) return [];
          return [
            match[1].trim().replace(/-([a-z])/g, function(_, c) {{ return c.toUpperCase(); }}),
            match[2].trim()
          ];
        }}));
      }};
    }}

    function normalizeVmModule(moduleOwn) {{
      var accessors = ["public", "protected", "private"];
      if (moduleOwn.data && accessors.some(function(acc) {{ return moduleOwn[acc]; }})) {{
        throw new Error("页面VM对象中的属性data不可与\"" + accessors.join(",") + "\"同时存在，请使用private替换data名称");
      }}
      if (!moduleOwn.data) {{
        moduleOwn.data = {{}};
        moduleOwn._descriptor = {{}};
        accessors.forEach(function(acc) {{
          var value = moduleOwn[acc];
          if (typeof value === "object" && value) {{
            Object.assign(moduleOwn.data, value);
            for (var name in value) moduleOwn._descriptor[name] = {{ access: acc }};
          }} else if (typeof value === "function") {{
            console.warn("页面VM对象中的属性" + acc + "的值不能是函数，请使用对象");
          }}
        }});
      }}
    }}

    function interopDefault(module) {{
      return module && module.__esModule ? module.default : module;
    }}

    function resolveAiot(global, globalThis, window, runtimeGlobal) {{
      return global && global.aiot ||
        runtimeGlobal && runtimeGlobal.aiot ||
        globalThis && globalThis.aiot ||
        window && window.aiot ||
        (typeof aiot !== "undefined" ? aiot : undefined);
    }}

    var {handler_name} = function() {{
      return (function() {{
{body}
      }})();
    }};
    return {handler_name}();
  }})(global, globalThis, window, $app_exports$, $app_evaluate$);
}}
"#,
        handler_name = handler_name,
        body = indent_lines(body.trim_end(), 8),
    )
}

#[derive(Default)]
struct TemplateScope {
    aliases: IndexMap<String, String>,
}

impl TemplateScope {
    fn with_list_aliases(&self, list: &List) -> Self {
        let mut aliases = self.aliases.clone();
        aliases.insert(list.item_var.clone(), list.item_var.clone());
        if let Some(index_var) = &list.index_var {
            aliases.insert(index_var.clone(), index_var.clone());
        }
        Self { aliases }
    }

    fn binding_expr(&self, binding: &Binding) -> String {
        if let Some(expr) = &binding.expr {
            return expr.clone();
        }

        let mut parts = binding.path.split('.');
        let first = parts.next().unwrap_or_default();
        if first == "props" {
            let Some(prop) = parts.next() else {
                return "_vm_.props".to_owned();
            };
            let head = format!("_vm_.{prop}");
            return parts.fold(head, |acc, item| format!("{acc}.{item}"));
        }
        let head = self
            .aliases
            .get(first)
            .cloned()
            .unwrap_or_else(|| format!("_vm_.{first}"));
        parts.fold(head, |acc, item| format!("{acc}.{item}"))
    }
}

fn template_expression(nodes: &[Node], scope: &TemplateScope) -> Result<String> {
    match nodes {
        [] => Ok(element_call("block", false, "{}", "[]")),
        [node] => node_expression(node, scope),
        many => {
            let children = children_array(many, scope)?;
            Ok(element_call("block", false, "{}", &children))
        }
    }
}

fn children_array(nodes: &[Node], scope: &TemplateScope) -> Result<String> {
    let mut parts = Vec::new();
    for node in nodes {
        parts.extend(child_expressions(node, scope)?);
    }
    Ok(format!("[{}]", parts.join(", ")))
}

fn child_expressions(node: &Node, scope: &TemplateScope) -> Result<Vec<String>> {
    match node {
        Node::Conditional(conditional) => conditional_branch_expressions(conditional, scope),
        Node::Fragment(children) => {
            let mut parts = Vec::new();
            for child in children {
                parts.extend(child_expressions(child, scope)?);
            }
            Ok(parts)
        }
        _ => Ok(vec![node_expression(node, scope)?]),
    }
}

fn node_expression(node: &Node, scope: &TemplateScope) -> Result<String> {
    match node {
        Node::Element(element) => element_expression(element, scope),
        Node::Text(text) => Ok(text_node_expression(&ValueSource::Static(Value::String(
            text.clone(),
        )))),
        Node::Expression(binding) => Ok(text_node_expression(&ValueSource::Dynamic(
            scope.binding_expr(binding),
        ))),
        Node::Fragment(children) => Ok(element_call(
            "block",
            false,
            "{}",
            &children_array(children, scope)?,
        )),
        Node::Conditional(conditional) => {
            let branches = conditional_branch_expressions(conditional, scope)?;
            Ok(element_call(
                "block",
                false,
                "{}",
                &format!("[{}]", branches.join(", ")),
            ))
        }
        Node::List(list) => {
            let list_scope = scope.with_list_aliases(list);
            let index_var = list.index_var.as_deref().unwrap_or("$idx");
            let item_var = &list.item_var;
            Ok(format!(
                "aiot.__cf__({{ __vm__: _vm_, __opts__: {{ exp: function() {{ return {source}; }}, key: {key}, value: {value} }} }}, function({index}, {item}) {{ return {body}; }})",
                source = scope.binding_expr(&list.source),
                key = js_string(index_var),
                value = js_string(item_var),
                index = index_var,
                item = item_var,
                body = children_array(&list.body, &list_scope)?,
            ))
        }
    }
}

fn conditional_branch_expressions(
    conditional: &astroforge_ir::component::Conditional,
    scope: &TemplateScope,
) -> Result<Vec<String>> {
    let mut prior_guards = Vec::new();
    let mut branches = Vec::new();
    for branch in &conditional.branches {
        let guard_expr = match &branch.guard {
            Some(binding) => {
                let expr = scope.binding_expr(binding);
                let all = prior_guards
                    .iter()
                    .map(|item| format!("!({item})"))
                    .chain(std::iter::once(format!("({expr})")))
                    .collect::<Vec<_>>()
                    .join(" && ");
                prior_guards.push(expr);
                all
            }
            None => {
                if prior_guards.is_empty() {
                    "true".to_owned()
                } else {
                    prior_guards
                        .iter()
                        .map(|item| format!("!({item})"))
                        .collect::<Vec<_>>()
                        .join(" && ")
                }
            }
        };
        branches.push(format!(
            "aiot.__ci__({{ __vm__: _vm_, __opts__: {{ shown: function() {{ return {guard}; }} }} }}, function() {{ return {body}; }})",
            guard = guard_expr,
            body = children_array(&branch.body, scope)?,
        ));
    }
    Ok(branches)
}

fn element_expression(element: &Element, scope: &TemplateScope) -> Result<String> {
    let mut opts = Vec::new();
    let mut children = element.children.clone();
    let text_value = if element.tag == "text" {
        let value = text_value_from_children(&children, scope);
        if value.is_some() {
            children.clear();
        }
        value
    } else {
        None
    };

    for (name, attr) in &element.attrs {
        if name == "class" {
            match attr {
                Attr::Static(Value::String(value)) => {
                    let classes = value
                        .split_whitespace()
                        .map(js_string)
                        .collect::<Vec<_>>()
                        .join(", ");
                    opts.push(("classList".to_owned(), format!("[{classes}]")));
                }
                Attr::Dynamic(binding) => opts.push((
                    "classList".to_owned(),
                    dynamic_function(&scope.binding_expr(binding)),
                )),
                Attr::StyleObject(slots) => opts.push((
                    "classList".to_owned(),
                    dynamic_function(&style_object_expr(slots, scope)),
                )),
                Attr::Static(value) => opts.push(("classList".to_owned(), json_source(value))),
            }
            continue;
        }

        if name == "style" {
            match attr {
                Attr::Static(value) => opts.push(("style".to_owned(), style_static_source(value))),
                Attr::Dynamic(binding) => opts.push((
                    "style".to_owned(),
                    dynamic_function(&format!(
                        "__webpack_require__.g.$translateStyle$({})",
                        scope.binding_expr(binding)
                    )),
                )),
                Attr::StyleObject(slots) => opts.push((
                    "style".to_owned(),
                    dynamic_function(&style_object_expr(slots, scope)),
                )),
            }
            continue;
        }

        let value = match attr {
            Attr::Static(value) => json_source(value),
            Attr::Dynamic(binding) => dynamic_function(&scope.binding_expr(binding)),
            Attr::StyleObject(slots) => dynamic_function(&style_object_expr(slots, scope)),
        };
        opts.push((name.clone(), value));
    }

    if let Some(value) = text_value {
        opts.push(("value".to_owned(), value_source(&value)));
    }

    if !element.events.is_empty() {
        let events = element
            .events
            .iter()
            .map(|(name, binding)| {
                format!(
                    "{}: {}",
                    identifier_or_string_key(name),
                    event_handler_source(binding, scope)
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        opts.push(("events".to_owned(), format!("{{ {events} }}")));
    }

    let opts = object_source(opts);
    let children = children_array(&children, scope)?;
    Ok(element_call(
        &element.tag,
        element.is_component,
        &opts,
        &children,
    ))
}

fn event_handler_source(binding: &Binding, scope: &TemplateScope) -> String {
    if let Some(expr) = &binding.expr {
        let trimmed = expr.trim_start();
        if trimmed.starts_with("function") {
            return expr.clone();
        }
        return format!("function(evt) {{ return ({expr})(evt); }}");
    }

    format!(
        "function(evt) {{ return {}(evt); }}",
        scope.binding_expr(binding)
    )
}

fn style_object_expr(
    slots: &[astroforge_ir::component::StyleSlot],
    scope: &TemplateScope,
) -> String {
    let entries = slots
        .iter()
        .map(|slot| {
            let value = match &slot.value {
                StyleSlotValue::Static(value) => json_source(value),
                StyleSlotValue::Dynamic(binding) => scope.binding_expr(binding),
            };
            (kebab_to_camel(&slot.name), value)
        })
        .collect();
    object_source(entries)
}

fn style_static_source(value: &Value) -> String {
    let Some(object) = value.as_object() else {
        return json_source(value);
    };

    object_source(
        object
            .iter()
            .map(|(name, value)| (kebab_to_camel(name), json_source(value)))
            .collect(),
    )
}

enum ValueSource {
    Static(Value),
    Dynamic(String),
}

fn text_value_from_children(children: &[Node], scope: &TemplateScope) -> Option<ValueSource> {
    match children {
        [] => None,
        [Node::Text(text)] => Some(ValueSource::Static(Value::String(text.clone()))),
        [Node::Expression(binding)] => Some(ValueSource::Dynamic(scope.binding_expr(binding))),
        many => {
            let mut has_dynamic = false;
            let mut static_text = String::new();
            let mut parts = Vec::new();
            for child in many {
                match child {
                    Node::Text(text) => {
                        static_text.push_str(text);
                        parts.push(json_source(&Value::String(text.clone())));
                    }
                    Node::Expression(binding) => {
                        has_dynamic = true;
                        parts.push(format!("({})", scope.binding_expr(binding)));
                    }
                    _ => return None,
                }
            }
            if has_dynamic {
                Some(ValueSource::Dynamic(parts.join(" + ")))
            } else {
                Some(ValueSource::Static(Value::String(static_text)))
            }
        }
    }
}

fn text_node_expression(value: &ValueSource) -> String {
    let opts = object_source(vec![("value".to_owned(), value_source(value))]);
    element_call("text", false, &opts, "[]")
}

fn value_source(value: &ValueSource) -> String {
    match value {
        ValueSource::Static(value) => json_source(value),
        ValueSource::Dynamic(expr) => dynamic_function(expr),
    }
}

fn element_call(tag: &str, is_component: bool, opts: &str, children: &str) -> String {
    let creator = if is_component { "__cc__" } else { "__ce__" };
    format!(
        "aiot.{creator}({tag}, {{ __vm__: _vm_, __opts__: {opts} }}, {children})",
        tag = js_string(tag),
    )
}

fn emit_system_requires(requires: &[SystemRequire]) -> String {
    let mut by_local: IndexMap<&'static str, Vec<&'static str>> = IndexMap::new();
    for item in requires {
        by_local.entry(item.local).or_default().push(item.module);
    }

    let mut lines = Vec::new();
    for (local, modules) in by_local {
        if modules.len() == 1 {
            lines.push(format!(
                "var {} = interopDefault($app_require$({}));",
                local,
                js_string(&app_module_require_id(modules[0]))
            ));
            continue;
        }

        let mut parts = Vec::new();
        for (idx, module) in modules.iter().enumerate() {
            let temp = format!("__astroforge_{local}_{idx}");
            lines.push(format!(
                "var {temp} = interopDefault($app_require$({}));",
                js_string(&app_module_require_id(module))
            ));
            parts.push(temp);
        }
        lines.push(format!(
            "var {local} = Object.assign({{}}, {});",
            parts.join(", ")
        ));
    }
    lines.join("\n")
}

fn app_module_require_id(module: &str) -> String {
    if ["system.", "service.", "android.", "hap."]
        .iter()
        .any(|prefix| module.starts_with(prefix))
    {
        format!("@app-module/{module}")
    } else {
        module.to_owned()
    }
}

fn style_table_source(style_table: &[StyleEntry]) -> String {
    if style_table.is_empty() {
        return "[]".to_owned();
    }

    let rows = style_table
        .iter()
        .map(|entry| {
            let selector_items = entry
                .selectors
                .iter()
                .flat_map(|compound| compound.iter())
                .map(|(kind, name)| format!("[{}, {}]", kind, js_string(name)))
                .collect::<Vec<_>>()
                .join(", ");
            let declarations = object_source(
                entry
                    .declarations
                    .iter()
                    .map(|(name, value)| (name.clone(), js_string(value)))
                    .collect(),
            );
            format!("[[{}], {}]", selector_items, declarations)
        })
        .collect::<Vec<_>>()
        .join(",\n");
    format!("[\n{}\n]", indent_lines(&rows, 2))
}

fn object_source(entries: Vec<(String, String)>) -> String {
    if entries.is_empty() {
        return "{}".to_owned();
    }
    let body = entries
        .into_iter()
        .map(|(key, value)| format!("{}: {}", identifier_or_string_key(&key), value))
        .collect::<Vec<_>>()
        .join(", ");
    format!("{{ {body} }}")
}

fn identifier_or_string_key(key: &str) -> String {
    if is_identifier(key) {
        key.to_owned()
    } else {
        js_string(key)
    }
}

fn is_identifier(input: &str) -> bool {
    let mut chars = input.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first == '$' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|ch| ch == '_' || ch == '$' || ch.is_ascii_alphanumeric())
}

fn dynamic_function(expr: &str) -> String {
    format!("function() {{ return {expr}; }}")
}

fn json_source(value: &Value) -> String {
    serde_json::to_string(value).expect("JSON value serialization")
}

fn js_string(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization")
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
    use astroforge_ir::component::{
        Attr, Binding, Conditional, ConditionalBranch, Element, Node, StyleSlot, StyleSlotValue,
    };
    use serde_json::json;

    #[test]
    fn emits_inline_object_style_without_translate_style() {
        // JSX `<div style={{ color: "red", fontSize: 16 }} />` 到 IR 的形态：
        // `style` 属性是 `Attr::Static`，值为 JSON 对象。Vela 后端应直接把
        // 对象内嵌到 __opts__.style，不触发 $translateStyle$（后者只对字符串
        // 形态的样式做 kebab→camel 解析）。
        let mut attrs = IndexMap::new();
        attrs.insert(
            "style".to_owned(),
            Attr::Static(json!({ "color": "red", "flex-direction": "column", "fontSize": 16 })),
        );
        let node = Node::Element(Element {
            tag: "div".into(),
            is_component: false,
            attrs,
            events: IndexMap::new(),
            children: vec![],
        });

        let js = node_expression(&node, &TemplateScope::default()).unwrap();
        assert!(
            js.contains("style: { color: \"red\", flexDirection: \"column\", fontSize: 16 }"),
            "静态 style 对象键应转为设备端接收的 camelCase，实际：{js}"
        );
        assert!(
            !js.contains("$translateStyle$"),
            "静态对象 style 不应包装在 $translateStyle$ 调用中"
        );
    }

    #[test]
    fn emits_mixed_style_object_as_dynamic_object() {
        let mut attrs = IndexMap::new();
        attrs.insert(
            "style".to_owned(),
            Attr::StyleObject(vec![
                StyleSlot {
                    name: "color".into(),
                    value: StyleSlotValue::Dynamic(Binding {
                        path: "theme.color".into(),
                        expr: None,
                        is_callable: false,
                    }),
                },
                StyleSlot {
                    name: "align-items".into(),
                    value: StyleSlotValue::Static(json!("center")),
                },
                StyleSlot {
                    name: "font-size".into(),
                    value: StyleSlotValue::Static(json!(16)),
                },
            ]),
        );
        let node = Node::Element(Element {
            tag: "div".into(),
            is_component: false,
            attrs,
            events: IndexMap::new(),
            children: vec![],
        });

        let js = node_expression(&node, &TemplateScope::default()).unwrap();
        assert!(
            js.contains("style: function() { return { color: _vm_.theme.color, alignItems: \"center\", fontSize: 16 }; }"),
            "混合 style 应在模板闭包内组装对象，实际：{js}"
        );
    }

    #[test]
    fn emits_style_table_with_official_selector_shape() {
        let mut declarations = IndexMap::new();
        declarations.insert("flexDirection".into(), "column".into());
        let style = style_table_source(&[StyleEntry {
            selectors: vec![vec![(0, "container".into())]],
            declarations,
        }]);

        assert!(
            style.contains("[[[0, \"container\"]], { flexDirection: \"column\" }]"),
            "样式表 selector 不应多包一层数组，实际：{style}"
        );
        assert!(
            !style.contains("[[[[0, \"container\"]]]"),
            "样式表 selector 多包了一层数组，实际：{style}"
        );
    }

    #[test]
    fn emits_static_text_element_value() {
        let node = Node::Element(Element {
            tag: "text".into(),
            is_component: false,
            attrs: IndexMap::new(),
            events: IndexMap::new(),
            children: vec![Node::Text("Hello".into())],
        });

        let js = node_expression(&node, &TemplateScope::default()).unwrap();
        assert!(js.contains("aiot.__ce__(\"text\""));
        assert!(js.contains("value: \"Hello\""));
        assert!(js.ends_with(", [])"));
    }

    #[test]
    fn emits_styled_dynamic_text_value_after_style_options() {
        let mut attrs = IndexMap::new();
        attrs.insert(
            "class".to_owned(),
            Attr::Static(Value::String("info-text".into())),
        );
        let node = Node::Element(Element {
            tag: "text".into(),
            is_component: false,
            attrs,
            events: IndexMap::new(),
            children: vec![
                Node::Text("已创建组件：".into()),
                Node::Expression(Binding {
                    path: "items.length".into(),
                    expr: None,
                    is_callable: false,
                }),
            ],
        });

        let js = node_expression(&node, &TemplateScope::default()).unwrap();
        let class_pos = js.find("classList").expect("classList option");
        let value_pos = js.find("value").expect("value option");
        assert!(
            class_pos < value_pos,
            "带样式的 text 应先打印样式选项再打印 value，实际：{js}"
        );
        assert!(
            js.contains("value: function() { return \"已创建组件：\" + (_vm_.items.length); }"),
            "动态文本应下沉为 value 闭包，实际：{js}"
        );
    }

    #[test]
    fn emits_inline_event_handler_expression() {
        let mut events = IndexMap::new();
        events.insert(
            "click".to_owned(),
            Binding {
                path: "() => { setCount((prev) => prev + 1); }".into(),
                expr: Some("function(evt) {\n  _vm_.count = _vm_.count + 1;\n}".into()),
                is_callable: true,
            },
        );
        let node = Node::Element(Element {
            tag: "div".into(),
            is_component: false,
            attrs: IndexMap::new(),
            events,
            children: vec![],
        });

        let js = node_expression(&node, &TemplateScope::default()).unwrap();
        assert!(
            js.contains("events: { click: function(evt) {\n  _vm_.count = _vm_.count + 1;\n} }"),
            "内联事件函数应直接进入 events 表，实际：{js}"
        );
    }

    #[test]
    fn emits_conditional_children_without_block_wrapper() {
        let node = Node::Element(Element {
            tag: "div".into(),
            is_component: false,
            attrs: IndexMap::new(),
            events: IndexMap::new(),
            children: vec![Node::Conditional(Conditional {
                branches: vec![
                    ConditionalBranch {
                        guard: Some(Binding {
                            path: "ready".into(),
                            expr: None,
                            is_callable: false,
                        }),
                        body: vec![Node::Element(Element {
                            tag: "text".into(),
                            is_component: false,
                            attrs: IndexMap::new(),
                            events: IndexMap::new(),
                            children: vec![Node::Text("Ready".into())],
                        })],
                    },
                    ConditionalBranch {
                        guard: None,
                        body: vec![Node::Element(Element {
                            tag: "text".into(),
                            is_component: false,
                            attrs: IndexMap::new(),
                            events: IndexMap::new(),
                            children: vec![Node::Text("Loading".into())],
                        })],
                    },
                ],
            })],
        });

        let js = node_expression(&node, &TemplateScope::default()).unwrap();
        assert!(js.contains("aiot.__ce__(\"div\""));
        assert!(js.contains("aiot.__ci__"));
        assert!(!js.contains("\"block\""));
    }

    #[test]
    fn emits_single_network_require_without_wrapper() {
        let js = emit_system_requires(&[SystemRequire {
            local: "network",
            module: "system.fetch",
        }]);
        assert_eq!(
            js,
            "var network = interopDefault($app_require$(\"@app-module/system.fetch\"));"
        );
    }

    #[test]
    fn emits_merged_network_requires_when_multiple_modules_are_used() {
        let js = emit_system_requires(&[
            SystemRequire {
                local: "network",
                module: "system.fetch",
            },
            SystemRequire {
                local: "network",
                module: "system.network",
            },
        ]);
        assert!(js.contains(
            "var __astroforge_network_0 = interopDefault($app_require$(\"@app-module/system.fetch\"));"
        ));
        assert!(js.contains(
            "var __astroforge_network_1 = interopDefault($app_require$(\"@app-module/system.network\"));"
        ));
        assert!(js.contains(
            "var network = Object.assign({}, __astroforge_network_0, __astroforge_network_1);"
        ));
    }
}
