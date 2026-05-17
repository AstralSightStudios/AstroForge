# TSX 提取器

本文档深入介绍 `@astralsight/astroforge-rsbuild-plugin` 中的 TSX → IR 提取逻辑。

## 模块结构

提取器已重构为 `src/tsx/` 目录下的多个模块：

```
packages/rsbuild-plugin-astroforge/src/tsx/
  types.ts      # 共享类型定义
  ast.ts        # AST 辅助函数（纯函数，无 IR 逻辑）
  lower.ts      # AST → JS 字符串 lowering
  script.ts     # 脚本提取（hooks、方法、生命周期、import 内联）
  template.ts   # 模板提取（JSX → Node[]）
  index.ts      # 入口（协调各层）
```

## 入口流程

### extractPageModuleFromTsx

```ts
export function extractPageModuleFromTsx(source: string, options: ExtractPageOptions): ExtractPageModuleResult
```

流程：
1. **Parse**：`@babel/parser` 解析 TSX → AST
2. **收集 import**：`collectAstroForgeImports` 建立内置组件绑定表
3. **查找页面函数**：`findDefaultPageFunction` 定位 default export 的函数
4. **提取脚本**：`extractScript` 提取 hooks、方法、生命周期
5. **提取模板**：`templateFromRenderExpression` 将 JSX 转换为 `Node[]`
6. **提取本地组件**：`extractLocalComponents` 扫描同文件 PascalCase 函数
7. **收集组件 import**：`collectComponentImports` 扫描跨文件组件引用
8. **组装页面**：组合为 `Page` IR

## AST 辅助层（ast.ts）

纯函数集合，负责 AST 节点识别、源码切片、命名转换。关键函数：

| 函数 | 职责 |
|------|------|
| `unwrapExpression` | 去除 TS 类型断言、括号等包装 |
| `isFunctionLike` | 判断是否为函数节点 |
| `findTopLevelBinding` | 按名称查找顶层绑定 |
| `renderExpressionFromFunction` | 提取函数的 JSX 返回表达式 |
| `jsxElementName` | 提取 JSX 标签名 |
| `staticJsonValue` / `staticAttrLiteral` | 提取静态 JSON 字面量 |
| `bindingPath` | 提取标识符/成员访问的路径字符串 |
| `findDefaultPageFunction` | 查找 default export 的页面函数 |
| `locateComponentFunction` | 按名称定位命名导出组件 |

## 脚本提取层（script.ts）

### 上下文（ScriptContext）

```ts
interface ScriptContext {
  source: string;                // 源码字符串
  filename?: string;             // 文件名（用于报错）
  stateVars: Set<string>;        // 状态变量名（VM 数据）
  stateSetters: Map<string, string>;  // setter → state 映射
  methodVars: Set<string>;       // 方法变量名
  memoVars: Map<string, any>;    // useMemo 表达式
  idCounter: number;             // useId 计数器
  contextVars: Map<string, ContextVar>; // createContext 变量
}
```

### Hook 提取

每个 hook 有独立的提取函数：

| 函数 | 处理的 hook | 编译目标 |
|------|------------|---------|
| `collectUseStateDeclaration` | `useState` | `private_data` + setter 方法 |
| `collectUseRefDeclaration` | `useRef` | `private_data.{ current: ... }` |
| `collectUseMemoDeclaration` | `useMemo` | `memoVars`（模板内联） |
| `collectUseReducerDeclaration` | `useReducer` | `private_data` + dispatch 方法 |
| `collectUseIdDeclaration` | `useId` | `private_data.__af_id_N` |
| `collectUseEffectCalls` | `useEffect` | `lifecycle.onReady` / `onDestroy` |
| `collectUseCallbackMethod` | `useCallback` | `script.methods` |

### 生命周期提取

```ts
collectPageLifecycle(script, context, moduleBody);
```

扫描 `export const lifecycle = { ... }`，将每个方法提取到 `script.lifecycle`。

### Import 内联

```ts
inlineLocalImports(moduleBody, script, context, resolveImport, loadModule);
```

处理相对路径 import 的函数/常量导出，将其定义直接内联到当前页面的 `script.methods` 或 `script.private_data` 中。

