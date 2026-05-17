/// 模板提取层。
///
/// 将 JSX AST 降维为 IR `Node[]`，包括元素、文本、表达式、条件渲染、列表渲染、
/// 插槽映射等。

import type { Component, Element, Node, StyleSlot, JsonValue } from "../ir";
import { createEmptyStyleTable } from "../ir";
import { parseStyleTable } from "../style";
import type {
  TemplateContext,
  ComponentImport,
  ImportResolver,
  StyleImportLoader,
} from "./types";
import { parse } from "@babel/parser";
import {
  unwrapExpression,
  isFunctionLike,
  isJsxNode,
  isEmptyRenderExpression,
  isFragmentElement,
  findTopLevelBinding,
  renderExpressionFromFunction,
  sourceForNode,
  jsxElementName,
  jsxAttributeName,
  normalizeJsxText,
  normalizeAttributeName,
  isEventAttribute,
  eventNameFromAttribute,
  isPascalCase,
  kebabCase,
  kebabToCamel,
  objectPropertyKey,
  literalValue,
  staticAttrLiteral,
  staticJsonValue,
  bindingPath,
  referencesMemoVar,
  BUILTIN_COMPONENTS,
} from "./ast";
import {
  lowerTemplateExpression,
  lowerTemplateEventHandler,
} from "./lower";

