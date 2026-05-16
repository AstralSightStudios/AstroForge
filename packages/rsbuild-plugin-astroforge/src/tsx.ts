import { parse } from "@babel/parser";
import type {
  Attr,
  Binding,
  Component,
  Element,
  JsonValue,
  Node,
  Page,
  Script,
  AppModule,
} from "./ir";
import { createEmptyScript, createEmptyStyleTable } from "./ir";
import { parseStyleTable } from "./style";

const BUILTIN_COMPONENTS = new Map<string, string>([
  ["View", "div"],
  ["Text", "text"],
  ["Image", "image"],
]);

export interface ExtractPageOptions {
  route: string;
  filename?: string;
}

interface PageFunction {
  node: any;
  renderExpression: any;
}

export interface ExtractPageModuleResult {
  page: Page;
  components: Record<string, Component>;
  componentImports: ComponentImport[];
}

/// 模板中可能引用、但定义在其它模块的 PascalCase 组件 import。
///
/// 由 `project.ts` 中的 BFS 加载器消费：按 `from` 路径定位源文件，再调用
/// `extractComponentFromTsx` 提取组件 IR。这一信息也包含在同文件 import
/// 中——`project.ts` 通过 `localComponentNames` 过滤掉同文件已提取的项。
export interface ComponentImport {
  /// 组件在使用方文件中的本地标识符（PascalCase）。
  localName: string;
  /// 模板中对应的 kebab-case 标签名。
  tag: string;
  /// import 的源标识符，与源码 `from '...'` 完全一致；仅当以 `./` 或 `../`
  /// 起始时被视为可解析的本地源文件。
  from: string;
  /// 命名导入时为导出名（与 `import { Foo as Bar } ...` 的 `Foo` 相同），
  /// 默认导入时为 `undefined`。下游加载器据此调用
  /// `extractComponentFromTsx` 的 `exportName` 参数。
  exportName?: string;
}

interface ScriptContext {
  source: string;
  filename?: string;
  stateVars: Set<string>;
  stateSetters: Map<string, string>;
}

export function extractPageFromTsx(
  source: string,
  options: ExtractPageOptions,
): Page {
  return extractPageModuleFromTsx(source, options).page;
}

export function extractPageModuleFromTsx(
  source: string,
  options: ExtractPageOptions,
): ExtractPageModuleResult {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const bindings = collectAstroForgeImports(ast.program.body);
  const pageFunction = findDefaultPageFunction(
    ast.program.body,
    options.filename,
  );
  const script = extractScript(
    source,
    ast.program.body,
    pageFunction.node,
    options.filename,
  );
  const template = templateFromRenderExpression(
    pageFunction.renderExpression,
    bindings,
    options.filename,
  );
  const components = extractLocalComponents(
    source,
    ast.program.body,
    pageFunction.node,
    bindings,
    options.filename,
  );
  const componentImports = collectComponentImports(
    ast.program.body,
    bindings,
    Object.keys(components),
  );
  const imports = importsFromTemplate(template, components);

  const page = {
    route: options.route,
    imports,
    template,
    script,
    style: extractStyleTable(source, ast.program.body, options.filename),
  };

  return { page, components, componentImports };
}

export interface ExtractComponentOptions {
  filename?: string;
  /// 命名导出场景下的标识符；用于在源文件中找到 `export function Foo()` /
  /// `export const Foo = () => ...` / `export { Foo }`。缺省时按默认导出
  /// 处理。
  exportName?: string;
}

export interface ExtractComponentResult {
  component: Component;
  componentImports: ComponentImport[];
}

/// 提取单个组件 TSX 文件中导出的组件 IR。
///
/// 假设：
/// - 导出是一个 PascalCase 函数（或返回函数的变量）。
/// - 函数体直接 `return <JSX/>`，与页面级 default export 同型。
/// - 模板中可继续引用其它本地或跨文件组件；这些会以 [`ComponentImport`]
///   形式返回给上层 BFS 加载器。
export function extractComponentFromTsx(
  source: string,
  options: ExtractComponentOptions,
): ExtractComponentResult {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const bindings = collectAstroForgeImports(ast.program.body);
  const located = locateComponentFunction(
    ast.program.body,
    options.exportName,
    options.filename,
  );

  const template = templateFromRenderExpression(
    located.renderExpression,
    bindings,
    options.filename,
  );
  const componentImports = collectComponentImports(ast.program.body, bindings, []);

  const component: Component = {
    name: kebabCase(located.localName),
    template,
    script: createEmptyScript(),
    style: extractStyleTable(source, ast.program.body, options.filename),
  };

  return { component, componentImports };
}

interface LocatedComponentFunction {
  localName: string;
  renderExpression: any;
}

