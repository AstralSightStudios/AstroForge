/// 脚本提取层。
///
/// 从页面 / 组件函数的函数体中抽离 hooks、方法、生命周期、本地 import 内联等，
/// 生成 IR `Script` 对象与 `ScriptContext`。

import { parse } from "@babel/parser";
import type { Script, JsonValue, Component } from "../ir";
import { createEmptyScript } from "../ir";
import type {
  ScriptContext,
  ScriptExtraction,
  ImportResolver,
} from "./types";
import {
  unwrapExpression,
  isFunctionLike,
  sourceForNode,
  objectPropertyKey,
  staticJsonValue,
  staticAttrLiteral,
  findTopLevelBinding,
} from "./ast";
import {
  lowerFunctionLike,
  lowerExpression,
  returnExpressionFromStaticFactory,
} from "./lower";

export function createScriptContext(
  source: string,
  filename?: string,
): ScriptContext {
  return {
    source,
    filename,
    stateVars: new Set(),
    stateSetters: new Map(),
    methodVars: new Set(),
    memoVars: new Map(),
    idCounter: 0,
    contextVars: new Map(),
  };
}

export function createTemplateContext(
  source: string,
  filename?: string,
  scriptContext = createScriptContext(source, filename),
  aliases: Map<string, string> = new Map(),
  localVars: Set<string> = new Set(),
): TemplateContext {
  return {
    source,
    filename,
    scriptContext,
    aliases,
    localVars,
  };
}

export function extractScript(
  source: string,
  moduleBody: any[],
  pageFunction: any,
  filename?: string,
  options: {
    collectExportedLifecycle?: boolean;
    resolveImport?: ImportResolver;
    loadModule?: (path: string) => string | undefined;
  } = {},
): ScriptExtraction {
  const script = createEmptyScript();
  const body = unwrapExpression(pageFunction.body);
  const context = createScriptContext(source, filename);
  collectCreateContextDeclarations(context, moduleBody);
  if (body.type !== "BlockStatement") {
    return { script, context };
  }

  for (const statement of body.body) {
    collectUseStateDeclaration(script, context, statement);
    collectUseRefDeclaration(script, context, statement);
    collectUseMemoDeclaration(context, statement);
    collectUseReducerDeclaration(script, context, statement);
    collectUseIdDeclaration(script, context, statement);
    collectUseContextDeclaration(script, context, statement);
  }

  for (const statement of body.body) {
    collectMethod(script, context, statement);
    collectUseCallbackMethod(script, context, statement);
  }

  if (options.collectExportedLifecycle ?? true) {
    collectPageLifecycle(script, context, moduleBody);
  }
  collectUseEffectCalls(script, context, body.body);
  inlineLocalImports(
    moduleBody,
    script,
    context,
    options.resolveImport,
    options.loadModule,
  );

  return { script, context };
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

    const initial = useStateInitialExpression(context, declarator.init);
    script.private_data[stateId.name] = initial
      ? staticJsonValue(initial, context.filename)
      : null;
    context.stateVars.add(stateId.name);
    context.stateSetters.set(setterId.name, stateId.name);
  }
}

function useStateInitialExpression(
  context: ScriptContext,
  call: any,
): any | undefined {
  const initial = call.arguments[0];
  if (!initial) return undefined;
  const expression = unwrapExpression(initial);
  if (isFunctionLike(expression)) {
    return returnExpressionFromStaticFactory(context, expression, "useState");
  }
  return initial;
}

function collectUseRefDeclaration(
  script: Script,
  context: ScriptContext,
  statement: any,
) {
  if (statement.type !== "VariableDeclaration") {
    return;
  }

  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      !isUseRefCall(declarator.init)
    ) {
      continue;
    }

    const initial = declarator.init.arguments[0];
    script.private_data[declarator.id.name] = {
      current: initial ? staticJsonValue(initial, context.filename) : null,
    };
    context.stateVars.add(declarator.id.name);
  }
}