export function templateFromRenderExpression(
  expression: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Node[] {
  const expressionNode = unwrapExpression(expression);
  if (isEmptyRenderExpression(expressionNode)) {
    return [];
  }
  if (!isJsxNode(expressionNode)) {
    const node = nodeFromExpression(expressionNode, bindings, context);
    return node.kind === "fragment" ? node.value : [node];
  }
  const node = nodeFromJsx(expressionNode, bindings, context);
  if (node.kind === "fragment") {
    return node.value;
  }
  return [node];
}

function nodeFromJsx(
  node: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Node {
  switch (node.type) {
    case "JSXElement":
      if (isFragmentElement(node)) {
        return {
          kind: "fragment",
          value: childrenFromJsx(node.children, bindings, context),
        };
      }
      return {
        kind: "element",
        value: elementFromJsx(node, bindings, context),
      };
    case "JSXFragment":
      return {
        kind: "fragment",
        value: childrenFromJsx(node.children, bindings, context),
      };
    default:
      throw new Error(
        `${context.filename ?? "TSX"}: 不支持的 JSX 根节点 ${node.type}`,
      );
  }
}

function elementFromJsx(
  node: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Element {
  const openingName = node.openingElement.name;
  if (openingName.type === "JSXMemberExpression") {
    return elementFromMemberExpressionJsx(node, openingName, bindings, context);
  }

  const name = jsxElementName(node.openingElement.name, context.filename);
  const tag = bindings.get(name) ?? name;
  const isDynamicTag = !bindings.has(name) && /^[A-Z]/.test(name) && context.localVars.has(name);
  const isComponent = !bindings.has(name) && /^[A-Z]/.test(name) && !isDynamicTag;
  const attrs: Record<string, any> = {};
  const events: Record<string, any> = {};
  const spreads: any[] = [];

  for (const attr of node.openingElement.attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      spreads.push(bindingFromExpression(unwrapExpression(attr.argument), false, context));
      continue;
    }

    const attrName = jsxAttributeName(attr.name, context.filename);
    if (attrName === "key") {
      continue;
    }
    if (isEventAttribute(attrName)) {
      events[eventNameFromAttribute(attrName)] = bindingFromAttribute(
        attr.value,
        true,
        context,
      );
      continue;
    }

    const normalizedName = normalizeAttributeName(attrName, isComponent);
    attrs[normalizedName] = attrFromValue(normalizedName, attr.value, context);
  }

  if (isDynamicTag) {
    return {
      tag: "div",
      tag_binding: bindingFromExpression(
        { type: "Identifier", name },
        false,
        context,
      ),
      is_component: false,
      attrs,
      events,
      children: childrenFromJsx(node.children, bindings, context),
      spreads: spreads.length > 0 ? spreads : undefined,
    };
  }

  return {
    tag: isComponent ? kebabCase(tag) : tag,
    is_component: isComponent,
    attrs,
    events,
    children: childrenFromJsx(node.children, bindings, context),
    spreads: spreads.length > 0 ? spreads : undefined,
  };
}

function elementFromMemberExpressionJsx(
  node: any,
  openingName: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Element {
  if (
    openingName.object.type !== "JSXIdentifier" ||
    openingName.property.type !== "JSXIdentifier"
  ) {
    throw new Error(
      `${context.filename ?? "TSX"}: 暂不支持嵌套成员表达式 JSX 标签`,
    );
  }
  const objectName = openingName.object.name;
  const propertyName = openingName.property.name;

  if (
    propertyName === "Provider" &&
    context.scriptContext.contextVars.has(objectName)
  ) {
    const ctxVar = context.scriptContext.contextVars.get(objectName)!;
    const attrs: Record<string, any> = {};
    const events: Record<string, any> = {};
    const spreads: any[] = [];
    let hasValue = false;

    for (const attr of node.openingElement.attributes) {
      if (attr.type === "JSXSpreadAttribute") {
        spreads.push(bindingFromExpression(unwrapExpression(attr.argument), false, context));
        continue;
      }
      const attrName = jsxAttributeName(attr.name, context.filename);
      if (attrName === "key") continue;
      if (attrName === "value") {
        attrs["value"] = attrFromValue("value", attr.value, context);
        hasValue = true;
        continue;
      }
      if (isEventAttribute(attrName)) {
        events[eventNameFromAttribute(attrName)] = bindingFromAttribute(
          attr.value,
          true,
          context,
        );
        continue;
      }
      attrs[normalizeAttributeName(attrName, false)] = attrFromValue(
        normalizeAttributeName(attrName, false),
        attr.value,
        context,
      );
    }

    if (!hasValue) {
      throw new Error(
        `${context.filename ?? "TSX"}: Context.Provider 必须提供 value 属性`,
      );
    }

    return {
      tag: `__af_ctxp_${ctxVar.id}`,
      is_component: true,
      attrs,
      events,
      children: childrenFromJsx(node.children, bindings, context),
      spreads: spreads.length > 0 ? spreads : undefined,
    };
  }

  throw new Error(
    `${context.filename ?? "TSX"}: 不支持的 JSX 成员表达式标签 ${objectName}.${propertyName}`,
  );
}

function childrenFromJsx(
  children: any[],
  bindings: Map<string, string>,
  context: TemplateContext,
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
      const node = nodeFromJsx(child, bindings, context);
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
      out.push(nodeFromExpression(expression, bindings, context));
      continue;
    }

    throw new Error(
      `${context.filename ?? "TSX"}: 不支持的 JSX 子节点 ${child.type}`,
    );
  }

  return out;
}

function nodeFromExpression(
  expression: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Node {
  const list = listFromExpression(expression, bindings, context);
  if (list) {
    return list;
  }

  const conditional = conditionalFromExpression(expression, bindings, context);
  if (conditional) {
    return conditional;
  }

  if (isSlotExpression(expression)) {
    return {
      kind: "element",
      value: {
        tag: "slot",
        is_component: false,
        attrs: {},
        events: {},
        children: [],
      },
    };
  }

  const value = literalValue(expression);
  if (value !== undefined) {
    return { kind: "text", value: String(value) };
  }

  return {
    kind: "expression",
    value: bindingFromExpression(expression, false, context),
  };
}

/// 判断表达式是否代表 React 的 `children` 插槽。
///
/// Vela 组件通过 `<slot>` 元素消费外部传入的子内容，而非 `props.children`。
/// 在 TSX → IR 阶段直接把 `children` / `props.children` 替换为 `slot` 元素，
/// 确保 Vela 后端生成 `aiot.__ce__("slot", ...)` 而非错误的 `_vm_.children`
/// 文本绑定。
function isSlotExpression(node: any): boolean {
  const n = unwrapExpression(node);
  if (n.type === "Identifier" && n.name === "children") {
    return true;
  }
  if (
    n.type === "MemberExpression" &&
    !n.computed &&
    n.object.type === "Identifier" &&
    n.object.name === "props" &&
    n.property.type === "Identifier" &&
    n.property.name === "children"
  ) {
    return true;
  }
  return false;
}

function conditionalFromExpression(
  expression: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Node | undefined {
  const node = unwrapExpression(expression);
  if (node.type === "ConditionalExpression") {
    if (
      !isControlFlowBranch(node.consequent) &&
      !isControlFlowBranch(node.alternate)
    ) {
      return undefined;
    }
    return {
      kind: "conditional",
      value: {
        branches: [
          {
            guard: bindingFromExpression(node.test, false, context),
            body: nodesFromBranchExpression(node.consequent, bindings, context),
          },
          ...alternateBranches(node.alternate, bindings, context),
        ],
      },
    };
  }

  if (node.type === "LogicalExpression" && node.operator === "&&") {
    if (!isControlFlowBranch(node.right)) {
      return undefined;
    }
    return {
      kind: "conditional",
      value: {
        branches: [
          {
            guard: bindingFromExpression(node.left, false, context),
            body: nodesFromBranchExpression(node.right, bindings, context),
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
  context: TemplateContext,
): Array<{ guard: any | null; body: Node[] }> {
  const node = unwrapExpression(expression);
  if (node.type === "ConditionalExpression") {
    return [
      {
        guard: bindingFromExpression(node.test, false, context),
        body: nodesFromBranchExpression(node.consequent, bindings, context),
      },
      ...alternateBranches(node.alternate, bindings, context),
    ];
  }

  return [
    {
      guard: null,
      body: nodesFromBranchExpression(node, bindings, context),
    },
  ];
}

function nodesFromBranchExpression(
  expression: any,
  bindings: Map<string, string>,
  context: TemplateContext,
): Node[] {
  const node = unwrapExpression(expression);
  if (node.type === "NullLiteral") {
    return [];
  }
  if (node.type === "BooleanLiteral" && node.value === false) {
    return [];
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    const result = nodeFromJsx(node, bindings, context);
    return result.kind === "fragment" ? result.value : [result];
  }
  return [nodeFromExpression(node, bindings, context)];
}

function isControlFlowBranch(expression: any): boolean {
  const node = unwrapExpression(expression);
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return true;
  }
  if (node.type === "NullLiteral") {
    return true;
  }
  if (node.type === "BooleanLiteral" && node.value === false) {
    return true;
  }
  if (node.type === "ConditionalExpression") {
    return (
      isControlFlowBranch(node.consequent) ||
      isControlFlowBranch(node.alternate)
    );
  }
  return false;
}

function listFromExpression(
  expression: any,
  bindings: Map<string, string>,
  context: TemplateContext,
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
    throw new Error(
      `${context.filename ?? "TSX"}: list render 的 map 参数必须是函数`,
    );
  }

  const itemParam = callback.params[0];
  if (itemParam?.type !== "Identifier") {
    throw new Error(
      `${context.filename ?? "TSX"}: list render 必须声明 item 参数`,
    );
  }

  const indexParam = callback.params[1];
  if (indexParam && indexParam.type !== "Identifier") {
    throw new Error(
      `${context.filename ?? "TSX"}: list render 的 index 参数必须是标识符`,
    );
  }

  const bodyExpression = renderExpressionFromMapCallback(
    callback,
    context.filename,
  );
  const listContext = withTemplateAliases(context, [
    [itemParam.name, itemParam.name],
    ...(indexParam
      ? ([[indexParam.name, indexParam.name]] as Array<[string, string]>)
      : []),
  ]);
  return {
    kind: "list",
    value: {
      source: bindingFromExpression(node.callee.object, false, context),
      item_var: itemParam.name,
      index_var: indexParam?.name,
      key: keyBindingFromJsx(bodyExpression, listContext),
      body: nodesFromBranchExpression(bodyExpression, bindings, listContext),
    },
  };
}

import { withTemplateAliases } from "./lower";

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
  context: TemplateContext,
): any | undefined {
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
  return bindingFromAttribute(keyAttr.value, false, context);
}

function attrFromValue(
  name: string,
  value: any,
  context: TemplateContext,
): any {
  if (!value) {
    return { kind: "static", value: true };
  }

  if (value.type === "StringLiteral") {
    return { kind: "static", value: value.value };
  }

  if (value.type !== "JSXExpressionContainer") {
    throw new Error(
      `${context.filename ?? "TSX"}: 不支持的属性值 ${value.type}`,
    );
  }

  const expression = unwrapExpression(value.expression);
  const literal = literalValue(expression);
  if (literal !== undefined) {
    return { kind: "static", value: literal };
  }

  const staticObject = staticAttrLiteral(expression);
  if (staticObject !== undefined) {
    return {
      kind: "static",
      value:
        name === "style" ? normalizeStyleLiteral(staticObject) : staticObject,
    };
  }

  if (name === "style") {
    const styleObject = styleObjectAttr(expression, context);
    if (styleObject) {
      return { kind: "style_object", value: styleObject };
    }
  }

  return {
    kind: "dynamic",
    value: bindingFromExpression(expression, false, context),
  };
}

function styleObjectAttr(
  expression: any,
  context: TemplateContext,
): StyleSlot[] | undefined {
  const node = unwrapExpression(expression);
  if (node.type !== "ObjectExpression") return undefined;

  const slots: StyleSlot[] = [];
  for (const property of node.properties) {
    if (property.type !== "ObjectProperty" || property.computed) {
      throw new Error(
        `${context.filename ?? "TSX"}: style 对象暂不支持展开、方法或计算键`,
      );
    }
    const key = kebabToCamel(objectPropertyKey(property.key, context.filename));
    const value = staticAttrLiteral(property.value);
    if (value !== undefined) {
      slots.push({ name: key, value: { kind: "static", value } });
      continue;
    }
    slots.push({
      name: key,
      value: {
        kind: "dynamic",
        value: bindingFromExpression(property.value, false, context),
      },
    });
  }
  return slots;
}

function normalizeStyleLiteral(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [kebabToCamel(key), item]),
  ) as JsonValue;
}

function bindingFromAttribute(
  value: any,
  callable: boolean,
  context: TemplateContext,
): any {
  if (!value || value.type !== "JSXExpressionContainer") {
    throw new Error(`${context.filename ?? "TSX"}: 事件属性必须使用表达式绑定`);
  }
  return bindingFromExpression(
    unwrapExpression(value.expression),
    callable,
    context,
  );
}

function bindingFromExpression(
  expression: any,
  callable: boolean,
  context: TemplateContext,
): any {
  const node = unwrapExpression(expression);
  if (callable && isFunctionLike(node)) {
    return {
      path: sourceForNode(context.source, node),
      expr: lowerTemplateEventHandler(context, node),
      is_callable: true,
    };
  }

  if (referencesMemoVar(node, context.scriptContext.memoVars)) {
    return {
      path: sourceForNode(context.source, node),
      expr: lowerTemplateExpression(context, node),
      is_callable: callable,
    };
  }

  const path = bindingPath(expression);
  if (path) {
    return { path, is_callable: callable };
  }

  return {
    path: sourceForNode(context.source, node),
    expr: lowerTemplateExpression(context, node),
    is_callable: callable,
  };
}

// ===== Component / Page helpers =====

export function collectTemplateImports(
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

export function importsFromTemplate(
  template: Node[],
  components: Record<string, Component>,
): Record<string, string> {
  const imports: Record<string, string> = {};
  collectTemplateImports(template, components, imports);
  return imports;
}

export function extractStyleTable(
  source: string,
  body: any[],
  filename?: string,
  loadStyle?: StyleImportLoader,
) {
  const chunks: string[] = [];
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") continue;
    const specifier = statement.source.value;
    if (typeof specifier !== "string" || !specifier.endsWith(".css")) {
      continue;
    }
    const css = loadStyle?.(specifier, filename);
    if (css === undefined) {
      throw new Error(`${filename ?? "TSX"}: CSS import ${specifier} 无法解析`);
    }
    chunks.push(css);
  }

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
        chunks.push(init.value);
        continue;
      }
      if (init.type === "TemplateLiteral" && init.expressions.length === 0) {
        chunks.push(
          init.quasis.map((quasi: any) => quasi.value.cooked).join(""),
        );
        continue;
      }
      throw new Error(`${filename ?? "TSX"}: styles 必须是静态字符串`);
    }
  }

  if (chunks.length === 0) {
    return createEmptyStyleTable();
  }
  return parseStyleTable(chunks.join("\n"));
}