function locateComponentFunction(
  body: any[],
  exportName: string | undefined,
  filename?: string,
): LocatedComponentFunction {
  if (!exportName) {
    const page = findDefaultPageFunction(body, filename);
    return {
      localName: page.node.id?.name ?? defaultExportName(body) ?? "Component",
      renderExpression: page.renderExpression,
    };
  }

  // export function Foo() { ... }
  // export const Foo = () => ...
  for (const statement of body) {
    if (statement.type !== "ExportNamedDeclaration" || !statement.declaration) {
      continue;
    }
    if (
      statement.declaration.type === "FunctionDeclaration" &&
      statement.declaration.id?.name === exportName
    ) {
      return {
        localName: exportName,
        renderExpression: renderExpressionFromFunction(
          statement.declaration,
          filename,
        ),
      };
    }
    if (statement.declaration.type === "VariableDeclaration") {
      for (const declarator of statement.declaration.declarations) {
        if (
          declarator.id.type === "Identifier" &&
          declarator.id.name === exportName &&
          declarator.init &&
          isFunctionLike(unwrapExpression(declarator.init))
        ) {
          return {
            localName: exportName,
            renderExpression: renderExpressionFromFunction(
              unwrapExpression(declarator.init),
              filename,
            ),
          };
        }
      }
    }
  }

  // export { Foo }; 形态：在顶层找同名函数 / 变量再绑定。
  for (const statement of body) {
    if (
      statement.type === "ExportNamedDeclaration" &&
      !statement.declaration &&
      statement.specifiers.some(
        (s: any) => s.exported?.name === exportName,
      )
    ) {
      const local = findTopLevelBinding(body, exportName);
      if (local && isFunctionLike(local)) {
        return {
          localName: exportName,
          renderExpression: renderExpressionFromFunction(local, filename),
        };
      }
    }
  }

  throw new Error(
    `${filename ?? "TSX"}: 未找到名为 ${exportName} 的命名导出函数`,
  );
}

function defaultExportName(body: any[]): string | undefined {
  for (const statement of body) {
    if (statement.type !== "ExportDefaultDeclaration") continue;
    const declaration = unwrapExpression(statement.declaration);
    if (declaration.type === "FunctionDeclaration" && declaration.id?.name) {
      return declaration.id.name;
    }
    if (declaration.type === "Identifier") {
      return declaration.name;
    }
  }
  return undefined;
}

/// 扫描模块的 import 声明，提取所有指向相对路径（`./`、`../`）的
/// PascalCase 命名导入；过滤掉 `@astroforge/core` 内置绑定与同文件已声明
/// 的组件，避免重复加入 IR.components 表。
function collectComponentImports(
  body: any[],
  builtinBindings: Map<string, string>,
  localComponentNames: string[],
): ComponentImport[] {
  const localTagSet = new Set(localComponentNames);
  const out: ComponentImport[] = [];

  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = statement.source.value;
    if (typeof source !== "string") continue;
    if (!source.startsWith("./") && !source.startsWith("../")) continue;

    for (const specifier of statement.specifiers) {
      const localName: string | undefined =
        specifier.type === "ImportDefaultSpecifier"
          ? specifier.local.name
          : specifier.type === "ImportSpecifier"
            ? specifier.local.name
            : undefined;
      if (!localName || !isPascalCase(localName)) continue;
      if (builtinBindings.has(localName)) continue;
      const tag = kebabCase(localName);
      if (localTagSet.has(tag)) continue;
      const exportName =
        specifier.type === "ImportSpecifier"
          ? specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value
          : undefined;
      out.push({ localName, tag, from: source, exportName });
    }
  }
  return out;
}

export function extractAppFromTsx(
  source: string,
  filename?: string,
): AppModule {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const context = createScriptContext(source, filename);
  const lifecycle: Record<string, string> = {};

  for (const statement of ast.program.body) {
    if (statement.type !== "ExportDefaultDeclaration") {
      continue;
    }

    const declaration = unwrapExpression(statement.declaration);
    if (declaration.type !== "ObjectExpression") {
      throw new Error(
        `${filename ?? "app.tsx"}: app default export 必须是对象字面量`,
      );
    }

    collectLifecycleObject(lifecycle, context, declaration, "body");
    return { lifecycle };
  }

  return { lifecycle };
}

function collectAstroForgeImports(body: any[]): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const statement of body) {
    if (
      statement.type !== "ImportDeclaration" ||
      !["@astroforge/core", "@astroforge/core/components"].includes(
        statement.source.value,
      )
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        continue;
      }

      const imported =
        specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : specifier.imported.value;
      const tag = BUILTIN_COMPONENTS.get(imported);
      if (tag) {
        bindings.set(specifier.local.name, tag);
      }
    }
  }

  return bindings;
}

