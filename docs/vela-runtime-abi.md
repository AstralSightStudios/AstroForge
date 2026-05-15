# Vela JS Runtime ABI

> **数据来源**：`aiot-toolkit@2.0.5` 与 `@aiot-toolkit/parser@2.0.5` 源码，
> 配合 `aiot-demo` 项目的实际构建产物（运行于 Vela 设备运行时）。本文档
> 描述 AstroForge 为达成运行时兼容必须遵循的产物契约。

## 0. 总体模型

Vela 运行时**不是**浏览器。对照关系如下：

| 浏览器                  | Vela                                         |
| ----------------------- | -------------------------------------------- |
| `document.createElement`| `aiot.__ce__(tag, opts, children)`           |
| 自定义元素              | `aiot.__cc__(name, opts, children)`          |
| CSSOM                   | 以 JS 字面量形式写出的嵌套样式表             |
| DOM 事件                | `__opts__.events.<name>` 回调表              |
| 模块加载器              | webpack/rspack 风格的 `__webpack_require__`  |
| App 入口                | `app.js`，导出 `(global, ...)` 形式的 thunk  |
| Page 入口               | `pages/<name>/<name>.js`，与 app 同型         |

`aiot-toolkit` 构建产物的目录布局：

```
build/
├─ app.js
├─ manifest.json
├─ pages/<name>/<name>.js   （每个页面一份）
├─ common/...                （资源）
├─ i18n/...
└─ META-INF/
   ├─ build.txt
   └─ CERT            （hash.json 的签名 zip）
```

随后整体压缩为 `dist/<package>.<minor>.<major>.<patch>.rpk`。

## 1. 模块包装函数

所有产物模块（`app.js` 与每个页面模块）经 `WrapPlugin` 包装为以下形态：

```js
export default function(global, globalThis, window, $app_exports$, $app_evaluate$) {
  var org_app_require = $app_require$;
  (function(global, globalThis, window, $app_exports$, $app_evaluate$) {
    var setTimeout = global.setTimeout;
    var setInterval = global.setInterval;
    var clearTimeout = global.clearTimeout;
    var clearInterval = global.clearInterval;
    var $app_require$ = global.$app_require$ || org_app_require;

    var <createAppHandler|createPageHandler> = function() {
      return (() => {
        // ... webpack 运行时 + 模块体 ...
      })();
    };
    return <createAppHandler|createPageHandler>();
  })(global, globalThis, window, $app_exports$, $app_evaluate$);
}
```

要点：

- `app.js` 使用 `createAppHandler`；页面模块使用 `createPageHandler`。
- 顶层为 `export default function(...)`，即 ESM 默认函数导出。Vela 加载器在
  装载时调用此 thunk，并注入运行时提供的 `global`、`$app_exports$` 等参数。
- `$app_require$` 为宿主提供的运行时 require（非 webpack 实现）。thunk 内部
  以同名局部变量遮蔽，转用 webpack 风格的版本。
- `setTimeout` / `setInterval` 等需从 `global` 显式取出，因为 JS 环境的词法
  作用域上不存在这些标识符。

若 `enableE2e` 启用，包装函数会额外注入清空 `globalThis` 并将 `global` 重绑
到 `window` 的语句。该路径仅服务于厂商 E2E 测试夹具，常规运行时无关。

## 2. webpack 运行时桩

内层 thunk 内每份产物附带最小化的 webpack/rspack 运行时：

```js
var __webpack_modules__ = { /* "./src/<id>": (module, exports, require) => { ... } */ };
var __webpack_module_cache__ = {};
function __webpack_require__(moduleId) {
  var cached = __webpack_module_cache__[moduleId];
  if (cached !== void 0) return cached.exports;
  var m = __webpack_module_cache__[moduleId] = { exports: {} };
  __webpack_modules__[moduleId](m, m.exports, __webpack_require__);
  return m.exports;
}
__webpack_require__.g = (() => {
  if (typeof globalThis === 'object') return globalThis;
  try { return this || new Function('return this')(); }
  catch (e) { if (typeof window === 'object') return window; }
})();
__webpack_require__.rv   = () => "1.7.11";              // rspack 版本
__webpack_require__.ruid = "bundler=rspack@1.7.11";     // 标识
```