export function extractLocalComponents(
  source: string,
  body: any[],
  pageFunction: any,
  bindings: Map<string, string>,
  filename?: string,
  resolveImport?: ImportResolver,
  loadModule?: (path: string) => string | undefined,
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
    const scriptExtraction = extractScript(source, body, fn, filename, {
      collectExportedLifecycle: false,
      resolveImport,
      loadModule,
    });
    const script = scriptExtraction.script;
    script.props = extractComponentProps(fn, body, filename);
    components[name] = {
      name,
      template: templateFromRenderExpression(
        renderExpressionFromFunction(fn, filename),
        bindings,
        createTemplateContext(source, filename, scriptExtraction.context),
      ),
      script,
      style: createEmptyStyleTable(),
    };
  }
  return components;
}

import {
  extractScript,
  createScriptContext,
  createTemplateContext,
  collectLifecycleObject,
} from "./script";

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

export function extractComponentProps(
  fn: any,
  moduleBody: any[],
  filename?: string,
): Record<string, any> {
  const first = fn.params?.[0];
  if (!first) return {};
  const node = unwrapExpression(first);
  const typeNode = propTypeNode(node);
  const props = typeNode
    ? propsFromTypeNode(typeNode, moduleBody, filename)
    : {};

  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty") continue;
      if (property.computed) continue;
      const key = objectPropertyKey(property.key, filename);
      if (key === "children") continue;
      const value = unwrapExpression(property.value);
      if (value.type === "AssignmentPattern") {
        const fallback = staticAttrLiteral(value.right);
        if (fallback !== undefined) {
          props[key] = {
            type: props[key]?.type ?? propTypeFromDefault(fallback),
            default: fallback,
          };
        }
      } else if (!props[key]) {
        props[key] = { type: "Object" };
      }
    }
  }

  return props;
}

