# 架构总览

本文档从高层视角介绍 AstroForge 的完整编译管线，帮助理解 TSX 源码如何一步步转换为可在 Vela 设备上运行的 `.rpk` 包。

## 总体流程

```
TSX 源码
    │
    ▼
@astralsight/astroforge-rsbuild-plugin  (TypeScript)
    │  - 发现 src/pages/**
    │  - 解析 TSX → AST
    │  - 提取 hooks、模板、样式、生命周期
    │  - BFS 加载跨文件组件
    │  - 写出 IR JSON
    ▼
IrDocument JSON  (跨进程契约)
    │
    ▼
astroforge-cli  (Rust)
    │  - 读取 IR
    │  - lower 为 RuntimeModule
    │  - emit Vela JS
    │  - 打包为 .rpk
    ▼
.rpk  (Vela 设备可安装)
```

## 前端层：Rsbuild 插件

### 职责

- **页面发现**：扫描 `src/pages/**/*.{tsx,ts,jsx}`，按文件路径推导路由
- **TSX 解析**：使用 `@babel/parser` 将 TSX 源码解析为 AST
- **脚本提取**：从组件函数中提取 hooks、方法、生命周期，生成 `Script` IR
- **模板提取**：将 JSX AST 降维为 `Node[]` IR（元素、文本、表达式、条件、列表）
- **样式提取**：解析 CSS import 和导出的样式字符串，生成 `StyleTable` IR
- **组件加载**：BFS 遍历跨文件 PascalCase import，递归提取组件 IR
- **IR 生成**：将所有信息组装为 `IrDocument`，写出 JSON 文件

### 关键模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 项目编译器 | `project.ts` | 协调整个编译流程 |
| TSX 提取器 | `tsx/` | AST → IR 的核心转换逻辑 |
| 样式解析器 | `style.ts` | CSS 文本 → StyleRule[] |
| 资源收集器 | `assets.ts` | 收集图片、字体等静态资源 |
| 能力校验器 | `capabilities.ts` | 校验平台支持的组件和 API |

## 跨进程层：IR 契约

### IrDocument

`IrDocument` 是前端（TypeScript）与后端（Rust）之间的唯一契约。其 JSON Schema 位于 `docs/ir-document.schema.json`。

```rust
pub struct IrDocument {
    pub ir_version: i32,           // 当前为 1
    pub manifest: Manifest,
    pub app: AppModule,
    pub pages: IndexMap<String, Page>,
    pub components: IndexMap<String, Component>,
    pub assets: Vec<AssetRef>,
}
```

### 三层 IR

| 层级 | Rust 模块 | 职责 | 序列化 |
|------|----------|------|--------|
| Component | `astroforge_ir::component` | 组件树：元素、文本、表达式、条件、列表 | 跨进程 JSON |
| Page | `astroforge_ir::page` | 完整编译产物描述 | 跨进程 JSON |
| Runtime | `astroforge_ir::runtime` | 直接对应 `aiot.__ce__` 调用 | 后端内部 |

### 不变式

- 所有枚举使用 adjacent tagging：`{ "kind": "...", "value": ... }`
- 字段顺序敏感（使用 `IndexMap` 保留插入顺序）
- `IR_VERSION` 变更触发严格版本校验

## 后端层：Rust CLI

### 职责

- **IR 加载**：读取 `ir-document.json`，校验版本
- **lower**：将 Component/Page IR 转换为 RuntimeModule
- **emit**：将 RuntimeModule 打印为 Vela JS 代码
- **打包**：将 JS、manifest、资源打包为 `.rpk`
- **签名**：插入 V2 签名块

### 关键模块

| Crate | 职责 |
|-------|------|
| `astroforge-ir` | IR 数据结构、序列化、Schema 生成 |
| `astroforge-vela` | Vela 后端：lower + emit |
| `astroforge-packager` | ZIP 打包、V2 签名 |
| `astroforge-compat` | 兼容性测试、IR diff |
| `astroforge-cli` | CLI 入口、命令路由 |

## 产物结构

构建产物 `.rpk` 是标准 ZIP 文件：

```
manifest.json
app.js
pages/
  <route>/
    <comp>.js
common/
  ...
i18n/
  ...
META-INF/
  build.txt
  CERT
```

与 `aiot-toolkit` 产物字节级兼容。

## 数据流示例

以一个简单的计数器页面为例：

```tsx
export default function Page() {
  const [count, setCount] = useState(0);
  return (
    <View onClick={() => setCount(c => c + 1)}>
      <Text>{count}</Text>
    </View>
  );
}
```

**前端提取阶段**：
1. 解析 TSX → AST
2. 提取 `useState(0)` → `private_data.count = 0`
3. 提取 `setCount(c => c + 1)` → `script.methods.setCount`
4. 提取 JSX → `Node::Element`（`tag: "div"`，`events: { click: ... }`）
5. 组装为 `Page` IR，写出 JSON

**后端 lower 阶段**：
1. 读取 `Page` IR
2. 生成 `RuntimeModule::Page`
3. `script_object` 字段包含 VM 数据和方法
4. `template_root` 字段包含 `RuntimeNode` 树

**emit 阶段**：
1. `template_root` → `aiot.__ce__("div", { __vm__: _vm_, __opts__: { events: { click: ... } } }, [ ... ])`
2. 包装为 webpack 模块格式
3. 写出 `pages/index/index.js`

**打包阶段**：
1. 收集所有页面 JS、app.js、manifest.json、资源
2. 按优先级排序
3. 生成 `META-INF/build.txt`
4. 生成 `META-INF/CERT`（内层 zip）
5. 生成 V2 签名块
6. 压缩为 `.rpk`

## 下一步

深入了解各子系统：
- [TSX 提取器](tsx-extractor.md)
- [IR 中间表示](ir-format.md)
- [Vela 后端](vela-backend.md)
- [打包器](packager.md)