`rv` / `ruid` 仅为元数据，运行时行为不依赖其取值。AstroForge 可填充等价标
识字符串。

## 3. `$translateStyle$` 全局辅助函数

`app.js` 在全局对象上挂载唯一的样式辅助函数，供所有内联 style 表达式使用：

```js
__webpack_require__.g.$translateStyle$ = function(value) {
  if (typeof value !== 'string') return value;
  return Object.fromEntries(
    value.split(';')
      .filter(item => item && item.trim())
      .map(item => {
        const m = item.match(/([^:]+):(.*)/);
        if (!m || m.length < 3) return [];
        return [
          m[1].trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
          m[2].trim(),
        ];
      }),
  );
};
```

其作用为将 `"background-color: red; font-size: 12px"` 解析为
`{ backgroundColor: "red", fontSize: "12px" }`。AstroForge 必须在 `app.js`
的同一 `__webpack_require__.g` 槽位注册等价函数。

## 4. App 模块形态

`app.js` 模块体在包装函数与 webpack 桩之后呈现如下结构：

```js
var $app_style$ = [];               // app 无样式
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = void 0;
  exports.default = {
    onCreate()  { /* 用户代码 */ },
    onDestroy() { /* 用户代码 */ },
    // 可选：onError、onPageNotFound 等
  };
};

$app_script$({}, $app_exports$, $app_require$);
$app_exports$.default.style    = $app_style$;
$app_exports$.default.manifest = __webpack_require__("./src/manifest.json");
```

`manifest.json` 注册为 webpack 模块，模块体仅为 `module.exports = JSON.parse('…')`。

## 5. 页面模块形态

页面模块结构与 app 类似，但以命名 entry 注册组件：

```js
// 可选：先注册所引用的自定义组件
$app_exports$['avatar-card'] = __webpack_require__("./src/components/avatar-card.ux");

var $app_style$ = [ /* 样式表，详见 §6 */ ];
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = {
    private: { message: '点击联系人查看信息' },     // 化入 vm data
    onCardTap(evt) { this.message = '你选择了: ' + evt.detail.name; },
  };

  // 由 loader 注入的 VM 数据规范化逻辑
  const moduleOwn = exports.default || module.exports;
  const accessors = ['public', 'protected', 'private'];
  if (moduleOwn.data && accessors.some(acc => moduleOwn[acc])) {
    throw new Error('页面VM对象中的属性data不可与"' + accessors.join(',') + '"同时存在，请使用private替换data名称');
  }
  if (!moduleOwn.data) {
    moduleOwn.data = {};
    moduleOwn._descriptor = {};
    accessors.forEach(acc => {
      const t = typeof moduleOwn[acc];
      if (t === 'object') {
        moduleOwn.data = Object.assign(moduleOwn.data, moduleOwn[acc]);
        for (const name in moduleOwn[acc]) moduleOwn._descriptor[name] = { access: acc };
      } else if (t === 'function') {
        console.warn('页面VM对象中的属性' + acc + '的值不能是函数，请使用对象');
      }
    });
  }
};

var $app_template$ = function(vm) {
  const _vm_ = vm || this;
  return aiot.__ce__("div", { __vm__: _vm_, __opts__: { classList: ["demo-page"] } }, [
    aiot.__ce__("text", { __vm__: _vm_, __opts__: { classList: ["title"], value: "联系人" } }, []),
    // ...
  ]);
};

$app_exports$['entry'] = function($app_exports$) {
  $app_script$({}, $app_exports$, $app_require$);
  $app_exports$.default.template = $app_template$;
  $app_exports$.default.style    = $app_style$;
};
```

注册规则：

- **页面**：注册键为字面量 `'entry'`。
- **自定义组件**：注册键为模板中使用的 kebab-case 标签名（如 `'avatar-card'`）。
- 组件模块的 `module.exports` 本身即注册函数 `function($app_exports$) { … }`，
  因此模块体使用 `module.exports = function($app_exports$) { … }` 而非
  `$app_exports$['entry'] = …`。

### 5.1 VM 数据访问性约定

