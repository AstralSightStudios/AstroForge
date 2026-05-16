export default function(global, globalThis, window, $app_exports$, $app_evaluate$) {
  var org_app_require = typeof $app_require$ === "undefined" ? undefined : $app_require$;
  (function(global, globalThis, window, $app_exports$, $app_evaluate$) {
    var setTimeout = global && global.setTimeout;
    var setInterval = global && global.setInterval;
    var clearTimeout = global && global.clearTimeout;
    var clearInterval = global && global.clearInterval;
    var $app_require$ = global && global.$app_require$ || org_app_require || function(moduleId) {
      throw new Error("AstroForge runtime require failed: " + moduleId);
    };

    function createRequire(modules) {
      var cache = {};
      function __webpack_require__(moduleId) {
        var cached = cache[moduleId];
        if (cached !== void 0) return cached.exports;
        if (!modules[moduleId]) throw new Error("AstroForge module not found: " + moduleId);
        var module = cache[moduleId] = { exports: {} };
        modules[moduleId](module, module.exports, __webpack_require__);
        return module.exports;
      }
      __webpack_require__.g = (function() {
        if (typeof globalThis === "object") return globalThis;
        try { return this || new Function("return this")(); }
        catch (e) { if (typeof window === "object") return window; }
        return {};
      })();
      __webpack_require__.rv = function() { return "astroforge"; };
      __webpack_require__.ruid = "bundler=astroforge";
      return __webpack_require__;
    }

    function installTranslateStyle(target) {
      if (target.$translateStyle$) return;
      target.$translateStyle$ = function(value) {
        if (typeof value !== "string") return value;
        return Object.fromEntries(value.split(";").filter(function(item) {
          return item && item.trim();
        }).map(function(item) {
          var match = item.match(/([^:]+):(.*)/);
          if (!match || match.length < 3) return [];
          return [
            match[1].trim().replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); }),
            match[2].trim()
          ];
        }));
      };
    }

    function normalizeVmModule(moduleOwn) {
      var accessors = ["public", "protected", "private"];
      if (moduleOwn.data && accessors.some(function(acc) { return moduleOwn[acc]; })) {
        throw new Error("页面VM对象中的属性data不可与\"" + accessors.join(",") + "\"同时存在，请使用private替换data名称");
      }
      if (!moduleOwn.data) {
        moduleOwn.data = {};
        moduleOwn._descriptor = {};
        accessors.forEach(function(acc) {
          var value = moduleOwn[acc];
          if (typeof value === "object" && value) {
            Object.assign(moduleOwn.data, value);
            for (var name in value) moduleOwn._descriptor[name] = { access: acc };
          } else if (typeof value === "function") {
            console.warn("页面VM对象中的属性" + acc + "的值不能是函数，请使用对象");
          }
        });
      }
    }

    function resolveAiot(global, globalThis, window, runtimeGlobal) {
      return global && global.aiot ||
        runtimeGlobal && runtimeGlobal.aiot ||
        globalThis && globalThis.aiot ||
        window && window.aiot ||
        (typeof aiot !== "undefined" ? aiot : undefined);
    }

    var createAppHandler = function() {
      return (function() {
        var __webpack_require__ = createRequire({
          "./src/manifest.json": function(module) {
            module.exports = JSON.parse("{\n  \"package\": \"com.astroforge.fixture.conditional\",\n  \"name\": \"fixture-06-conditional-render\",\n  \"versionName\": \"1.0.0\",\n  \"versionCode\": 1,\n  \"minPlatformVersion\": 1200,\n  \"minAPILevel\": 1,\n  \"icon\": \"/common/logo.png\",\n  \"simulationVersion\": \"default\",\n  \"deviceTypeList\": [\n    \"watch\"\n  ],\n  \"features\": [],\n  \"config\": {\n    \"logLevel\": \"log\",\n    \"designWidth\": \"device-width\"\n  },\n  \"router\": {\n    \"entry\": \"pages/index\",\n    \"pages\": {\n      \"pages/index\": {\n        \"component\": \"index\"\n      }\n    }\n  }\n}\n");
          }
        });
        installTranslateStyle(__webpack_require__.g);

        var $app_style$ = [];
        var $app_script$ = function __scriptModule__(module, exports, $app_require$) {
          Object.defineProperty(exports, "__esModule", { value: true });
          exports.default = {};
        };

        $app_script$({}, $app_exports$, $app_require$);
        $app_exports$.default.style = $app_style$;
        $app_exports$.default.manifest = __webpack_require__("./src/manifest.json");
        return $app_exports$.default;
      })();
    };
    return createAppHandler();
  })(global, globalThis, window, $app_exports$, $app_evaluate$);
}