function extractLocalComponents(
  source: string,
  body: any[],
  pageFunction: any,
  bindings: Map<string, string>,
  filename?: string,
): Record<string, Component> {
  const components: Record<string, Component> = {};
  for (const statement of body) {
    const candidate = componentCandidate(statement);
    if (
      !candidate ||
      candidate.node === pageFunction ||
      !isPascalCase(candidate.name)
    ) {
      continue;
    }

    const fn = unwrapExpression(candidate.node);
    if (!isFunctionLike(fn)) {
      continue;
    }

    const name = kebabCase(candidate.name);
    components[name] = {
      name,
      template: templateFromRenderExpression(
        renderExpressionFromFunction(fn, filename),
        bindings,
        filename,
      ),
      script: createEmptyScript(),
      style: createEmptyStyleTable(),
    };
  }
  return components;
}

function componentCandidate(
  statement: any,
): { name: string; node: any } | undefined {
  if (statement.type === "FunctionDeclaration" && statement.id?.name) {
    return { name: statement.id.name, node: statement };
  }

  if (statement.type !== "VariableDeclaration") {
    return undefined;
  }

  for (const declarator of statement.declarations) {
    if (declarator.id.type === "Identifier" && declarator.init) {
      return {
        name: declarator.id.name,
        node: unwrapExpression(declarator.init),
      };
    }
  }

  return undefined;
}

function importsFromTemplate(
  template: Node[],
  components: Record<string, Component>,
): Record<string, string> {
  const imports: Record<string, string> = {};
  collectTemplateImports(template, components, imports);
  return imports;
}

function collectTemplateImports(
  nodes: Node[],
  components: Record<string, Component>,
  imports: Record<string, string>,
) {
  for (const node of nodes) {
    switch (node.kind) {
      case "element":
        if (node.value.is_component && components[node.value.tag]) {
          imports[node.value.tag] = node.value.tag;
        }
        collectTemplateImports(node.value.children, components, imports);
        break;
      case "conditional":
        for (const branch of node.value.branches) {
          collectTemplateImports(branch.body, components, imports);
        }
        break;
      case "list":
        collectTemplateImports(node.value.body, components, imports);
        break;
      case "fragment":
        collectTemplateImports(node.value, components, imports);
        break;
    }
  }
}

function extractStyleTable(source: string, body: any[], filename?: string) {
  for (const statement of body) {
    if (
      statement.type !== "ExportNamedDeclaration" ||
      statement.declaration?.type !== "VariableDeclaration"
    ) {
      continue;
    }

    for (const declarator of statement.declaration.declarations) {
      if (
        declarator.id.type !== "Identifier" ||
        !["style", "styles"].includes(declarator.id.name) ||
        !declarator.init
      ) {
        continue;
      }

      const init = unwrapExpression(declarator.init);
      if (init.type === "StringLiteral") {
        return parseStyleTable(init.value);
      }
      if (init.type === "TemplateLiteral" && init.expressions.length === 0) {
        return parseStyleTable(
          init.quasis.map((quasi: any) => quasi.value.cooked).join(""),
        );
      }
      throw new Error(`${filename ?? "TSX"}: styles 必须是静态字符串`);
    }
  }

  return createEmptyStyleTable();
}

function findDefaultPageFunction(body: any[], filename?: string): PageFunction {
  for (const statement of body) {
    if (statement.type !== "ExportDefaultDeclaration") {
      continue;
    }

    const declaration = unwrapExpression(statement.declaration);
    if (isFunctionLike(declaration)) {
      return {
        node: declaration,
        renderExpression: renderExpressionFromFunction(declaration, filename),
      };
    }

    if (declaration.type === "Identifier") {
      const binding = findTopLevelBinding(body, declaration.name);
      if (binding && isFunctionLike(binding)) {
        return {
          node: binding,
          renderExpression: renderExpressionFromFunction(binding, filename),
        };
      }
    }

    throw new Error(
      `${filename ?? "TSX"}: default export 必须是返回 JSX 的函数`,
    );
  }

  throw new Error(`${filename ?? "TSX"}: 未找到 default export`);
}

function extractScript(
  source: string,
  moduleBody: any[],
  pageFunction: any,
  filename?: string,
): Script {
  const script = createEmptyScript();
  const body = unwrapExpression(pageFunction.body);
  if (body.type !== "BlockStatement") {
    return script;
  }

  const context = createScriptContext(source, filename);

  for (const statement of body.body) {
    collectUseStateDeclaration(script, context, statement);
  }

  for (const statement of body.body) {
    collectMethod(script, context, statement);
  }

  collectPageLifecycle(script, context, moduleBody);

  return script;
}

function createScriptContext(source: string, filename?: string): ScriptContext {
  return {
    source,
    filename,
    stateVars: new Set(),
    stateSetters: new Map(),
  };
}

