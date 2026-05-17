/// 代码打印（lower）层。
///
/// 将 Babel AST 节点降维为可嵌入 Vela script / template 的 JS 字符串。
/// 所有表达式、语句、函数体的打印逻辑集中在此。

import type { ScriptContext, TemplateContext } from "./types";
import {
  unwrapExpression,
  isFunctionLike,
  sourceForNode,
  objectPropertyKey,
  TEMPLATE_GLOBALS,
} from "./ast";

export function lowerFunctionLike(
  context: ScriptContext,
  node: any,
  methodName: string,
): string {
  const asyncPrefix = node.async ? "async " : "";
  const params = node.params
    .map((param: any) => lowerParameter(context, param))
    .join(", ");
  const body = lowerFunctionBody(context, node.body);
  return `${asyncPrefix}function ${methodName}(${params}) ${body}`;
}

function lowerParameter(context: ScriptContext, param: any): string {
  const node = unwrapExpression(param);
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "RestElement":
      return `...${lowerParameter(context, node.argument)}`;
    case "AssignmentPattern":
      return `${lowerParameter(context, node.left)} = ${lowerExpression(context, node.right)}`;
    default:
      throw new Error(`不支持的方法参数形态：${node.type}`);
  }
}

export function lowerFunctionBody(
  context: ScriptContext,
  body: any,
  aliases: Map<string, string> = new Map(),
): string {
  const block = unwrapExpression(body);
  if (block.type !== "BlockStatement") {
    return `{ return ${lowerExpression(context, block, aliases)}; }`;
  }

  const statements = block.body
    .map((statement: any) => lowerStatement(context, statement, aliases))
    .filter(Boolean);
  if (statements.length === 0) {
    return "{}";
  }
  return `{\n${statements.map((statement: string) => `  ${statement}`).join("\n")}\n}`;
}

export function lowerFunctionBodySource(
  context: ScriptContext,
  body: any,
  aliases: Map<string, string> = new Map(),
): string {
  const block = unwrapExpression(body);
  if (block.type !== "BlockStatement") {
    return `return ${lowerExpression(context, block, aliases)};`;
  }

  return block.body
    .map((statement: any) => lowerStatement(context, statement, aliases))
    .filter(Boolean)
    .join("\n");
}

export function lowerStatement(
  context: ScriptContext,
  statement: any,
  aliases: Map<string, string> = new Map(),
): string {
  switch (statement.type) {
    case "ExpressionStatement":
      return `${lowerExpression(context, statement.expression, aliases)};`;
    case "ReturnStatement":
      return statement.argument
        ? `return ${lowerExpression(context, statement.argument, aliases)};`
        : "return;";
    case "VariableDeclaration":
      return lowerVariableDeclaration(context, statement, aliases);
    case "IfStatement":
      return lowerIfStatement(context, statement, aliases);
    case "BlockStatement":
      return lowerBlockStatement(context, statement, aliases);
    case "ThrowStatement":
      return statement.argument
        ? `throw ${lowerExpression(context, statement.argument, aliases)};`
        : "throw;";
    case "BreakStatement":
      return statement.label ? `break ${statement.label.name};` : "break;";
    case "ContinueStatement":
      return statement.label
        ? `continue ${statement.label.name};`
        : "continue;";
    default:
      return sourceForNode(context.source, statement);
  }
}

function lowerVariableDeclaration(
  context: ScriptContext,
  statement: any,
  aliases: Map<string, string> = new Map(),
): string {
  const declarations = statement.declarations.map((declarator: any) => {
    const id = lowerBindingTarget(context, declarator.id);
    if (!declarator.init) {
      return id;
    }
    return `${id} = ${lowerExpression(context, declarator.init, aliases)}`;
  });
  return `${statement.kind} ${declarations.join(", ")};`;
}

function lowerBindingTarget(context: ScriptContext, target: any): string {
  const node = unwrapExpression(target);
  switch (node.type) {
    case "Identifier":
      return node.name;
    default:
      return sourceForNode(context.source, node);
  }
}