function findTypeBinding(moduleBody: any[], name: string): any | undefined {
  for (const statement of moduleBody) {
    const node =
      statement.type === "ExportNamedDeclaration" && statement.declaration
        ? statement.declaration
        : statement;
    if (
      (node.type === "TSInterfaceDeclaration" ||
        node.type === "TSTypeAliasDeclaration") &&
      node.id?.name === name
    ) {
      return node;
    }
  }
  return undefined;
}

function propTypeNode(param: any): any | undefined {
  if (param.type === "Identifier" || param.type === "ObjectPattern") {
    return param.typeAnnotation?.typeAnnotation;
  }
  if (param.type === "AssignmentPattern") {
    return propTypeNode(unwrapExpression(param.left));
  }
  return undefined;
}

function propsFromTypeNode(
  typeNode: any,
  moduleBody: any[],
  filename?: string,
): Record<string, any> {
  const node = unwrapExpression(typeNode);
  if (node.type === "TSTypeLiteral") {
    return propsFromTypeLiteral(node, moduleBody, filename);
  }
  if (node.type === "TSTypeReference" && node.typeName.type === "Identifier") {
    const resolved = findTypeBinding(moduleBody, node.typeName.name);
    if (!resolved) return {};
    return propsFromTypeNode(resolved, moduleBody, filename);
  }
  if (node.type === "TSInterfaceDeclaration") {
    return propsFromTypeLiteral(node.body, moduleBody, filename);
  }
  if (node.type === "TSTypeAliasDeclaration") {
    return propsFromTypeNode(node.typeAnnotation, moduleBody, filename);
  }
  return {};
}