用户代码可在 `public` / `protected` / `private` 三个桶下声明数据。注入的
规范化逻辑：

- 将三个桶展平至单一 `data: { ... }`。
- 在 `_descriptor[name] = { access: 'private' | 'protected' | 'public' }`
  上记录访问性。
- 若用户同时声明 `data` 与任一访问性桶，抛出错误。

组件 props 不参与上述合并，独立声明于 `props: { name: { type: String, default: '…' } }`。

## 6. 样式表

`$app_style$` 为嵌套数组：

```
$app_style$ = [
  [ selectorDescriptor, styleObject ],
  ...
]

selectorDescriptor = [ [ [ <selectorTypeIndex>, <selectorName> ], ... ] ]
```

选择器类型索引（取自 `StyleSelectorType.findSelectorIndex`）：

| 索引 | 选择器类型         |
| ---- | ------------------ |
| 0    | `.class`           |
| 1    | `#id`              |
| 2    | `tag`              |
| 3    | `@keyframes`       |
| 4    | `@font-face`       |

示例——`.demo-page { flex-direction: column; align-items: center }`：

```js
[
  [[[0, "demo-page"]]],
  { flexDirection: "column", alignItems: "center" }
]
```

属性名 kebab-case 转换为 camelCase；值保留为带单位字符串（`"32px"`、`"#ffffff"`）。
跨规则块的样式合并在编译期完成，运行时不再合并。

## 7. 模板 ABI

两个工厂调用：

- `aiot.__ce__(tagName, { __vm__, __opts__ }, children)`——内置元素
  （`div`、`text`、`image`、`list`、`list-item`、`input`、`slider`、`a`、
  `span`、`label`、`arc-text`、`block`、`component`、`slot`、`maml`、`web`、
  `img` 等）。
- `aiot.__cc__(componentName, { __vm__, __opts__ }, children)`——已注册的
  自定义组件。

两者均接受三个位置参数。`__vm__` 为绑定的视图模型实例（页面 `_vm_` 闭包）。
`__opts__` 为开放对象，实际产物中观察到的键：

| 键          | 形态                                                          | 说明 |
| ----------- | -------------------------------------------------------------- | ---- |
| `classList` | `string[]`                                                     | 仅静态 class，动态 class 走函数闭包 |
| `events`    | `{ [eventName]: (evt) => any }`                                | 事件名去除 `on` 前缀（`click`、`cardtap`） |
| `value`     | `string \| (() => string)`                                     | 文本内容，函数形式表示动态绑定 |
| `style`     | `() => $translateStyle$(...)` 或静态对象                       | 内联样式 |
| `attrs`     | 元素相关属性集合                                                | 标签特定（`src`、`name`、`color` 等） |
| `modifiers` | `{ [attr]: { [decorator]: true } }`                            | 源自 UX 模板的 `attr.mod` 装饰器语法 |

自定义组件的用户 props（如 `name: "张伟"`、`color: "#E91E63"`）平铺于
`__opts__` 顶层，与 `events` 并列，不嵌套于 `attrs`。运行时根据组件 `props`
声明转发。

### 7.1 静态值 vs 动态值

静态值以原始字面量形式出现：

```js
__opts__: { classList: ["title"], value: "联系人" }
```

动态值以闭包形式封装 `_vm_`：

```js
__opts__: { value: function() { return _vm_.message; } }
```

运行时将函数型 opt 视为响应式绑定，VM 数据变更时重新求值。

### 7.2 事件

```js
__opts__: {
  events: {
    click: function(evt) { return _vm_.handleClick(evt); },
    cardtap: function(evt) { return _vm_.onCardTap(evt); },
  }
}
```

事件名为源码 `on<Name>` 属性去除前缀后的小写形式（`onclick` → `click`，
`oncardtap` → `cardtap`）。回调统一接收 `evt` 参数，通过闭包持有 `_vm_`
而非 `.bind`。

常见事件名：`click`、`focus`、`blur`、`key`、`longpress`、`appear`、
`disappear`、`swipe`、`touchstart`、`touchmove`、`touchend`、`touchcancel`、
`resize`、`animationstart`、`animationiteration`、`animationend`。