function lowerIfStatement(
  context: ScriptContext,
  statement: any,
  aliases: Map<string, string>,
): string {
  const test = lowerExpression(context, statement.test, aliases);
  const consequent = lowerStatementAsBlock(
    context,
    statement.consequent,
    aliases,
  );
  if (!statement.alternate) {
    return `if (${test}) ${consequent}`;
  }
  const alternate =
    statement.alternate.type === "IfStatement"
      ? lowerIfStatement(context, statement.alternate, aliases)
      : lowerStatementAsBlock(context, statement.alternate, aliases);
  return `if (${test}) ${consequent} else ${alternate}`;
}

function lowerBlockStatement(
  context: ScriptContext,
  statement: any,
  aliases: Map<string, string>,
): string {
  const body = statement.body
    .map((item: any) => lowerStatement(context, item, aliases))
    .filter(Boolean)
    .map((item: string) => `  ${item}`)
    .join("\n");
  return body ? `{\n${body}\n}` : "{}";
}

function lowerStatementAsBlock(
  context: ScriptContext,
  statement: any,
  aliases: Map<string, string>,
): string {
  if (statement.type === "BlockStatement") {
    return lowerBlockStatement(context, statement, aliases);
  }
  return `{\n  ${lowerStatement(context, statement, aliases)}\n}`;
}

export function expressionPrecedence(expression: any): number {
  const node = unwrapExpression(expression);
  switch (node.type) {
    case "Identifier":
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
    case "TemplateLiteral":
    case "ArrayExpression":
    case "ObjectExpression":
      return 20;
    case "MemberExpression":
    case "OptionalMemberExpression":
      return 19;
    case "CallExpression":
    case "OptionalCallExpression":
      return 18;
    case "UpdateExpression":
      return 17;
    case "AwaitExpression":
      return 16;
    case "UnaryExpression":
      return 16;
    case "BinaryExpression":
      return binaryOperatorPrecedence(node.operator);
    case "LogicalExpression":
      return logicalOperatorPrecedence(node.operator);
    case "ConditionalExpression":
      return 4;
    case "AssignmentExpression":
      return 3;
    default:
      return 20;
  }
}

function binaryOperatorPrecedence(operator: string): number {
  if (operator === "*" || operator === "/" || operator === "%") return 14;
  if (operator === "+" || operator === "-") return 13;
  if (operator === "<<" || operator === ">>" || operator === ">>>") return 12;
  if (
    operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">=" ||
    operator === "in" ||
    operator === "instanceof"
  ) {
    return 11;
  }
  if (
    operator === "==" ||
    operator === "!=" ||
    operator === "===" ||
    operator === "!=="
  ) {
    return 10;
  }
  if (operator === "&") return 9;
  if (operator === "^") return 8;
  if (operator === "|") return 7;
  return 13;
}

function logicalOperatorPrecedence(operator: string): number {
  if (operator === "&&") return 6;
  if (operator === "||" || operator === "??") return 5;
  return 5;
}

function needsExpressionParens(
  expression: any,
  parentPrecedence: number,
  side: "left" | "right" | "operand",
): boolean {
  const precedence = expressionPrecedence(expression);
  if (precedence < parentPrecedence) return true;
  if (precedence > parentPrecedence) return false;
  return side === "right";
}

function lowerExpressionOperand(
  context: ScriptContext,
  expression: any,
  aliases: Map<string, string>,
  parentPrecedence: number,
  side: "left" | "right" | "operand",
): string {
  const code = lowerExpression(context, expression, aliases);
  return needsExpressionParens(expression, parentPrecedence, side)
    ? `(${code})`
    : code;
}