function collectUseMemoDeclaration(context: ScriptContext, statement: any) {
  if (statement.type !== "VariableDeclaration") {
    return;
  }

  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      !isUseMemoCall(declarator.init)
    ) {
      continue;
    }

    context.memoVars.set(
      declarator.id.name,
      memoExpressionFromCall(context, declarator.init),
    );
  }
}

function collectUseReducerDeclaration(
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
      !isUseReducerCall(declarator.init)
    ) {
      continue;
    }

    const stateId = declarator.id.elements[0];
    const dispatchId = declarator.id.elements[1];
    if (
      stateId?.type !== "Identifier" ||
      dispatchId?.type !== "Identifier"
    ) {
      throw new Error(
        `${context.filename ?? "TSX"}: useReducer 解构必须形如 const [state, dispatch] = useReducer(reducer, init)`,
      );
    }

    const call = unwrapExpression(declarator.init);
    const reducerArg = call.arguments[0];
    const initialArg = call.arguments[1];
    const initArg = call.arguments[2];

    let initialState: JsonValue = null;
    if (initArg && isFunctionLike(unwrapExpression(initArg))) {
      initialState = staticJsonValue(
        returnExpressionFromStaticFactory(
          context,
          unwrapExpression(initArg),
          "useReducer init",
        ),
        context.filename,
      );
    } else if (initialArg) {
      initialState = staticJsonValue(initialArg, context.filename);
    }

    script.private_data[stateId.name] = initialState;
    context.stateVars.add(stateId.name);

    const reducerExpr = unwrapExpression(reducerArg);
    const loweredReducer =
      reducerExpr.type === "Identifier"
        ? reducerExpr.name
        : isFunctionLike(reducerExpr)
          ? lowerExpression(context, reducerArg)
          : sourceForNode(context.source, reducerArg);

    script.methods[dispatchId.name] =
      `function ${dispatchId.name}(action) {\n  this.${stateId.name} = (${loweredReducer})(this.${stateId.name}, action);\n}`;
    context.methodVars.add(dispatchId.name);
  }
}

function collectUseIdDeclaration(
  script: Script,
  context: ScriptContext,
  statement: any,
) {
  if (statement.type !== "VariableDeclaration") {
    return;
  }

  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      !isUseIdCall(declarator.init)
    ) {
      continue;
    }

    context.idCounter += 1;
    script.private_data[declarator.id.name] = `__af_id_${context.idCounter}`;
    context.stateVars.add(declarator.id.name);
  }
}

function collectMethod(script: Script, context: ScriptContext, statement: any) {
  if (statement.type === "FunctionDeclaration") {
    if (!statement.id?.name) {
      return;
    }
    context.methodVars.add(statement.id.name);
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

    context.methodVars.add(declarator.id.name);
    script.methods[declarator.id.name] = lowerFunctionLike(
      context,
      unwrapExpression(declarator.init),
      declarator.id.name,
    );
  }
}

function collectUseCallbackMethod(
  script: Script,
  context: ScriptContext,
  statement: any,
) {
  if (statement.type !== "VariableDeclaration") {
    return;
  }

  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      !isUseCallbackCall(declarator.init)
    ) {
      continue;
    }

    const callback = callbackFunctionFromCall(context, declarator.init);
    context.methodVars.add(declarator.id.name);
    script.methods[declarator.id.name] = lowerFunctionLike(
      context,
      callback,
      declarator.id.name,
    );
  }
}

function collectUseEffectCalls(
  script: Script,
  context: ScriptContext,
  statements: any[],
) {
  for (const statement of statements) {
    if (
      statement.type !== "ExpressionStatement" ||
      !isUseEffectCall(statement.expression)
    ) {
      continue;
    }

    const call = unwrapExpression(statement.expression);
    assertSupportedEffectDeps(call, context.filename);
    const effect = effectBodies(context, call.arguments[0]);
    if (effect.body) {
      appendLifecycleBody(script.lifecycle, "onReady", effect.body);
    }
    if (effect.cleanup) {
      appendLifecycleBody(script.lifecycle, "onDestroy", effect.cleanup);
    }
  }
}

