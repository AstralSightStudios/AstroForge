# fixture 01 — hello-text

最小可执行的快应用：单页面，仅包含一段静态文本。

## 用途

为编译流水线提供最简单的等价性基线——任何后续 fixture 都至少要先达到 01 的
水平：

- `app.js` 与 `pages/index/index.js` 经规范化后 AST 等价；
- 运行时调用序列：恰好一次 `aiot.__ce__("div", …)`，内含一次
  `aiot.__ce__("text", …)`；
- `manifest.json` 路由表中 `entry == "pages/index"`。

## 目录布局

```
01-hello-text/
├─ official/        aiot-toolkit 风格的 .ux 源码
│  ├─ package.json
│  ├─ src/
│  │  ├─ manifest.json
│  │  ├─ app.ux
│  │  └─ pages/index/index.ux
│  └─ build/        （由 aiot-toolkit 生成，gitignore）
├─ astroforge/      AstroForge 风格的 .tsx 源码
│  ├─ package.json
│  ├─ astroforge.config.ts
│  └─ src/
│     ├─ app.tsx
│     └─ pages/index/index.tsx
└─ golden/
   ├─ aiot/         official 的规范化产物
   └─ astroforge/   astroforge 的规范化产物
```

## 运行方法

```bash
pnpm --filter @astroforge/fixtures-runner exec astroforge-fixtures run 01-hello-text
```

或手动：

```bash
cd fixtures/01-hello-text/official
npx aiot build

cd ../astroforge
astroforge build --target vela
```

## 预期产物

`pages/index/index.js` 在模块体内应当包含以下结构（顺序与空白允许差异，AST
等价即可）：

```js
var $app_style$ = [];
var $app_script$ = function __scriptModule__(module, exports, $app_require$) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = void 0;
  exports.default = {};
};
var $app_template$ = function(vm) {
  const _vm_ = vm || this;
  return aiot.__ce__("div", { __vm__: _vm_, __opts__: {} }, [
    aiot.__ce__("text", { __vm__: _vm_, __opts__: { value: "Hello, Vela!" } }, [])
  ]);
};
$app_exports$['entry'] = function($app_exports$) {
  $app_script$({}, $app_exports$, $app_require$);
  $app_exports$.default.template = $app_template$;
  $app_exports$.default.style = $app_style$;
};
```