function collectUseStateDeclaration(
  script: Script,
  context: ScriptContext,
  statement: any,
) {
  if (statement.type !== "VariableDeclaration") {
    return;
  }

  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "ArrayPattern" ||
      declarator.id.elements.length < 2 ||
      !declarator.init ||
      !isUseStateCall(declarator.init)
    ) {
      continue;
    }

    const stateId = declarator.id.elements[0];
    const setterId = declarator.id.elements[1];
    if (stateId?.type !== "Identifier" || setterId?.type !== "Identifier") {
      throw new Error(
        `${context.filename ?? "TSX"}: useState 解构必须形如 const [value, setValue] = useState(...)`,
      );
    }

    const initial = declarator.init.arguments[0];
    script.private_data[stateId.name] = initial
      ? staticJsonValue(initial, context.filename)
      : null;
    context.stateVars.add(stateId.name);
    context.stateSetters.set(setterId.name, stateId.name);
  }
}

function collectMethod(script: Script, context: ScriptContext, statement: any) {
  if (statement.type === "FunctionDeclaration") {
    if (!statement.id?.name) {
      return;
    }
    script.methods[statement.id.name] = lowerFunctionLike(
      context,
      statement,
      statement.id.name,
    );
    return;
  }

  if (statement.type !== "VariableDeclaration") {
    return;
  }

  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      !isFunctionLike(unwrapExpression(declarator.init))
    ) {
      continue;
    }

    script.methods[declarator.id.name] = lowerFunctionLike(
      context,
      unwrapExpression(declarator.init),
      declarator.id.name,
    );
  }
}

function collectPageLifecycle(
  script: Script,
  context: ScriptContext,
  moduleBody: any[],
) {
  for (const statement of moduleBody) {
    if (
      statement.type !== "ExportNamedDeclaration" ||
      statement.declaration?.type !== "VariableDeclaration"
    ) {
      continue;
    }

    for (const declarator of statement.declaration.declarations) {
      if (
        declarator.id.type !== "Identifier" ||
        declarator.id.name !== "lifecycle" ||
        !declarator.init
      ) {
        continue;
      }

      const init = unwrapExpression(declarator.init);
      if (init.type !== "ObjectExpression") {
        throw new Error(
          `${context.filename ?? "TSX"}: lifecycle 必须是对象字面量`,
        );
      }
      collectLifecycleObject(script.lifecycle, context, init, "function");
    }
  }
}

function collectLifecycleObject(
  out: Record<string, string>,
  context: ScriptContext,
  object: any,
  mode: "function" | "body",
) {
  for (const property of object.properties) {
    if (property.type === "SpreadElement") {
      throw new Error(
        `${context.filename ?? "TSX"}: lifecycle 暂不支持展开语法`,
      );
    }

    const key = lifecycleKey(property.key, context.filename);
    const fn = lifecycleFunctionNode(property, context.filename);
    out[key] =
      mode === "function"
        ? lowerFunctionLike(context, fn, key)
        : lowerFunctionBodySource(context, fn.body);
  }
}

function lifecycleFunctionNode(property: any, filename?: string): any {
  if (property.type === "ObjectMethod") {
    return property;
  }
  if (property.type !== "ObjectProperty") {
    throw new Error(`${filename ?? "TSX"}: lifecycle 仅支持方法或函数属性`);
  }

  const value = unwrapExpression(property.value);
  if (!isFunctionLike(value)) {
    throw new Error(`${filename ?? "TSX"}: lifecycle 属性值必须是函数`);
  }
  return value;
}

function lifecycleKey(node: any, filename?: string): string {
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "StringLiteral":
      return node.value;
    default:
      throw new Error(
        `${filename ?? "TSX"}: lifecycle key 必须是标识符或字符串`,
      );
  }
}

function isUseStateCall(node: any): boolean {
  const expression = unwrapExpression(node);
  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === "useState"
  );
}

function lowerFunctionLike(
  context: ScriptContext,
  node: any,
  methodName: string,
): string {
  const params = node.params
    .map((param: any) => lowerParameter(context, param))
    .join(", ");
  const body = lowerFunctionBody(context, node.body);
  return `function ${methodName}(${params}) ${body}`;
}

function lowerParameter(context: ScriptContext, param: any): string {
  const node = unwrapExpression(param);
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "RestElement":
      return `...${lowerParameter(context, node.argument)}`;
    case "AssignmentPattern":
      return `${lowerParameter(context, node.left)} = ${sourceForNode(context.source, node.right)}`;
    default:
      throw new Error(`不支持的方法参数形态：${node.type}`);
  }
}

function lowerFunctionBody(context: ScriptContext, body: any): string {
  const block = unwrapExpression(body);
  if (block.type !== "BlockStatement") {
    return `{ return ${lowerExpression(context, block)}; }`;
  }

  const statements = block.body
    .map((statement: any) => lowerStatement(context, statement))
    .filter(Boolean);
  if (statements.length === 0) {
    return "{}";
  }
  return `{\n${statements.map((statement: string) => `  ${statement}`).join("\n")}\n}`;
}

