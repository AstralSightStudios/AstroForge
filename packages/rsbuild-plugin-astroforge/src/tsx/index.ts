/// TSX → IR 提取器主入口。
///
/// 负责协调 script / template / AST 各层，将单份 TSX 文件转换为 IR 中的
/// Page、Component 或 AppModule。

import { parse } from "@babel/parser";
import type {
  ExtractPageOptions,
  ExtractPageModuleResult,
  ExtractComponentOptions,
  ExtractComponentResult,
} from "./types";
import { createScriptContext, createTemplateContext } from "./script";
import { extractScript, generateContextProviderComponents } from "./script";
import {
  templateFromRenderExpression,
  extractStyleTable,
  extractLocalComponents,
  collectComponentImports,
  collectUsedJsxComponentNames,
  collectAstroForgeImports,
  extractAppFromTsx,
  importsFromTemplate,
} from "./template";
import {
  renderExpressionFromFunction,
  locateComponentFunction,
  defaultExportName,
  findDefaultPageFunction,
  collectLocalVars,
} from "./ast";

export * from "./types";
export {
  collectAstroForgeImports,
  collectUsedJsxComponentNames,
  collectComponentImports,
  extractAppFromTsx,
  extractStyleTable,
  importsFromTemplate,
} from "./template";

export function extractPageFromTsx(
  source: string,
  options: ExtractPageOptions,
): ExtractPageModuleResult["page"] {
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
  const pageFunction = findDefaultPageFunction(ast.program.body, options.filename);
  const scriptExtraction = extractScript(
    source,
    ast.program.body,
    pageFunction.node,
    options.filename,
    {
      resolveImport: options.resolveImport,
      loadModule: options.loadModule,
    },
  );
  const script = scriptExtraction.script;
  const template = templateFromRenderExpression(
    pageFunction.renderExpression,
    bindings,
    createTemplateContext(
      source,
      options.filename,
      scriptExtraction.context,
      new Map(),
      collectLocalVars(pageFunction.node),
    ),
  );
  const components = {
    ...extractLocalComponents(
      source,
      ast.program.body,
      pageFunction.node,
      bindings,
      options.filename,
      options.resolveImport,
      options.loadModule,
    ),
    ...generateContextProviderComponents(scriptExtraction.context.contextVars),
  };
  const usedComponentNames = collectUsedJsxComponentNames(ast.program.body);
  const componentImports = collectComponentImports(
    ast.program.body,
    bindings,
    Object.keys(components),
    usedComponentNames,
  );
  const imports = importsFromTemplate(template, components);

  const page = {
    route: options.route,
    imports,
    template,
    script,
    style: extractStyleTable(
      source,
      ast.program.body,
      options.filename,
      options.loadStyle,
    ),
  };

  return { page, components, componentImports };
}

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

  const scriptExtraction = extractScript(
    source,
    ast.program.body,
    located.node,
    options.filename,
    {
      collectExportedLifecycle: false,
      resolveImport: options.resolveImport,
      loadModule: options.loadModule,
    },
  );
  const script = scriptExtraction.script;
  script.props = extractComponentProps(
    located.node,
    ast.program.body,
    options.filename,
  );
  const template = templateFromRenderExpression(
    located.renderExpression,
    bindings,
    createTemplateContext(
      source,
      options.filename,
      scriptExtraction.context,
      new Map(),
      collectLocalVars(located.node),
    ),
  );
  const usedComponentNames = collectUsedJsxComponentNames(ast.program.body);
  const componentImports = collectComponentImports(
    ast.program.body,
    bindings,
    [],
    usedComponentNames,
  );

  const component = {
    name: kebabCase(located.localName),
    template,
    script,
    style: extractStyleTable(
      source,
      ast.program.body,
      options.filename,
      options.loadStyle,
    ),
  };

  return {
    component,
    componentImports,
    components: generateContextProviderComponents(
      scriptExtraction.context.contextVars,
    ),
  };
}

import { kebabCase } from "./ast";
import { extractComponentProps } from "./template";