export function lowerExpression(
  context: ScriptContext,
  expression: any,
  aliases: Map<string, string> = new Map(),
): string {
  const node = unwrapExpression(expression);

  switch (node.type) {
    case "Identifier": {
      const alias = aliases.get(node.name);
      if (alias) {
        return alias;
      }
      const memo = scriptMemoExpression(context, node.name, aliases);
      if (memo) {
        return memo;
      }
      if (context.stateVars.has(node.name)) {
        return `this.${node.name}`;
      }
      if (context.methodVars.has(node.name)) {
        return `this.${node.name}`;
      }
      return node.name;
    }
    case "ThisExpression":
      return "this";
    case "StringLiteral":
      return JSON.stringify(node.value);
    case "NumericLiteral":
      return String(node.value);
    case "BooleanLiteral":
      return String(node.value);
    case "NullLiteral":
      return "null";
    case "TemplateLiteral":
      return lowerScriptTemplateLiteral(context, node, aliases);
    case "ConditionalExpression":
      return `${lowerExpression(context, node.test, aliases)} ? ${lowerExpression(context, node.consequent, aliases)} : ${lowerExpression(context, node.alternate, aliases)}`;
    case "BinaryExpression":
    case "LogicalExpression": {
      const precedence = expressionPrecedence(node);
      return `${lowerExpressionOperand(context, node.left, aliases, precedence, "left")} ${node.operator} ${lowerExpressionOperand(context, node.right, aliases, precedence, "right")}`;
    }
    case "UnaryExpression":
      return `${node.operator}${lowerExpressionOperand(context, node.argument, aliases, expressionPrecedence(node), "operand")}`;
    case "AssignmentExpression":
      return `${lowerExpressionOperand(context, node.left, aliases, expressionPrecedence(node), "left")} ${node.operator} ${lowerExpressionOperand(context, node.right, aliases, expressionPrecedence(node), "right")}`;
    case "UpdateExpression": {
      const argument = lowerExpression(context, node.argument, aliases);
      return node.prefix
        ? `${node.operator}${argument}`
        : `${argument}${node.operator}`;
    }
    case "AwaitExpression":
      return `await ${lowerExpressionOperand(context, node.argument, aliases, expressionPrecedence(node), "operand")}`;
    case "MemberExpression":
    case "OptionalMemberExpression":
      return lowerMemberExpression(context, node, aliases);
    case "CallExpression":
    case "OptionalCallExpression": {
      const setterTarget =
        node.callee.type === "Identifier"
          ? context.stateSetters.get(node.callee.name)
          : undefined;
      if (setterTarget) {
        return lowerStateSetterCall(context, setterTarget, node);
      }

      const optional = node.optional ? "?." : "";
      const callee = lowerExpression(context, node.callee, aliases);
      const args = node.arguments
        .map((arg: any) => {
          if (arg.type === "SpreadElement") {
            return `...${lowerExpression(context, arg.argument, aliases)}`;
          }
          return lowerExpression(context, arg, aliases);
        })
        .join(", ");
      return `${callee}${optional}(${args})`;
    }
    case "ArrayExpression":
      return `[${node.elements
        .map((item: any) =>
          item
            ? item.type === "SpreadElement"
              ? `...${lowerExpression(context, item.argument, aliases)}`
              : lowerExpression(context, item, aliases)
            : "",
        )
        .join(", ")}]`;
    case "ObjectExpression":
      return lowerScriptObjectExpression(context, node, aliases);
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return lowerFunctionExpression(context, node, aliases);
    default:
      return sourceForNode(context.source, node);
  }
}

function scriptMemoExpression(
  context: ScriptContext,
  name: string,
  aliases: Map<string, string>,
): string | undefined {
  const expression = context.memoVars.get(name);
  if (!expression) return undefined;
  return `(${lowerExpression(context, expression, aliases)})`;
}