function lowerFunctionBodySource(context: ScriptContext, body: any): string {
  const block = unwrapExpression(body);
  if (block.type !== "BlockStatement") {
    return `return ${lowerExpression(context, block)};`;
  }

  return block.body
    .map((statement: any) => lowerStatement(context, statement))
    .filter(Boolean)
    .join("\n");
}

function lowerStatement(context: ScriptContext, statement: any): string {
  switch (statement.type) {
    case "ExpressionStatement":
      return `${lowerExpression(context, statement.expression)};`;
    case "ReturnStatement":
      return statement.argument
        ? `return ${lowerExpression(context, statement.argument)};`
        : "return;";
    case "VariableDeclaration":
      return lowerVariableDeclaration(context, statement);
    default:
      return sourceForNode(context.source, statement);
  }
}

function lowerVariableDeclaration(
  context: ScriptContext,
  statement: any,
): string {
  const declarations = statement.declarations.map((declarator: any) => {
    const id = sourceForNode(context.source, declarator.id);
    if (!declarator.init) {
      return id;
    }
    return `${id} = ${lowerExpression(context, declarator.init)}`;
  });
  return `${statement.kind} ${declarations.join(", ")};`;
}

function lowerExpression(
  context: ScriptContext,
  expression: any,
  aliases: Map<string, string> = new Map(),
): string {
  const node = unwrapExpression(expression);

  switch (node.type) {
    case "Identifier": {
      const alias = aliases.get(node.name);
      if (alias) {
        return `this.${alias}`;
      }
      if (context.stateVars.has(node.name)) {
        return `this.${node.name}`;
      }
      return node.name;
    }
    case "StringLiteral":
      return JSON.stringify(node.value);
    case "NumericLiteral":
      return String(node.value);
    case "BooleanLiteral":
      return String(node.value);
    case "NullLiteral":
      return "null";
    case "BinaryExpression":
    case "LogicalExpression":
      return `${lowerExpression(context, node.left, aliases)} ${node.operator} ${lowerExpression(context, node.right, aliases)}`;
    case "UnaryExpression":
      return `${node.operator}${lowerExpression(context, node.argument, aliases)}`;
    case "AssignmentExpression":
      return `${lowerExpression(context, node.left, aliases)} ${node.operator} ${lowerExpression(context, node.right, aliases)}`;
    case "UpdateExpression": {
      const argument = lowerExpression(context, node.argument, aliases);
      return node.prefix
        ? `${node.operator}${argument}`
        : `${argument}${node.operator}`;
    }
    case "MemberExpression":
      return lowerMemberExpression(context, node, aliases);
    case "CallExpression": {
      const setterTarget =
        node.callee.type === "Identifier"
          ? context.stateSetters.get(node.callee.name)
          : undefined;
      if (setterTarget) {
        return lowerStateSetterCall(context, setterTarget, node);
      }

      const callee = lowerExpression(context, node.callee, aliases);
      const args = node.arguments
        .map((arg: any) => {
          if (arg.type === "SpreadElement") {
            return `...${lowerExpression(context, arg.argument, aliases)}`;
          }
          return lowerExpression(context, arg, aliases);
        })
        .join(", ");
      return `${callee}(${args})`;
    }
    case "ArrowFunctionExpression":
      return sourceForNode(context.source, node);
    default:
      return sourceForNode(context.source, node);
  }
}

function lowerMemberExpression(
  context: ScriptContext,
  node: any,
  aliases: Map<string, string>,
): string {
  const object = lowerExpression(context, node.object, aliases);
  if (node.computed) {
    return `${object}[${lowerExpression(context, node.property, aliases)}]`;
  }
  return `${object}.${sourceForNode(context.source, node.property)}`;
}

function lowerStateSetterCall(
  context: ScriptContext,
  stateName: string,
  node: any,
): string {
  const next = node.arguments[0];
  if (!next) {
    return `this.${stateName} = null`;
  }

  const expression = unwrapExpression(next);
  if (expression.type === "ArrowFunctionExpression") {
    const aliases = new Map<string, string>();
    const firstParam = expression.params[0];
    if (firstParam?.type === "Identifier") {
      aliases.set(firstParam.name, stateName);
    }
    if (expression.body.type === "BlockStatement") {
      throw new Error(
        `${context.filename ?? "TSX"}: setState updater 暂不支持 block body`,
      );
    }
    return `this.${stateName} = ${lowerExpression(context, expression.body, aliases)}`;
  }

  return `this.${stateName} = ${lowerExpression(context, expression)}`;
}

