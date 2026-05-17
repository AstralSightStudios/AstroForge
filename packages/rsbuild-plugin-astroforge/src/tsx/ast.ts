/// AST 辅助函数与常量。
///
/// 不包含任何 IR 生成逻辑，只负责 AST 节点识别、源码切片、命名转换等
/// 纯函数。

import type { JsonValue } from "../ir";

export const BUILTIN_COMPONENTS = new Map<string, string>([
  ["A", "a"],
  ["Barcode", "barcode"],
  ["Canvas", "canvas"],
  ["Chart", "chart"],
  ["View", "div"],
  ["Div", "div"],
  ["Text", "text"],
  ["Image", "image"],
  ["ImageAnimator", "image-animator"],
  ["Input", "input"],
  ["Label", "label"],
  ["List", "list"],
  ["ListItem", "list-item"],
  ["Marquee", "marquee"],
  ["Media", "media"],
  ["Option", "option"],
  ["Picker", "picker"],
  ["Popup", "popup"],
  ["Progress", "progress"],
  ["Prompt", "prompt"],
  ["QR", "qr"],
  ["Qr", "qr"],
  ["Rating", "rating"],
  ["Refresh", "refresh"],
  ["RefreshFooter", "refresh-footer"],
  ["RefreshHeader", "refresh-header"],
  ["RichText", "richtext"],
  ["Screen", "screen"],
  ["Scroll", "scroll"],
  ["Select", "select"],
  ["Slider", "slider"],
  ["Span", "span"],
  ["Stack", "stack"],
  ["Swiper", "swiper"],
  ["Switch", "switch"],
  ["TabContent", "tab-content"],
  ["TabBar", "tabbar"],
  ["Tabs", "tabs"],
  ["Textarea", "textarea"],
  ["Video", "video"],
]);

export const TEMPLATE_GLOBALS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Infinity",
  "JSON",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "String",
  "app",
  "audio",
  "cipher",
  "console",
  "device",
  "false",
  "file",
  "geolocation",
  "isFinite",
  "isNaN",
  "null",
  "parseFloat",
  "parseInt",
  "prompt",
  "network",
  "record",
  "router",
  "sensor",
  "storage",
  "true",
  "undefined",
  "vibrator",
  "velaBattery",
  "velaBluetoothBLE",
  "velaBrightness",
  "velaConfiguration",
  "velaCrypto",
  "velaDebug",
  "velaEvent",
  "velaExchange",
  "velaFolme",
  "velaInterconnect",
  "velaJumpApp",
  "velaLocale",
  "velaMediaSession",
  "velaMqttMessage",
  "velaProtobuf",
  "velaServiceClient",
  "velaVolume",
  "velaZlib",
  "zip",
]);

export function unwrapExpression(node: any): any {
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

export function isFunctionLike(node: any): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ObjectMethod"
  );
}

export function isPascalCase(value: string): boolean {
  return /^[A-Z]/.test(value);
}