function lowerMemberExpression(
  context: ScriptContext,
  node: any,
  aliases: Map<string, string>,
): string {
  const objectNode = unwrapExpression(node.object);
  if (objectNode.type === "Identifier" && objectNode.name === "props") {
    if (node.computed) {
      return `this[${lowerExpression(context, node.property, aliases)}]`;
    }
    return `this.${sourceForNode(context.source, node.property)}`;
  }

  const object = lowerExpressionOperand(
    context,
    node.object,
    aliases,
    expressionPrecedence(node),
    "operand",
  );
  if (node.computed) {
    return `${object}[${lowerExpression(context, node.property, aliases)}]`;
  }
  const operator = node.optional ? "?." : ".";
  return `${object}${operator}${sourceForNode(context.source, node.property)}`;
}

function lowerFunctionExpression(
  context: ScriptContext,
  node: any,
  aliases: Map<string, string>,
): string {
  const asyncPrefix = node.async ? "async " : "";
  const params = node.params
    .map((param: any) => lowerParameter(context, param))
    .join(", ");
  const bodyAliases = withoutParamAliases(aliases, node.params);
  const body = lowerFunctionBody(context, node.body, bodyAliases);
  if (node.type === "ArrowFunctionExpression") {
    return `${asyncPrefix}(${params}) => ${body}`;
  }
  const name = node.id?.name ? ` ${node.id.name}` : "";
  return `${asyncPrefix}function${name}(${params}) ${body}`;
}

function withoutParamAliases(
  aliases: Map<string, string>,
  params: any[],
): Map<string, string> {
  if (aliases.size === 0) return aliases;
  const next = new Map(aliases);
  for (const param of params) {
    const node = unwrapExpression(param);
    if (node.type === "Identifier") {
      next.delete(node.name);
    }
  }
  return next;
}

function lowerScriptTemplateLiteral(
  context: ScriptContext,
  node: any,
  aliases: Map<string, string>,
): string {
  const parts: string[] = [];
  node.quasis.forEach((quasi: any, index: number) => {
    const text = quasi.value.cooked ?? quasi.value.raw ?? "";
    if (text) {
      parts.push(JSON.stringify(text));
    }
    const expression = node.expressions[index];
    if (expression) {
      parts.push(`(${lowerExpression(context, expression, aliases)})`);
    }
  });
  return parts.length > 0 ? parts.join(" + ") : '""';
}

function lowerScriptObjectExpression(
  context: ScriptContext,
  node: any,
  aliases: Map<string, string>,
): string {
  const entries = node.properties.map((property: any) => {
    if (property.type === "SpreadElement") {
      return `...${lowerExpression(context, property.argument, aliases)}`;
    }
    if (property.type === "ObjectMethod") {
      const key = property.computed
        ? `[${lowerExpression(context, property.key, aliases)}]`
        : jsObjectKey(objectPropertyKey(property.key, context.filename));
      return `${key}: ${lowerFunctionExpression(context, property, aliases)}`;
    }
    if (property.type !== "ObjectProperty") {
      throw new Error(`${context.filename ?? "TSX"}: 表达式暂不支持对象属性 ${property.type}`);
    }
    const key = property.computed
      ? `[${lowerExpression(context, property.key, aliases)}]`
      : jsObjectKey(objectPropertyKey(property.key, context.filename));
    return `${key}: ${lowerExpression(context, property.value, aliases)}`;
  });
  return `{ ${entries.join(", ")} }`;
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
      aliases.set(firstParam.name, `this.${stateName}`);
    }
    if (expression.body.type === "BlockStatement") {
      return `this.${stateName} = ${lowerExpression(
        context,
        returnExpressionFromStaticFactory(context, expression, "setState updater"),
        aliases,
      )}`;
    }
    return `this.${stateName} = ${lowerExpression(context, expression.body, aliases)}`;
  }

  return `this.${stateName} = ${lowerExpression(context, expression)}`;
}

// ===== Template lower helpers =====