function isUseEffectCall(node: any): boolean {
  const expression = unwrapExpression(node);
  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === "useEffect"
  );
}

function assertSupportedEffectDeps(call: any, filename?: string) {
  const deps = call.arguments[1];
  if (!deps) return;
  const node = unwrapExpression(deps);
  if (node.type === "ArrayExpression" && node.elements.length === 0) {
    return;
  }
  throw new Error(
    `${filename ?? "TSX"}: useEffect 静态展开仅支持省略依赖或空依赖数组`,
  );
}

function effectBodies(
  context: ScriptContext,
  callback: any,
): { body?: string; cleanup?: string } {
  const fn = unwrapExpression(callback);
  if (!isFunctionLike(fn)) {
    throw new Error(`${context.filename ?? "TSX"}: useEffect 参数必须是函数`);
  }

  const body = unwrapExpression(fn.body);
  if (body.type !== "BlockStatement") {
    return { body: `${lowerExpression(context, body)};` };
  }

  const statements: string[] = [];
  let cleanup: string | undefined;
  for (const statement of body.body) {
    if (statement.type === "ReturnStatement") {
      if (!statement.argument) continue;
      const returned = unwrapExpression(statement.argument);
      if (!isFunctionLike(returned)) {
        throw new Error(
          `${context.filename ?? "TSX"}: useEffect cleanup 必须返回函数`,
        );
      }
      cleanup = lowerFunctionBodySource(context, returned.body);
      continue;
    }
    const lowered = lowerStatement(context, statement);
    if (lowered) statements.push(lowered);
  }
  return {
    body: statements.join("\n"),
    cleanup,
  };
}

import { lowerFunctionBodySource, lowerStatement } from "./lower";

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

export function collectLifecycleObject(
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
        : fn.async
          ? lowerFunctionLike(context, fn, key)
          : lowerFunctionBodySource(context, fn.body);
  }
}

function appendLifecycleBody(
  lifecycle: Record<string, string>,
  name: string,
  body: string,
) {
  const existing = lifecycle[name];
  const bodies = [existing ? functionBodyFromSource(existing) : "", body]
    .map((item) => item.trim())
    .filter(Boolean);
  lifecycle[name] =
    `function ${name}() {\n${indentJsBody(bodies.join("\n"))}\n}`;
}

function functionBodyFromSource(source: string): string {
  const match = source.match(
    /^function\s+[A-Za-z_$][\w$]*\([^)]*\)\s*\{\n?([\s\S]*)\n?\}$/,
  );
  if (!match) return source;
  return match[1]
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n")
    .trim();
}

function indentJsBody(source: string): string {
  return source
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : ""))
    .join("\n");
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
  return isHookCall(node, "useState");
}

function isUseRefCall(node: any): boolean {
  return isHookCall(node, "useRef");
}

function isUseMemoCall(node: any): boolean {
  return isHookCall(node, "useMemo");
}

function isUseCallbackCall(node: any): boolean {
  return isHookCall(node, "useCallback");
}

function isUseReducerCall(node: any): boolean {
  return isHookCall(node, "useReducer");
}

function isUseIdCall(node: any): boolean {
  return isHookCall(node, "useId");
}

function isHookCall(node: any, name: string): boolean {
  const expression = unwrapExpression(node);
  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === name
  );
}

function isCreateContextCall(node: any): boolean {
  return isHookCall(node, "createContext");
}

function isUseContextCall(node: any): boolean {
  return isHookCall(node, "useContext");
}