function findTopLevelBinding(body: any[], name: string): any | undefined {
  for (const statement of body) {
    if (
      statement.type === "FunctionDeclaration" &&
      statement.id?.name === name
    ) {
      return statement;
    }

    if (statement.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of statement.declarations) {
      if (declarator.id.type === "Identifier" && declarator.id.name === name) {
        return declarator.init ? unwrapExpression(declarator.init) : undefined;
      }
    }
  }

  return undefined;
}

function renderExpressionFromFunction(node: any, filename?: string): any {
  const body = unwrapExpression(node.body);
  if (isJsxNode(body)) {
    return body;
  }

  if (body.type !== "BlockStatement") {
    throw new Error(`${filename ?? "TSX"}: 页面函数必须返回 JSX`);
  }

  for (const statement of body.body) {
    if (statement.type !== "ReturnStatement") {
      continue;
    }
    if (!statement.argument) {
      throw new Error(`${filename ?? "TSX"}: 页面函数返回值不能为空`);
    }
    return unwrapExpression(statement.argument);
  }

  throw new Error(`${filename ?? "TSX"}: 页面函数缺少 return 语句`);
}

function templateFromRenderExpression(
  expression: any,
  bindings: Map<string, string>,
  filename?: string,
): Node[] {
  const node = nodeFromJsx(expression, bindings, filename);
  if (node.kind === "fragment") {
    return node.value;
  }
  return [node];
}

function nodeFromJsx(
  node: any,
  bindings: Map<string, string>,
  filename?: string,
): Node {
  switch (node.type) {
    case "JSXElement":
      return {
        kind: "element",
        value: elementFromJsx(node, bindings, filename),
      };
    case "JSXFragment":
      return {
        kind: "fragment",
        value: childrenFromJsx(node.children, bindings, filename),
      };
    default:
      throw new Error(`${filename ?? "TSX"}: 不支持的 JSX 根节点 ${node.type}`);
  }
}

function elementFromJsx(
  node: any,
  bindings: Map<string, string>,
  filename?: string,
): Element {
  const name = jsxElementName(node.openingElement.name, filename);
  const tag = bindings.get(name) ?? name;
  const isComponent = !bindings.has(name) && /^[A-Z]/.test(name);
  const attrs: Record<string, Attr> = {};
  const events: Record<string, Binding> = {};

  for (const attr of node.openingElement.attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      throw new Error(`${filename ?? "TSX"}: 暂不支持 JSX spread 属性`);
    }

    const attrName = jsxAttributeName(attr.name, filename);
    if (attrName === "key") {
      continue;
    }
    if (isEventAttribute(attrName)) {
      events[eventNameFromAttribute(attrName)] = bindingFromAttribute(
        attr.value,
        true,
        filename,
      );
      continue;
    }

    attrs[normalizeAttributeName(attrName)] = attrFromValue(
      attr.value,
      filename,
    );
  }

  return {
    tag: isComponent ? kebabCase(tag) : tag,
    is_component: isComponent,
    attrs,
    events,
    children: childrenFromJsx(node.children, bindings, filename),
  };
}

function childrenFromJsx(
  children: any[],
  bindings: Map<string, string>,
  filename?: string,
): Node[] {
  const out: Node[] = [];

  for (const child of children) {
    if (child.type === "JSXText") {
      const text = normalizeJsxText(child.value);
      if (text.length > 0) {
        out.push({ kind: "text", value: text });
      }
      continue;
    }

    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      const node = nodeFromJsx(child, bindings, filename);
      if (node.kind === "fragment") {
        out.push(...node.value);
      } else {
        out.push(node);
      }
      continue;
    }

    if (child.type === "JSXExpressionContainer") {
      const expression = unwrapExpression(child.expression);
      if (expression.type === "JSXEmptyExpression") {
        continue;
      }
      out.push(nodeFromExpression(expression, bindings, filename));
      continue;
    }

    throw new Error(`${filename ?? "TSX"}: 不支持的 JSX 子节点 ${child.type}`);
  }

  return out;
}

function nodeFromExpression(
  expression: any,
  bindings: Map<string, string>,
  filename?: string,
): Node {
  const conditional = conditionalFromExpression(expression, bindings, filename);
  if (conditional) {
    return conditional;
  }

  const list = listFromExpression(expression, bindings, filename);
  if (list) {
    return list;
  }

  const value = literalValue(expression);
  if (value !== undefined) {
    return { kind: "text", value: String(value) };
  }

  return {
    kind: "expression",
    value: bindingFromExpression(expression, false, filename),
  };
}