function propsFromTypeLiteral(
  node: any,
  moduleBody: any[],
  filename?: string,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const member of node.members ?? node.body ?? []) {
    if (member.type !== "TSPropertySignature") continue;
    const key = objectPropertyKey(member.key, filename);
    if (key === "children") continue;
    const valueType = member.typeAnnotation?.typeAnnotation;
    out[key] = {
      type: valueType
        ? propRuntimeType(valueType, moduleBody, filename)
        : "Object",
    };
  }
  return out;
}

function propRuntimeType(
  typeNode: any,
  moduleBody: any[],
  filename?: string,
): string {
  const node = unwrapExpression(typeNode);
  switch (node.type) {
    case "TSStringKeyword":
      return "String";
    case "TSNumberKeyword":
      return "Number";
    case "TSBooleanKeyword":
      return "Boolean";
    case "TSArrayType":
    case "TSTupleType":
      return "Array";
    case "TSFunctionType":
      return "Function";
    case "TSTypeLiteral":
      return "Object";
    case "TSTypeReference": {
      if (node.typeName.type !== "Identifier") return "Object";
      const name = node.typeName.name;
      if (["Array", "ReadonlyArray"].includes(name)) return "Array";
      if (["Function"].includes(name)) return "Function";
      const resolved = findTypeBinding(moduleBody, name);
      if (!resolved) return "Object";
      return propRuntimeType(resolved, moduleBody, filename);
    }
    case "TSInterfaceDeclaration":
      return "Object";
    case "TSTypeAliasDeclaration":
      return propRuntimeType(node.typeAnnotation, moduleBody, filename);
    case "TSUnionType":
      return propRuntimeTypeFromUnion(node.types, moduleBody, filename);
    default:
      return "Object";
  }
}