### 7.3 条件渲染与列表渲染

条件（`if` / `elif` / `else`）与列表（`for`）不作为 opts 传递，而是经由
`ci(...)` / `cf(...)` 包装函数包裹元素，详见 `parser/lib/ux/translate/vela/`
下的 `CiTranslate.js` 与 `CfTranslate.js`。MVP 暂不涵盖；后续实现时单独成
文。

## 8. Manifest

`manifest.json` 形态（取自 `aiot-demo`）：

```json
{
  "package": "com.application.watch.demo",
  "name": "aiot-demo",
  "versionName": "1.0.0",
  "versionCode": 1,
  "minPlatformVersion": 1200,
  "icon": "/common/logo.png",
  "simulationVersion": "default",
  "deviceTypeList": ["watch"],
  "features": [ { "name": "system.router" }, { "name": "system.configuration" } ],
  "config": { "logLevel": "log", "designWidth": "device-width" },
  "router": {
    "entry": "pages/index",
    "pages": {
      "pages/index":  { "component": "index"  },
      "pages/detail": { "component": "detail" }
    }
  }
}
```

`features` 声明应用可 `import` 的 `system.*` 桥接白名单。已观察到的部分桥
接名称：

| 名称                   | 用途                          |
| ---------------------- | ----------------------------- |
| `system.router`        | 路由导航                      |
| `system.configuration` | 区域设置、设计稿宽度         |

完整列表见 `parser/lib/ux/config/FeatureConfig.js`，Phase 0 研究阶段统一
摘录。

## 9. rpk 包布局

`.rpk` 为标准 zip。内部结构：

```
manifest.json
app.js
pages/<name>/<name>.js
common/...
i18n/...
config-watch.json        （表盘类应用特有）
manifest-watch.json      （表盘类应用特有）
META-INF/
  build.txt              originType / toolkit / 时间戳 / node / platform / arch / component
  CERT                   hash.json 的签名 zip
```

`hash.json` 由 `@aiot-toolkit/aiotpack` 的 `signature/Signer.js` 生成，将
在 Phase 4 中逆向。Phase 0–3 输出未签名 debug `.rpk`，依赖模拟器与设备的
调试模式宽容策略。

## 10. AstroForge 实现契约

本节列出的运行时 ABI 是 AstroForge 必须遵循的**全部**约束。厂商工具链经
`.ux` SFC 中转源于其继承自 Vue SFC 传统；AstroForge 绕开该层，将 React/TSX
直接下沉为：

1. `manifest.json`
2. `app.js`（按 §1、§4）
3. `pages/<name>/<name>.js`（按 §1、§5–§7）
4. `common/...` 资源

只要产物以正确形态调用 `aiot.__ce__` / `aiot.__cc__` 并附带正确的 webpack
包装函数，从运行时视角即等价于一个 Vela 快应用，与源码语言无关。

## 11. 参考源码路径

| 主题               | 路径                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| 模块包装           | `aiotpack/lib/compiler/javascript/vela/plugin/WrapPlugin.js`                                          |
| UX → TS 流水线     | `parser/lib/ux/translate/vela/UxToTypescript.js`                                                      |
| Template → `__ce__`| `parser/lib/ux/translate/vela/TemplateToTypescript.js`                                                |
| Style → 样式表     | `parser/lib/ux/translate/vela/StyleToTypescript.js`、`parser/lib/ux/enum/StyleSelectorType.js`        |
| 脚本规范化         | `parser/lib/ux/translate/vela/ScriptToTypescript.js`、`aiotpack/lib/utils/ux/UxLoaderUtils.js`        |
| 元素目录           | `parser/lib/ux/config/vela/ElementConfig.js`                                                          |
| 样式属性表         | `parser/lib/ux/config/vela/StyleAttributeConfig.js`                                                   |
| Webpack 配置       | `aiotpack/lib/compiler/javascript/vela/VelaWebpackConfigurator.js`                                    |
| 打包与签名         | `aiotpack/lib/compiler/javascript/vela/utils/ZipUtil.js`、`…/utils/signature/Signer.js`               |

上述路径均位于本工作区 `.tmp/aiot-toolkit-pkg/` 之下。