function conditionalFromExpression(
  expression: any,
  bindings: Map<string, string>,
  filename?: string,
): Node | undefined {
  const node = unwrapExpression(expression);
  if (node.type === "ConditionalExpression") {
    return {
      kind: "conditional",
      value: {
        branches: [
          {
            guard: bindingFromExpression(node.test, false, filename),
            body: nodesFromBranchExpression(
              node.consequent,
              bindings,
              filename,
            ),
          },
          ...alternateBranches(node.alternate, bindings, filename),
        ],
      },
    };
  }

  if (node.type === "LogicalExpression" && node.operator === "&&") {
    return {
      kind: "conditional",
      value: {
        branches: [
          {
            guard: bindingFromExpression(node.left, false, filename),
            body: nodesFromBranchExpression(node.right, bindings, filename),
          },
        ],
      },
    };
  }

  return undefined;
}

function alternateBranches(
  expression: any,
  bindings: Map<string, string>,
  filename?: string,
): Array<{ guard: Binding | null; body: Node[] }> {
  const node = unwrapExpression(expression);
  if (node.type === "ConditionalExpression") {
    return [
      {
        guard: bindingFromExpression(node.test, false, filename),
        body: nodesFromBranchExpression(node.consequent, bindings, filename),
      },
      ...alternateBranches(node.alternate, bindings, filename),
    ];
  }

  return [
    {
      guard: null,
      body: nodesFromBranchExpression(node, bindings, filename),
    },
  ];
}

function nodesFromBranchExpression(
  expression: any,
  bindings: Map<string, string>,
  filename?: string,
): Node[] {
  const node = unwrapExpression(expression);
  if (node.type === "NullLiteral") {
    return [];
  }
  if (node.type === "BooleanLiteral" && node.value === false) {
    return [];
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    const result = nodeFromJsx(node, bindings, filename);
    return result.kind === "fragment" ? result.value : [result];
  }
  return [nodeFromExpression(node, bindings, filename)];
}

function listFromExpression(
  expression: any,
  bindings: Map<string, string>,
  filename?: string,
): Node | undefined {
  const node = unwrapExpression(expression);
  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.property.type !== "Identifier" ||
    node.callee.property.name !== "map"
  ) {
    return undefined;
  }

  const callback = unwrapExpression(node.arguments[0]);
  if (!callback || !isFunctionLike(callback)) {
    throw new Error(`${filename ?? "TSX"}: list render 的 map 参数必须是函数`);
  }

  const itemParam = callback.params[0];
  if (itemParam?.type !== "Identifier") {
    throw new Error(`${filename ?? "TSX"}: list render 必须声明 item 参数`);
  }

  const indexParam = callback.params[1];
  if (indexParam && indexParam.type !== "Identifier") {
    throw new Error(
      `${filename ?? "TSX"}: list render 的 index 参数必须是标识符`,
    );
  }

  const bodyExpression = renderExpressionFromMapCallback(callback, filename);
  return {
    kind: "list",
    value: {
      source: bindingFromExpression(node.callee.object, false, filename),
      item_var: itemParam.name,
      index_var: indexParam?.name,
      key: keyBindingFromJsx(bodyExpression, filename),
      body: nodesFromBranchExpression(bodyExpression, bindings, filename),
    },
  };
}

function renderExpressionFromMapCallback(
  callback: any,
  filename?: string,
): any {
  const body = unwrapExpression(callback.body);
  if (body.type !== "BlockStatement") {
    return body;
  }

  for (const statement of body.body) {
    if (statement.type !== "ReturnStatement") {
      continue;
    }
    if (!statement.argument) {
      throw new Error(`${filename ?? "TSX"}: list render 的 return 不能为空`);
    }
    return unwrapExpression(statement.argument);
  }

  throw new Error(`${filename ?? "TSX"}: list render 函数缺少 return 语句`);
}

function keyBindingFromJsx(
  expression: any,
  filename?: string,
): Binding | undefined {
  const node = unwrapExpression(expression);
  if (node.type !== "JSXElement") {
    return undefined;
  }

  const keyAttr = node.openingElement.attributes.find(
    (attr: any) =>
      attr.type === "JSXAttribute" &&
      attr.name.type === "JSXIdentifier" &&
      attr.name.name === "key",
  );
  if (!keyAttr) {
    return undefined;
  }
  return bindingFromAttribute(keyAttr.value, false, filename);
}

function attrFromValue(value: any, filename?: string): Attr {
  if (!value) {
    return { kind: "static", value: true };
  }

  if (value.type === "StringLiteral") {
    return { kind: "static", value: value.value };
  }

  if (value.type !== "JSXExpressionContainer") {
    throw new Error(`${filename ?? "TSX"}: 不支持的属性值 ${value.type}`);
  }

  const expression = unwrapExpression(value.expression);
  const literal = literalValue(expression);
  if (literal !== undefined) {
    return { kind: "static", value: literal };
  }

  return {
    kind: "dynamic",
    value: bindingFromExpression(expression, false, filename),
  };
}