function propRuntimeTypeFromUnion(
  types: any[],
  moduleBody: any[],
  filename?: string,
): string {
  const concrete = types.filter(
    (item) =>
      !["TSNullKeyword", "TSUndefinedKeyword", "TSVoidKeyword"].includes(
        unwrapExpression(item).type,
      ),
  );
  const mapped = new Set(
    concrete.map((item) => propRuntimeType(item, moduleBody, filename)),
  );
  return mapped.size === 1 ? [...mapped][0] : "Object";
}

function propTypeFromDefault(value: JsonValue): string {
  if (typeof value === "string") return "String";
  if (typeof value === "number") return "Number";
  if (typeof value === "boolean") return "Boolean";
  if (Array.isArray(value)) return "Array";
  return "Object";
}

export function collectComponentImports(
  body: any[],
  builtinBindings: Map<string, string>,
  localComponentNames: string[],
  usedComponentNames: Set<string>,
): ComponentImport[] {
  const localTagSet = new Set(localComponentNames);
  const out: ComponentImport[] = [];

  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = statement.source.value;
    if (typeof source !== "string") continue;

    for (const specifier of statement.specifiers) {
      const localName: string | undefined =
        specifier.type === "ImportDefaultSpecifier"
          ? specifier.local.name
          : specifier.type === "ImportSpecifier"
            ? specifier.local.name
            : undefined;
      if (!localName || !isPascalCase(localName)) continue;
      if (!usedComponentNames.has(localName)) continue;
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

export function collectUsedJsxComponentNames(nodes: any[]): Set<string> {
  const out = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (node.type === "JSXElement") {
      const name = node.openingElement.name;
      if (name.type === "JSXIdentifier" && isPascalCase(name.name)) {
        out.add(name.name);
      }
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  };

  visit(nodes);
  return out;
}

export function collectAstroForgeImports(body: any[]): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const statement of body) {
    if (
      statement.type !== "ImportDeclaration" ||
      ![
        "@astralsight/astroforge-core",
        "@astralsight/astroforge-core/components",
      ].includes(statement.source.value)
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

export function extractAppFromTsx(
  source: string,
  filename?: string,
): { lifecycle: Record<string, string> } {
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

import { lowerFunctionLike } from "./lower";
import { findDefaultPageFunction } from "./ast";