关键不变式：必须用被 import 模块的 source 创建独立 `ScriptContext` 再做 lower，否则 `sourceForNode` 会在当前文件源码上按错误坐标切片。

## 模板提取层（template.ts）

### 核心流程

`templateFromRenderExpression` → `nodeFromJsx` → `elementFromJsx` / `nodeFromExpression`

### JSX → Element

`elementFromJsx` 处理每个 JSX 元素：

1. 提取标签名
2. 判断是否为内置组件（查 `bindings` 表）
3. 判断是否为自定义组件（PascalCase 且不在 bindings 中）
4. 遍历属性：
   - `JSXSpreadAttribute` → `spreads`
   - 事件属性（`onXxx`）→ `events`
   - 普通属性 → `attrs`
5. 处理 children

### 表达式节点

`nodeFromExpression` 处理 JSX 中的 JS 表达式：

- `ConditionalExpression` / `LogicalExpression(&&)` → `Node::Conditional`
- `CallExpression(.map)` → `Node::List`
- `Identifier`/`MemberExpression`（匹配 memoVar）→ 内联求值
- `Literal` → `Node::Text`
- 其他 → `Node::Expression`（动态绑定）

### 条件渲染

三元表达式和 `&&` 表达式被提取为 `Conditional` 节点：

```tsx
{isReady ? <Text>Ready</Text> : <Text>Loading</Text>}
```

```json
{
  "kind": "conditional",
  "value": {
    "branches": [
      { "guard": { "path": "isReady" }, "body": [ ... ] },
      { "guard": null, "body": [ ... ] }
    ]
  }
}
```

### 列表渲染

`array.map((item, index) => <Element key={...} />)` 被提取为 `List` 节点：

```tsx
{items.map((item, idx) => (
  <View key={item.id}>
    <Text>{item.name}</Text>
  </View>
))}
```

```json
{
  "kind": "list",
  "value": {
    "source": { "path": "items" },
    "item_var": "item",
    "index_var": "idx",
    "key": { "path": "item.id" },
    "body": [ ... ]
  }
}
```

约束：
- 必须是 `array.map(callback)` 形式
- callback 必须是函数
- 第一个参数（item）必须是标识符
- 第二个参数（index）可选，必须是标识符
- 返回的 JSX 最外层必须有 `key` 属性

## Lower 层（lower.ts）

负责将 AST 表达式片段转换为 Vela 模板作用域的 JS 字符串。

### lowerTemplateExpression

将模板中的表达式（如 `` `Hi ${name}` ``）转换为 Vela 闭包代码（如 `"Hi " + (_vm_.name)`）。

处理：
- 标识符 → `_vm_.identifier`
- 成员访问 → `_vm_.object.property`
- 模板字符串 → 字符串拼接
- 三元表达式 → 三元表达式（递归 lower）
- 算术运算 → 保留运算符，操作数递归 lower

### lowerTemplateEventHandler

将内联事件处理函数转换为 Vela 事件回调：

```tsx
onClick={() => setCount(c => c + 1)}
```

```js
function(evt) {
  _vm_.count = _vm_.count + 1;
}
```

处理：
- setter 调用 → VM 直接赋值
- 状态引用 → `_vm_.stateVar`
- 桥接 API 引用 → 保留全局标识符
- 其他函数调用 → 保留调用

## 已知边界

- 静态属性值：识别 string/number/bool/null 以及完整由静态叶子组成的 `ObjectExpression` / `ArrayExpression`
- 混合形态的对象（对象里有动态值）会返回 `undefined` 退到 binding path
- 跨文件组件加载完后 `page.imports` 会被 `project.ts` 重新扫描并填充

## 测试

提取器测试位于 `packages/rsbuild-plugin-astroforge/src/tsx.test.ts`，覆盖：

- fixture 端到端提取
- 静态/动态样式
- 事件绑定
- 条件渲染
- 列表渲染
- 生命周期
- useEffect
- useRef / useCallback
- useMemo
- 组件 props 推导
- CSS 导入
- App 生命周期

## 下一步

- [IR 中间表示](ir-format.md)
- [Vela 后端](vela-backend.md)