export function collectCreateContextDeclarations(
  context: ScriptContext,
  moduleBody: any[],
) {
  for (const statement of moduleBody) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declarator of statement.declarations) {
      if (
        declarator.id.type !== "Identifier" ||
        !declarator.init ||
        !isCreateContextCall(declarator.init)
      ) {
        continue;
      }
      const key = `__af_ctx_${context.contextVars.size + 1}`;
      const defaultArg = declarator.init.arguments[0];
      const defaultExpr = defaultArg
        ? sourceForNode(context.source, defaultArg)
        : "undefined";
      context.contextVars.set(declarator.id.name, {
        id: key,
        defaultExpr,
      });
    }
  }
}

function collectUseContextDeclaration(
  script: Script,
  context: ScriptContext,
  statement: any,
) {
  if (statement.type !== "VariableDeclaration") return;
  for (const declarator of statement.declarations) {
    if (
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      !isUseContextCall(declarator.init)
    ) {
      continue;
    }
    const contextArg = declarator.init.arguments[0];
    if (contextArg?.type !== "Identifier") {
      throw new Error(
        `${context.filename ?? "TSX"}: useContext 参数必须是上下文标识符`,
      );
    }
    const ctxVar = context.contextVars.get(contextArg.name);
    if (!ctxVar) {
      throw new Error(
        `${context.filename ?? "TSX"}: 未找到上下文 ${contextArg.name}`,
      );
    }
    script.private_data[declarator.id.name] = null;
    context.stateVars.add(declarator.id.name);
    const initBody = `this.${declarator.id.name} = __af_g.__af_ctx['${ctxVar.id}'] !== undefined ? __af_g.__af_ctx['${ctxVar.id}'] : ${ctxVar.defaultExpr};`;
    appendLifecycleBody(script.lifecycle, "onInit", initBody);
  }
}

export function generateContextProviderComponents(
  contextVars: Map<string, ContextVar>,
): Record<string, Component> {
  const components: Record<string, Component> = {};
  for (const [, ctxVar] of contextVars) {
    const name = `__af_ctxp_${ctxVar.id}`;
    components[name] = {
      name,
      template: [
        {
          kind: "element",
          value: {
            tag: "slot",
            is_component: false,
            attrs: {},
            events: {},
            children: [],
          },
        },
      ],
      script: {
        props: {
          value: { type: "Object" },
        },
        private_data: {},
        methods: {},
        lifecycle: {
          onInit: `function onInit() {\n  __af_g.__af_ctx_push('${ctxVar.id}', this.value);\n}`,
          onDestroy: `function onDestroy() {\n  __af_g.__af_ctx_pop('${ctxVar.id}');\n}`,
        },
      },
      style: createEmptyScript().style,
    };
  }
  return components;
}

function memoExpressionFromCall(context: ScriptContext, call: any): any {
  const factory = unwrapExpression(call.arguments[0]);
  if (!isFunctionLike(factory)) {
    throw new Error(`${context.filename ?? "TSX"}: useMemo 参数必须是函数`);
  }
  return returnExpressionFromStaticFactory(context, factory, "useMemo");
}

function callbackFunctionFromCall(context: ScriptContext, call: any): any {
  const callback = unwrapExpression(call.arguments[0]);
  if (!isFunctionLike(callback)) {
    throw new Error(`${context.filename ?? "TSX"}: useCallback 参数必须是函数`);
  }
  return callback;
}