export function isJsxNode(node: any): boolean {
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

export function isEmptyRenderExpression(node: any): boolean {
  const expression = unwrapExpression(node);
  return (
    expression.type === "NullLiteral" ||
    (expression.type === "BooleanLiteral" && expression.value === false)
  );
}

export function isFragmentElement(node: any): boolean {
  if (node.type !== "JSXElement") return false;
  const name = node.openingElement.name;
  if (name.type === "JSXIdentifier") {
    return name.name === "Fragment";
  }
  return (
    name.type === "JSXMemberExpression" &&
    name.object.type === "JSXIdentifier" &&
    name.object.name === "React" &&
    name.property.type === "JSXIdentifier" &&
    name.property.name === "Fragment"
  );
}

export function findTopLevelBinding(body: any[], name: string): any | undefined {
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

export function renderExpressionFromFunction(node: any, filename?: string): any {
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

export function sourceForNode(source: string, node: any): string {
  if (typeof node.start !== "number" || typeof node.end !== "number") {
    throw new Error("AST 节点缺少源码区间");
  }
  return source.slice(node.start, node.end);
}

export function jsxElementName(node: any, filename?: string): string {
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

export function jsxAttributeName(node: any, filename?: string): string {
  switch (node.type) {
    case "JSXIdentifier":
      return node.name;
    case "JSXNamespacedName":
      throw new Error(`${filename ?? "TSX"}: 暂不支持 JSX namespace 属性`);
    default:
      throw new Error(`${filename ?? "TSX"}: 不支持的 JSX 属性 ${node.type}`);
  }
}

export function normalizeJsxText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeAttributeName(name: string, isComponent: boolean): string {
  if (name === "className") {
    return "class";
  }
  if (isComponent) {
    return name;
  }
  return name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

export function isEventAttribute(name: string): boolean {
  return /^on[A-Z]/.test(name);
}

export function eventNameFromAttribute(name: string): string {
  return name.slice(2).toLowerCase();
}

export function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

export function objectPropertyKey(node: any, filename?: string): string {
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

export function literalValue(expression: any): JsonValue | undefined {
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

export function staticJsonValue(expression: any, filename?: string): JsonValue {
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

/// 尝试把表达式整体解析为静态 JSON 字面量。
///
/// 支持的形态：
/// - 基本字面量（与 `literalValue` 一致）；
/// - `[ ... ]` 元素全为静态值（递归）；
/// - `{ ... }` 属性键为标识符 / 字符串字面量、值递归静态；
/// - 一元 `-` 前缀的数值字面量。
///
/// 不支持：含计算键 / spread / 方法 / getter / 动态值的对象数组——返回
/// `undefined`，让上层选择 dynamic binding 或抛错。
export function staticAttrLiteral(expression: any): JsonValue | undefined {
  const node = unwrapExpression(expression);
  const literal = literalValue(node);
  if (literal !== undefined) {
    return literal;
  }

  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    unwrapExpression(node.argument).type === "NumericLiteral"
  ) {
    return -unwrapExpression(node.argument).value;
  }

  if (node.type === "ArrayExpression") {
    const out: JsonValue[] = [];
    for (const element of node.elements) {
      if (!element) {
        out.push(null);
        continue;
      }
      if (element.type === "SpreadElement") return undefined;
      const item = staticAttrLiteral(element);
      if (item === undefined) return undefined;
      out.push(item);
    }
    return out;
  }

  if (node.type === "ObjectExpression") {
    const out: Record<string, JsonValue> = {};
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty") return undefined;
      if (property.computed) return undefined;
      let key: string;
      if (property.key.type === "Identifier") {
        key = property.key.name;
      } else if (
        property.key.type === "StringLiteral" ||
        property.key.type === "NumericLiteral"
      ) {
        key = String(property.key.value);
      } else {
        return undefined;
      }
      const v = staticAttrLiteral(property.value);
      if (v === undefined) return undefined;
      out[key] = v;
    }
    return out;
  }

  return undefined;
}

export function bindingPath(expression: any): string | undefined {
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

export function referencesMemoVar(node: any, memoVars: Map<string, any>): boolean {
  const current = unwrapExpression(node);
  if (current.type === "Identifier" && memoVars.has(current.name)) {
    return true;
  }
  if (!current || typeof current !== "object") {
    return false;
  }
  if (Array.isArray(current)) {
    return current.some((item) => referencesMemoVar(item, memoVars));
  }
  return Object.values(current).some((value) => {
    if (!value || typeof value !== "object") return false;
    return referencesMemoVar(value, memoVars);
  });
}

export function findDefaultPageFunction(body: any[], filename?: string): {
  node: any;
  renderExpression: any;
} {
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

export function locateComponentFunction(
  body: any[],
  exportName: string | undefined,
  filename?: string,
): { localName: string; node: any; renderExpression: any } {
  if (!exportName) {
    const page = findDefaultPageFunction(body, filename);
    return {
      localName: page.node.id?.name ?? defaultExportName(body) ?? "Component",
      node: page.node,
      renderExpression: page.renderExpression,
    };
  }

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
        node: statement.declaration,
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
            node: unwrapExpression(declarator.init),
            renderExpression: renderExpressionFromFunction(
              unwrapExpression(declarator.init),
              filename,
            ),
          };
        }
      }
    }
  }

  for (const statement of body) {
    if (
      statement.type === "ExportNamedDeclaration" &&
      !statement.declaration &&
      statement.specifiers.some((s: any) => s.exported?.name === exportName)
    ) {
      const local = findTopLevelBinding(body, exportName);
      if (local && isFunctionLike(local)) {
        return {
          localName: exportName,
          node: local,
          renderExpression: renderExpressionFromFunction(local, filename),
        };
      }
    }
  }

  throw new Error(
    `${filename ?? "TSX"}: 未找到名为 ${exportName} 的命名导出函数`,
  );
}

export function defaultExportName(body: any[]): string | undefined {
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

/// 收集函数体中声明的所有局部变量名（含参数、顶层 const/let/var）。
///
/// 用于模板层判断 PascalCase JSX 标签是自定义组件还是动态内置标签变量。
export function collectLocalVars(node: any): Set<string> {
  const vars = new Set<string>();
  const addFromPattern = (pattern: any) => {
    if (!pattern) return;
    if (pattern.type === "Identifier") {
      vars.add(pattern.name);
    } else if (pattern.type === "ObjectPattern") {
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          addFromPattern(prop.argument);
        } else {
          addFromPattern(prop.value);
        }
      }
    } else if (pattern.type === "ArrayPattern") {
      for (const element of pattern.elements) {
        addFromPattern(element);
      }
    } else if (pattern.type === "AssignmentPattern") {
      addFromPattern(pattern.left);
    }
  };

  const params = node.params ?? [];
  for (const param of params) {
    addFromPattern(param);
  }

  const body = unwrapExpression(node.body);
  if (body.type !== "BlockStatement") return vars;

  for (const statement of body.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declarator of statement.declarations) {
        addFromPattern(declarator.id);
      }
    }
  }

  return vars;
}