export function lowerTemplateEventHandler(
  context: TemplateContext,
  node: any,
): string {
  const fn = unwrapExpression(node);
  const firstParam = fn.params?.[0];
  const aliases: Array<[string, string]> = [];
  if (firstParam?.type === "Identifier") {
    aliases.push([firstParam.name, "evt"]);
  }
  const bodyContext = withTemplateAliases(context, aliases);
  const body = lowerTemplateFunctionBody(bodyContext, fn.body);
  return `function(evt) ${body}`;
}

function lowerTemplateFunctionBody(
  context: TemplateContext,
  body: any,
): string {
  const node = unwrapExpression(body);
  if (node.type !== "BlockStatement") {
    return `{ return ${lowerTemplateExpression(context, node)}; }`;
  }

  const statements = node.body
    .map((statement: any) => lowerTemplateStatement(context, statement))
    .filter(Boolean);
  if (statements.length === 0) {
    return "{}";
  }
  return `{\n${statements.map((statement: string) => `  ${statement}`).join("\n")}\n}`;
}

function lowerTemplateStatement(
  context: TemplateContext,
  statement: any,
): string {
  switch (statement.type) {
    case "ExpressionStatement":
      return `${lowerTemplateExpression(context, statement.expression)};`;
    case "ReturnStatement":
      return statement.argument
        ? `return ${lowerTemplateExpression(context, statement.argument)};`
        : "return;";
    case "VariableDeclaration":
      return lowerTemplateVariableDeclaration(context, statement);
    case "IfStatement":
      return lowerTemplateIfStatement(context, statement);
    case "BlockStatement": {
      const body = statement.body
        .map((item: any) => lowerTemplateStatement(context, item))
        .filter(Boolean)
        .map((item: string) => `  ${item}`)
        .join("\n");
      return body ? `{\n${body}\n}` : "{}";
    }
    default:
      throw new Error(
        `${context.filename ?? "TSX"}: 内联事件暂不支持 ${statement.type}`,
      );
  }
}

function lowerTemplateVariableDeclaration(
  context: TemplateContext,
  statement: any,
): string {
  const declarations = statement.declarations.map((declarator: any) => {
    const id = lowerTemplateBindingTarget(context, declarator.id);
    if (!declarator.init) {
      return id;
    }
    return `${id} = ${lowerTemplateExpression(context, declarator.init)}`;
  });
  return `${statement.kind} ${declarations.join(", ")};`;
}

function lowerTemplateBindingTarget(
  context: TemplateContext,
  target: any,
): string {
  const node = unwrapExpression(target);
  switch (node.type) {
    case "Identifier":
      return node.name;
    default:
      return sourceForNode(context.source, node);
  }
}

function lowerTemplateIfStatement(
  context: TemplateContext,
  statement: any,
): string {
  const test = lowerTemplateExpression(context, statement.test);
  const consequent = lowerTemplateStatementAsBlock(
    context,
    statement.consequent,
  );
  if (!statement.alternate) {
    return `if (${test}) ${consequent}`;
  }
  const alternate =
    statement.alternate.type === "IfStatement"
      ? lowerTemplateIfStatement(context, statement.alternate)
      : lowerTemplateStatementAsBlock(context, statement.alternate);
  return `if (${test}) ${consequent} else ${alternate}`;
}

function lowerTemplateStatementAsBlock(
  context: TemplateContext,
  statement: any,
): string {
  if (statement.type === "BlockStatement") {
    return lowerTemplateStatement(context, statement);
  }
  return `{\n  ${lowerTemplateStatement(context, statement)}\n}`;
}

function lowerTemplateExpressionOperand(
  context: TemplateContext,
  expression: any,
  parentPrecedence: number,
  side: "left" | "right" | "operand",
): string {
  const code = lowerTemplateExpression(context, expression);
  return needsExpressionParens(expression, parentPrecedence, side)
    ? `(${code})`
    : code;
}