/// 将相对路径 import 的导出函数内联到当前 script.methods。
///
/// Vela 产物没有通用模块系统，因此必须把被引用的本地函数定义直接下沉到
/// 页面 / 组件脚本中。此处处理函数导出与常量导出。
///
/// 关键不变式：必须用被 import 模块的 source 创建独立 ScriptContext 再做
/// lower，否则 `lowerExpression` 里 fallback 到 `sourceForNode` 时会在当前
/// 文件源码上按错误坐标切片，产生乱码（如正则表达式字面量）。
function inlineLocalImports(
  moduleBody: any[],
  script: Script,
  context: ScriptContext,
  resolveImport?: ImportResolver,
  loadModule?: (path: string) => string | undefined,
) {
  if (!resolveImport || !loadModule) return;
  const imports = collectLocalImports(moduleBody, resolveImport, context.filename);
  for (const [localName, info] of imports) {
    const source = loadModule(info.sourcePath);
    if (!source) continue;
    let ast: any;
    try {
      ast = parse(source, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
    } catch {
      continue;
    }
    const exported = findExportedValue(
      ast.program.body,
      info.exportedName,
      info.sourcePath,
    );
    if (!exported) continue;

    const importContext = createScriptContext(source, info.sourcePath);
    if (exported.type === "function") {
      script.methods[localName] = lowerFunctionLike(
        importContext,
        exported.node,
        localName,
      );
      context.methodVars.add(localName);
    } else if (exported.type === "const") {
      const value = staticAttrLiteral(exported.node);
      if (value !== undefined) {
        script.private_data[localName] = value;
        context.stateVars.add(localName);
      }
    }
  }
}

function collectLocalImports(
  moduleBody: any[],
  resolveImport: ImportResolver,
  filename?: string,
): Map<string, { sourcePath: string; exportedName?: string }> {
  const out = new Map<string, { sourcePath: string; exportedName?: string }>();
  for (const statement of moduleBody) {
    if (statement.type !== "ImportDeclaration") continue;
    const spec = statement.source.value;
    if (typeof spec !== "string") continue;
    if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
    const sourcePath = resolveImport(spec, filename);
    if (!sourcePath) continue;

    for (const s of statement.specifiers) {
      if (s.type === "ImportSpecifier") {
        const exportedName =
          s.imported.type === "Identifier"
            ? s.imported.name
            : s.imported.value;
        out.set(s.local.name, { sourcePath, exportedName });
      } else if (s.type === "ImportDefaultSpecifier") {
        out.set(s.local.name, { sourcePath, exportedName: undefined });
      }
    }
  }
  return out;
}

function findExportedValue(
  body: any[],
  exportName: string | undefined,
  filename?: string,
): { type: "function"; node: any } | { type: "const"; node: any } | undefined {
  for (const statement of body) {
    if (exportName) {
      if (
        statement.type === "ExportNamedDeclaration" &&
        statement.declaration
      ) {
        if (
          statement.declaration.type === "FunctionDeclaration" &&
          statement.declaration.id?.name === exportName
        ) {
          return { type: "function", node: statement.declaration };
        }
        if (statement.declaration.type === "VariableDeclaration") {
          for (const d of statement.declaration.declarations) {
            if (
              d.id.type === "Identifier" &&
              d.id.name === exportName &&
              d.init
            ) {
              const unwrapped = unwrapExpression(d.init);
              if (isFunctionLike(unwrapped)) {
                return { type: "function", node: unwrapped };
              }
              if (staticAttrLiteral(d.init) !== undefined) {
                return { type: "const", node: d.init };
              }
            }
          }
        }
      }
      if (
        statement.type === "ExportNamedDeclaration" &&
        !statement.declaration
      ) {
        for (const spec of statement.specifiers) {
          if (
            spec.exported?.name === exportName ||
            spec.exported?.value === exportName
          ) {
            const local = findTopLevelBinding(
              body,
              spec.local?.name ?? exportName,
            );
            if (local && isFunctionLike(local)) {
              return { type: "function", node: local };
            }
          }
        }
      }
    } else {
      if (statement.type === "ExportDefaultDeclaration") {
        const decl = unwrapExpression(statement.declaration);
        if (isFunctionLike(decl)) return { type: "function", node: decl };
        if (decl.type === "Identifier") {
          const local = findTopLevelBinding(body, decl.name);
          if (local && isFunctionLike(local)) {
            return { type: "function", node: local };
          }
        }
      }
    }
  }
  return undefined;
}
