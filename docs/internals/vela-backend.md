# Vela 后端

本文档介绍 `crates/astroforge-vela/` 的实现，包括 lower 和 emit 两个阶段。

## 职责

Vela 后端接收 `IrDocument`，产出：

- `app.js`
- `pages/<route>/<comp>.js`
- `manifest.json`
- `manifest-<device>.json`

## 两阶段处理

### Lower：IR → RuntimeModule

将前端友好的 Component/Page IR 转换为后端友好的 RuntimeModule。

```rust
pub struct LoweredProject {
    pub manifest_json: String,
    pub app: LoweredApp,
    pub pages: IndexMap<String, LoweredPage>,
    pub components: IndexMap<String, LoweredComponent>,
}
```

#### script_object

将 `Script` 结构转换为 JS 对象字面量字符串：

```rust
fn script_object(script: &Script) -> String {
    // props → "props: { ... }"
    // private_data → "private: { ... }"
    // methods → "methodName: function methodName() { ... }"
    // lifecycle → "onInit: function onInit() { ... }"
}
```

#### 系统 require 探测

扫描模板和脚本中的系统桥接引用，生成 `SystemRequire` 列表：

```rust
pub struct SystemRequire {
    pub local: &'static str,
    pub module: &'static str,
}
```

例如模板中出现 `prompt.showToast`，则生成：

```rust
SystemRequire { local: "prompt", module: "system.prompt" }
```

emit 阶段将这些转换为：

```js
var prompt = __af_g.__af_interopDefault($app_require$("@app-module/system.prompt"));
```

### Emit：RuntimeModule → JS 字符串

将 RuntimeModule 打印为符合 Vela ABI 的 JS 代码。

#### 模块包装

所有产物模块使用统一的包装函数：

```js
export default function(global, globalThis, window, $app_exports$, $app_evaluate$) {
  var org_app_require = typeof $app_require$ === "undefined" ? undefined : $app_require$;
  (function(global, globalThis, window, $app_exports$, $app_evaluate$) {
    var setTimeout = global && global.setTimeout;
    // ...
    var __af_g = ...;
    // ...
    var createPageHandler = function() {
      return (function() {
        // 模块体
      })();
    };
    return createPageHandler();
  })(global, globalThis, window, $app_exports$, $app_evaluate$);
}
```

#### App 模块

```js
var $app_style$ = [];
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = {
    onCreate() { ... },
    onDestroy() { ... },
  };
};
$app_script$({}, $app_exports$, $app_require$);
$app_exports$.default.style = $app_style$;
$app_exports$.default.manifest = __webpack_require__("./src/manifest.json");
```

#### 页面模块

```js
// 注册自定义组件
$app_exports$['avatar-card'] = function($component_exports$) { ... };

var $app_style$ = [...];
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = {
    private: { count: 0 },
    increment() { this.count = this.count + 1; },
  };
};
var $app_template$ = function(vm) {
  var _vm_ = vm || this;
  return aiot.__ce__("div", { __vm__: _vm_, __opts__: { ... } }, [...]);
};
$app_exports$['entry'] = function($app_exports$) {
  $app_script$({}, $app_exports$, $app_require$);
  $app_exports$.default.template = $app_template$;
  $app_exports$.default.style = $app_style$;
};
```

#### 模板表达式

`RuntimeNode` 转换为 `aiot.__ce__` / `__cc__` 调用：

```rust
fn element_expression(element: &Element, scope: &TemplateScope) -> Result<String> {
    let opts = collect_opts(element, scope)?;
    let children = children_array(&element.children, scope)?;
    Ok(element_call(&element.tag, element.is_component, &opts, &children))
}
```

示例：

```rust
// Element { tag: "text", attrs: { "value": Static("Hello") } }
// → aiot.__ce__("text", { __vm__: _vm_, __opts__: { value: "Hello" } }, [])

// Element { tag: "div", attrs: { "class": Static("page") } }
// → aiot.__ce__("div", { __vm__: _vm_, __opts__: { classList: ["page"] } }, [])
```

#### 样式表

`StyleTable` 转换为嵌套数组：

```js
[
  [[[0, "page"]], { flexDirection: "column" }],
  [[[0, "title"]], { fontSize: "32px" }]
]
```

#### 条件与列表

条件渲染生成 `aiot.__ci__` 调用：

```js
aiot.__ci__(
  { __vm__: _vm_, __opts__: { shown: function() { return _vm_.isReady; } } },
  function() { return aiot.__ce__("text", { ... }, [...]); }
)
```

列表渲染生成 `aiot.__cf__` 调用（MVP 暂不涵盖，后续实现）。

## 辅助函数

### $translateStyle$

在 `app.js` 中挂载到全局：

```js
__af_g.$translateStyle$ = function(value) {
  if (typeof value !== 'string') return value;
  return Object.fromEntries(
    value.split(';')
      .filter(item => item && item.trim())
      .map(item => {
        const m = item.match(/([^:]+):(.*)/);
        return [m[1].trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), m[2].trim()];
      })
  );
};
```

用于将 `"background-color: red; font-size: 12px"` 解析为对象。

### __af_normalizeVm

规范化 VM 数据对象，处理 `public` / `protected` / `private` 访问性桶。

## Manifest 生成

`manifest.json` 字段顺序遵循官方规则：

1. 源 manifest 顺序
2. 末尾追加 `minAPILevel`
3. 末尾追加 `packageInfo`

`manifest-<device>.json` 只对 `deviceTypeList` 中的设备生成，不含 `minAPILevel` / `packageInfo`。

## 测试

Vela 后端测试位于 `crates/astroforge-vela/src/emit.rs`（`#[cfg(test)]` 模块），覆盖：

- 静态文本元素
- 内联事件函数
- 内联对象样式
- 边框简写展开
- 混合 style 对象
- 样式表选择器形态
- 网络 require 合并
- 条件子节点

## 下一步

- [打包器](packager.md)
- [兼容性测试](compatibility-testing.md)