export function lowerTemplateExpression(
  context: TemplateContext,
  expression: any,
): string {
  const node = unwrapExpression(expression);

  switch (node.type) {
    case "Identifier": {
      const memo = templateMemoExpression(context, node.name);
      if (memo) {
        return memo;
      }
      return lowerTemplateIdentifier(context, node.name);
    }
    case "StringLiteral":
      return JSON.stringify(node.value);
    case "NumericLiteral":
      return String(node.value);
    case "BooleanLiteral":
      return String(node.value);
    case "NullLiteral":
      return "null";
    case "TemplateLiteral":
      return lowerTemplateLiteral(context, node);
    case "ConditionalExpression":
      return `${lowerTemplateExpression(context, node.test)} ? ${lowerTemplateExpression(context, node.consequent)} : ${lowerTemplateExpression(context, node.alternate)}`;
    case "BinaryExpression":
    case "LogicalExpression": {
      const precedence = expressionPrecedence(node);
      return `${lowerTemplateExpressionOperand(context, node.left, precedence, "left")} ${node.operator} ${lowerTemplateExpressionOperand(context, node.right, precedence, "right")}`;
    }
    case "UnaryExpression":
      return `${node.operator}${lowerTemplateExpressionOperand(context, node.argument, expressionPrecedence(node), "operand")}`;
    case "AssignmentExpression":
      return `${lowerTemplateExpressionOperand(context, node.left, expressionPrecedence(node), "left")} ${node.operator} ${lowerTemplateExpressionOperand(context, node.right, expressionPrecedence(node), "right")}`;
    case "UpdateExpression": {
      const argument = lowerTemplateExpression(context, node.argument);
      return node.prefix
        ? `${node.operator}${argument}`
        : `${argument}${node.operator}`;
    }
    case "MemberExpression":
    case "OptionalMemberExpression":
      return lowerTemplateMemberExpression(context, node);
    case "CallExpression":
    case "OptionalCallExpression":
      return lowerTemplateCallExpression(context, node);
    case "ArrayExpression":
      return `[${node.elements
        .map((item: any) =>
          item
            ? item.type === "SpreadElement"
              ? `...${lowerTemplateExpression(context, item.argument)}`
              : lowerTemplateExpression(context, item)
            : "",
        )
        .join(", ")}]`;
    case "ObjectExpression":
      return lowerTemplateObjectExpression(context, node);
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return lowerTemplateEventHandler(context, node);
    default:
      throw new Error(
        `${context.filename ?? "TSX"}: 文本绑定暂不支持 ${node.type}`,
      );
  }
}

function templateMemoExpression(
  context: TemplateContext,
  name: string,
): string | undefined {
  const expression = context.scriptContext.memoVars.get(name);
  if (!expression) return undefined;
  return `(${lowerTemplateExpression(context, expression)})`;
}

function lowerTemplateIdentifier(
  context: TemplateContext,
  name: string,
): string {
  const alias = context.aliases.get(name);
  if (alias) {
    return alias;
  }
  if (TEMPLATE_GLOBALS.has(name)) {
    return name;
  }
  return `_vm_.${name}`;
}

function lowerTemplateMemberExpression(
  context: TemplateContext,
  node: any,
): string {
  const object = unwrapExpression(node.object);
  let base: string;
  if (object.type === "Identifier" && object.name === "props") {
    base = "_vm_";
  } else {
    base = lowerTemplateExpressionOperand(
      context,
      object,
      expressionPrecedence(node),
      "operand",
    );
  }

  const operator = node.optional ? "?." : ".";
  if (node.computed) {
    return `${base}${node.optional ? "?." : ""}[${lowerTemplateExpression(context, node.property)}]`;
  }
  const property = sourceForNode(context.source, node.property);
  return `${base}${operator}${property}`;
}