function bindingFromAttribute(
  value: any,
  callable: boolean,
  filename?: string,
): Binding {
  if (!value || value.type !== "JSXExpressionContainer") {
    throw new Error(`${filename ?? "TSX"}: 事件属性必须使用表达式绑定`);
  }
  return bindingFromExpression(
    unwrapExpression(value.expression),
    callable,
    filename,
  );
}

function bindingFromExpression(
  expression: any,
  callable: boolean,
  filename?: string,
): Binding {
  const path = bindingPath(expression);
  if (!path) {
    throw new Error(`${filename ?? "TSX"}: 当前阶段仅支持标识符或成员访问绑定`);
  }
  return { path, is_callable: callable };
}

function bindingPath(expression: any): string | undefined {
  const node = unwrapExpression(expression);
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "MemberExpression": {
      const object = bindingPath(node.object);
      if (!object || node.computed) {
        return undefined;
      }
      const property =
        node.property.type === "Identifier" ? node.property.name : undefined;
      return property ? `${object}.${property}` : undefined;
    }
    case "OptionalMemberExpression": {
      const object = bindingPath(node.object);
      if (!object || node.computed) {
        return undefined;
      }
      const property =
        node.property.type === "Identifier" ? node.property.name : undefined;
      return property ? `${object}.${property}` : undefined;
    }
    default:
      return undefined;
  }
}

function literalValue(expression: any): JsonValue | undefined {
  switch (expression.type) {
    case "StringLiteral":
      return expression.value;
    case "NumericLiteral":
      return expression.value;
    case "BooleanLiteral":
      return expression.value;
    case "NullLiteral":
      return null;
    default:
      return undefined;
  }
}

function staticJsonValue(expression: any, filename?: string): JsonValue {
  const node = unwrapExpression(expression);
  const literal = literalValue(node);
  if (literal !== undefined) {
    return literal;
  }

  if (node.type === "ArrayExpression") {
    return node.elements.map((element: any) => {
      if (!element) {
        return null;
      }
      if (element.type === "SpreadElement") {
        throw new Error(`${filename ?? "TSX"}: useState 初值暂不支持数组展开`);
      }
      return staticJsonValue(element, filename);
    });
  }

  if (node.type === "ObjectExpression") {
    const out: Record<string, JsonValue> = {};
    for (const property of node.properties) {
      if (property.type === "SpreadElement") {
        throw new Error(`${filename ?? "TSX"}: useState 初值暂不支持对象展开`);
      }
      if (property.type !== "ObjectProperty") {
        throw new Error(`${filename ?? "TSX"}: useState 初值暂不支持对象方法`);
      }
      out[objectPropertyKey(property.key, filename)] = staticJsonValue(
        property.value,
        filename,
      );
    }
    return out;
  }

  throw new Error(`${filename ?? "TSX"}: useState 初值必须是静态 JSON 字面量`);
}

function objectPropertyKey(node: any, filename?: string): string {
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "StringLiteral":
    case "NumericLiteral":
      return String(node.value);
    default:
      throw new Error(`${filename ?? "TSX"}: 不支持的对象键 ${node.type}`);
  }
}

function sourceForNode(source: string, node: any): string {
  if (typeof node.start !== "number" || typeof node.end !== "number") {
    throw new Error("AST 节点缺少源码区间");
  }
  return source.slice(node.start, node.end);
}

function jsxElementName(node: any, filename?: string): string {
  switch (node.type) {
    case "JSXIdentifier":
      return node.name;
    case "JSXMemberExpression":
      throw new Error(`${filename ?? "TSX"}: 暂不支持命名空间组件`);
    case "JSXNamespacedName":
      throw new Error(`${filename ?? "TSX"}: 暂不支持 JSX namespace 标签`);
    default:
      throw new Error(`${filename ?? "TSX"}: 不支持的 JSX 标签 ${node.type}`);
  }
}

function jsxAttributeName(node: any, filename?: string): string {
  switch (node.type) {
    case "JSXIdentifier":
      return node.name;
    case "JSXNamespacedName":
      throw new Error(`${filename ?? "TSX"}: 暂不支持 JSX namespace 属性`);
    default:
      throw new Error(`${filename ?? "TSX"}: 不支持的 JSX 属性 ${node.type}`);
  }
}

function normalizeJsxText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAttributeName(name: string): string {
  return name === "className" ? "class" : name;
}

function isEventAttribute(name: string): boolean {
  return /^on[A-Z]/.test(name);
}

function eventNameFromAttribute(name: string): string {
  return name.slice(2).toLowerCase();
}

function isFunctionLike(node: any): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ObjectMethod"
  );
}

function isPascalCase(value: string): boolean {
  return /^[A-Z]/.test(value);
}

function isJsxNode(node: any): boolean {
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

function unwrapExpression(node: any): any {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "ParenthesizedExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}
