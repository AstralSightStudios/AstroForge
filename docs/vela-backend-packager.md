# Vela 后端、Packager 与 Compat Runner

本文档面向所有维护 AstroForge Vela target 产物链路的工程师，描述从
`astroforge_ir::page::IrDocument` 出发到生成可在 Vela 设备运行时加载的 `.rpk`
为止的执行路径，并说明对照测试体系的入口与契约。

## 构建流水线

`astroforge build --target vela` 执行四步：

1. 在项目根目录运行 `pnpm exec rsbuild build`，除非传入 `--skip-rsbuild` 或
   `--ir <path>`。
2. 通过 `astroforge_ir::io::load_ir_from_path` 加载
   `node_modules/.cache/astroforge/ir-document.json`，并在加载阶段强制校验
   `IR_VERSION`，避免后端读到不兼容的 IR。
3. 调用 `astroforge-vela` 将 Page IR 下沉为 Vela 兼容的 JS 模块集合。
4. 调用 `astroforge-packager` 写出 unpacked 目录与签名后的 debug `.rpk`。

默认产物路径：

```text
dist/<package>.debug.rpk
dist/unpacked/
```

`astroforge release --target vela` 当前复用同一打包路径，仅将文件名后缀替换为
`.release.rpk`。packager 默认使用与 aiot-toolkit fallback 行为兼容的开发用签名
身份；生产签名材料可通过 `ASTROFORGE_VELA_PRIVATE_KEY` 与
`ASTROFORGE_VELA_CERTIFICATE` 注入，两个变量必须同时设置。

## Vela 后端产物

`astroforge-vela` 生成以下文件：

- `manifest.json`，所有字段名均与 Vela 厂商格式一比一对齐
  （`versionName`、`minPlatformVersion`、`deviceTypeList` 等）。
- `manifest-<device>.json`，对 `deviceTypeList` 中每个设备生成一份。内容等价
  于源 manifest 与可选 `config-<device>.json` 经 `lodash.merge` 合并后的结果，
  不包含 `minAPILevel` 与 `packageInfo` 这两个 packager / build pipeline 注入
  项。
- `app.js`，包含模块外壳、`manifest.json` 的 webpack 模块体、`app` 生命周期
  对象与 `$translateStyle$` 的注册逻辑。
- `pages/<route>/<component>.js`，包含页面 script 对象、`$app_template$`、样
  式表、`system.*` 桥接 require、自定义组件注册以及 VM data 规范化逻辑。
- 静态资源按原路径拷贝（如 `common/logo.svg`）。

模板打印器将 Component IR 映射为以下 Vela 运行时调用：

- 内置元素：`aiot.__ce__`。
- 自定义组件：`aiot.__cc__`。
- 条件分支：`aiot.__ci__`。
- 列表渲染：`aiot.__cf__`。

产物面向 ABI 级等价：可读性 / 空白字符不在兼容契约范围内，对照测试基于归一
化后的 AST 与运行时调用序列。

## Packager 命令

检视一个 `.rpk` 包的清单与 manifest：

```bash
astroforge inspect rpk dist/com.example.debug.rpk
```

解包至目录：

```bash
astroforge unpack dist/com.example.debug.rpk --out .tmp/unpacked
```

包内文件按照 aiot-toolkit `ZipUtil.getPriorities` 的优先级表排序：
`META-INF/CERT` → `i18n/*.json` → `manifest-<device>.json` →
`manifest.json` → `app.js` → 入口路由的页面文件 → `common/*` →
其余 `.js` → `META-INF/build.txt`。该顺序由
`astroforge_packager::sort_package_files` 实现，并由
`priority_sort_matches_aiot_toolkit` 单元测试锁定。

## Compat Runner

`astroforge test-compat` 发现 `fixtures/*/astroforge`，对每个 fixture 构建并
将 AstroForge 侧 golden 写入：

```text
fixtures/<fixture>/golden/astroforge/app.rpk
fixtures/<fixture>/golden/astroforge/unpacked/
fixtures/<fixture>/golden/astroforge/summary.json
```

