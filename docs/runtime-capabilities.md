# 运行时能力目录

AstroForge 把快应用运行时能力分成两层：

- `@astralsight/astroforge-core` 的组件和 API 类型定义，面向应用源码与编辑器提示；
- `@astralsight/astroforge-core/platform` 的能力目录，面向编译期校验和未来多平台后端。

这两层都不直接决定 Vela 后端的 JS 打印格式。现有 Vela 产物仍由 IR 与
`astroforge-vela` 后端决定，能力目录只用于提前发现“不该面向当前平台使用”的
组件或 feature。

## 分类

`RUNTIME_CAPABILITIES` 中每条记录包含：

| 字段        | 含义                                                        |
| ----------- | ----------------------------------------------------------- |
| `kind`      | `component` 或 `feature`                                    |
| `name`      | 渲染标签名或 manifest feature 名                            |
| `group`     | 开发者视角的能力分组，如 `network`、`storage`、`media`      |
| `scope`     | 能力来源：AstroForge 跨 runtime 抽象、Vela 专有或 Vela 内部 |
| `platforms` | 各平台支持情况和最低版本                                    |

分组规则：

- `system.fetch`、`system.uploadtask`、`system.request` 统一归入 `network`。
  对外类型可用 `network` 汇总，但后端仍按真实 feature 名写入 manifest 和
  `$app_require$`。
- `system.network` 的网络状态读写也归入 `network`。这是网络语义的聚合，不代
  表它是跨平台能力；目标平台不支持时仍由能力目录在编译期拦截。
- `system.interconnect` 是和手机伴生应用通信的连接能力，独立归入
  `interconnect`，不并入 `network`。
- `scope: "shared"` 只表示 AstroForge 计划把该能力抽象为跨手表快应用
  runtime 的公共能力；它不引用手机快应用联盟，也不暗示 BlueOS 已实现。
- `system.internal.power`、`system.internal.package`、`system.internal.activity`
  与 `system.messageChannel` 归入 `vela-internal`。这些能力来自 Vela 当前固
  件导出，不应作为跨平台应用 API 设计基础。
- 调试符号中出现的错误码兼容层和测试 Feature 暂不进入能力目录。

## 导入命名

跨平台抽象或 AstroForge 聚合能力保持无平台前缀，例如：

```ts
import { network, router, storage } from "@astralsight/astroforge-core";
```

Vela 专有能力使用 `vela*` 前缀导出，例如：

```ts
import {
  velaBluetoothBLE,
  velaBrightness,
  velaInterconnect,
  VelaInternals,
} from "@astralsight/astroforge-core";
```

前缀只影响源码侧的导入名。Vela 后端仍按真实 feature 名生成宿主桥接 require，
例如 `$app_require$("@app-module/system.interconnect")`、
`$app_require$("@app-module/system.bluetooth.ble")`，不改变厂商 runtime ABI。

## 编译期校验

`@astralsight/astroforge-rsbuild-plugin` 在写出 IR 前会调用能力校验：

1. 读取 `manifest.features` 中显式声明的 feature；
2. 扫描页面和组件模板里的内置渲染标签；
3. 按 `plugin.target` 和 `manifest.minPlatformVersion` 检查支持矩阵；
4. 发现不支持项时直接报错，并提示需要移除、条件编译或补目标平台后端。

当前实际构建后端仍只有 `vela`。`blueos` 在目录中只作为未来后端预留，不能绕
过 CLI / 后端的目标限制。

## 维护规则

新增组件或接口时先补三处：

1. `packages/core/src/components.ts` 或 `packages/core/src/apis.ts` 的开发期类型；
2. `packages/core/src/platform.ts` 的能力目录与平台支持矩阵；
3. `packages/rsbuild-plugin-astroforge/src/tsx.ts` 的 PascalCase 组件映射（仅对
   可渲染内置组件需要）。

Vela 专有 JS API 的源码导出名必须带 `vela` 前缀；如果该 API 会被 Vela 后端
直接探测，还要在 `crates/astroforge-vela/src/lower.rs` 中登记前缀变量名到真实
feature 名的映射。

如果新增能力需要改变 Vela JS 产物，再回到 `docs/vela-runtime-abi.md` 对照厂
商运行时 ABI，并补 compat fixture。