function lowerTemplateCallExpression(
  context: TemplateContext,
  node: any,
): string {
  const setterTarget =
    node.callee.type === "Identifier"
      ? context.scriptContext.stateSetters.get(node.callee.name)
      : undefined;
  if (setterTarget) {
    return lowerTemplateStateSetterCall(context, setterTarget, node);
  }

  const optional = node.optional ? "?." : "";
  const callee = lowerTemplateExpressionOperand(
    context,
    node.callee,
    expressionPrecedence(node),
    "operand",
  );
  const args = node.arguments
    .map((arg: any) => {
      if (arg.type === "SpreadElement") {
        return `...${lowerTemplateExpression(context, arg.argument)}`;
      }
      return lowerTemplateExpression(context, arg);
    })
    .join(", ");
  return `${callee}${optional}(${args})`;
}

function lowerTemplateStateSetterCall(
  context: TemplateContext,
  stateName: string,
  node: any,
): string {
  const next = node.arguments[0];
  if (!next) {
    return `_vm_.${stateName} = null`;
  }

  const expression = unwrapExpression(next);
  if (expression.type === "ArrowFunctionExpression") {
    const firstParam = expression.params[0];
    const aliases =
      firstParam?.type === "Identifier"
        ? ([[firstParam.name, `_vm_.${stateName}`]] as Array<[string, string]>)
        : [];
    if (expression.body.type === "BlockStatement") {
      return `_vm_.${stateName} = ${lowerTemplateExpression(
        withTemplateAliases(context, aliases),
        returnExpressionFromStaticFactory(
          context.scriptContext,
          expression,
          "setState updater",
        ),
      )}`;
    }
    return `_vm_.${stateName} = ${lowerTemplateExpression(
      withTemplateAliases(context, aliases),
      expression.body,
    )}`;
  }

  return `_vm_.${stateName} = ${lowerTemplateExpression(context, expression)}`;
}

function lowerTemplateLiteral(context: TemplateContext, node: any): string {
  const parts: string[] = [];
  node.quasis.forEach((quasi: any, index: number) => {
    const text = quasi.value.cooked ?? quasi.value.raw ?? "";
    if (text) {
      parts.push(JSON.stringify(text));
    }
    const expression = node.expressions[index];
    if (expression) {
      parts.push(`(${lowerTemplateExpression(context, expression)})`);
    }
  });
  return parts.length > 0 ? parts.join(" + ") : '""';
}

function lowerTemplateObjectExpression(
  context: TemplateContext,
  node: any,
): string {
  const entries = node.properties.map((property: any) => {
    if (property.type === "SpreadElement") {
      return `...${lowerTemplateExpression(context, property.argument)}`;
    }
    if (property.type !== "ObjectProperty") {
      throw new Error(`${context.filename ?? "TSX"}: 文本绑定暂不支持对象方法`);
    }
    const key = property.computed
      ? `[${lowerTemplateExpression(context, property.key)}]`
      : jsObjectKey(objectPropertyKey(property.key, context.filename));
    return `${key}: ${lowerTemplateExpression(context, property.value)}`;
  });
  return `{ ${entries.join(", ")} }`;
}

export function withTemplateAliases(
  context: TemplateContext,
  aliases: Array<[string, string]>,
): TemplateContext {
  const next = new Map(context.aliases);
  for (const [source, target] of aliases) {
    next.set(source, target);
  }
  return { ...context, aliases: next };
}

export function returnExpressionFromStaticFactory(
  context: ScriptContext,
  fn: any,
  hookName: string,
): any {
  const body = unwrapExpression(fn.body);
  if (body.type !== "BlockStatement") {
    return body;
  }

  const meaningful = body.body.filter(
    (statement: any) => statement.type !== "EmptyStatement",
  );
  if (meaningful.length === 1 && meaningful[0].type === "ReturnStatement") {
    if (!meaningful[0].argument) {
      throw new Error(`${context.filename ?? "TSX"}: ${hookName} 返回值不能为空`);
    }
    return unwrapExpression(meaningful[0].argument);
  }

  throw new Error(
    `${context.filename ?? "TSX"}: ${hookName} 函数体只能包含 return 表达式`,
  );
}

function jsObjectKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