`summary.json` 内容包括：包内文件列表、归一化后的 manifest、每个 JS 文件中
`aiot.__ce__` / `__cc__` / `__ci__` / `__cf__` 的调用序列。

默认不会触发官方 `aiot-toolkit` 侧构建。带上 `--official` 即可让 runner 同时
构建每个 fixture 的 `official/` 子项目，并写入对照 golden：

```bash
astroforge test-compat --official
```

```text
fixtures/<fixture>/golden/aiot/app.rpk
fixtures/<fixture>/golden/aiot/unpacked/
fixtures/<fixture>/golden/aiot/summary.json
```

任一对照桶（files / manifest / runtime_calls / rpk_structure）的
`diff_count` 非零时，命令以非零退出码结束；`rpk_structure` 桶覆盖 RPK 容器
层结构。

定位 aiot-toolkit 可执行文件的优先级：环境变量 `ASTROFORGE_AIOT_BIN` >
`/Volumes/EXT0/GitHub/aiot-demo/node_modules/.bin/aiot` >
`PATH` 中的 `aiot`。

`cargo test -p astroforge-compat --test compat_goldens` 提供轻量级回归网：直
接对所有 fixture 已提交的 `golden/*/summary.json` 做 files / manifest /
runtime_calls 三级 diff，不再触发 pnpm / aiot-toolkit，适合在无厂商工具链的
CI 环境中使用。

## RPK 容器契约

`astroforge test-compat --official` 在 `comparison.rpk_structure` 桶中记录
zip 容器级元数据。AstroForge 的 Vela packager 与官方契约保持以下一致：

- 文件条目使用 DEFLATE level 9 压缩，目录条目使用 Stored。
- 外层 zip 设置 archive comment 为 JSON 形式的打包元数据（包含 `toolkit`、
  `timeStamp`、`node`、`platform`、`arch`、`component` 字段）。
- 显式写入目录条目（如 `META-INF/`、`pages/`、`pages/index/`、`common/`）。
- 为 `manifest.deviceTypeList` 中的每个设备写入 `manifest-<device>.json`，
  位置严格排在 `manifest.json` 之前。每份变体等价于源 manifest 与可选
  `config-<device>.json` 的 `lodash.merge` 结果，不携带 `minAPILevel` /
  `packageInfo`（这两个字段是 packager / build pipeline 对主 manifest 的注
  入项，不属于 device manifest）。
- `META-INF/build.txt` 以 `\n` 分隔字段，**不带尾随换行**，与 aiot-toolkit
  `Object.entries(comment).map(...).join('\n')` 的字节序列一致。
- `META-INF/CERT` 自身是一个内层 zip，包含 `hash.json`：记录所有非 CERT
  文件的 SHA-256 摘要。
- `META-INF/CERT` 与外层 `.rpk` 都按 Vela `RPK Sig Block 42` 规范追加签名
  块；compat runner 记录两侧签名块的存在性、KV ID 列表与 size 字段一致性。
  内层 `META-INF/CERT` zip 的 comment 必须为空字符串（与 aiot-toolkit
  `JSZip.loadAsync` → `generateAsync({ comment: null })` 的二次序列化语义
  一致），仅外层 rpk 持有 JSON 元数据 comment。
- 文件排序严格按 aiot-toolkit `ZipUtil.getPriorities`：CERT、其它 manifest
  变体、`manifest.json`、`app.js`、入口路由页面文件、`common/`、其余 JS
  文件、`META-INF/build.txt`。

该契约只约束**结构**而非字节级一致：JS 模块文本由 AstroForge 自主产出，与
aiot-toolkit 不可能逐字节相同。时间戳、工具链版本、签名等动态元数据由 compat
归一化层抹平；结构层只要求容器特性与签名块形态匹配。

## 设备钩子

`astroforge install <rpk>` 校验 rpk 路径存在后，调用环境变量
`ASTROFORGE_INSTALL_CMD` 中配置的命令。该命令字符串中可包含字面量 `{rpk}`，
runner 会替换为实际 rpk 路径。

`astroforge log` 优先调用 `ASTROFORGE_LOG_CMD`；未配置且 `PATH` 中存在
`adb` 时退回到 `adb logcat`；均不可用时输出原因并以无操作结束。
