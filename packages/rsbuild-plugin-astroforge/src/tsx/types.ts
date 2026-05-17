/// TSX 提取器的类型定义层。
///
/// 所有跨模块共享的接口集中在此，避免循环引用。

import type {
  Component,
  Page,
  Script,
  AppModule,
  StyleSlot,
} from "../ir";

export interface ExtractPageOptions {
  route: string;
  filename?: string;
  loadStyle?: StyleImportLoader;
  resolveImport?: ImportResolver;
  loadModule?: ModuleLoader;
}

export type ImportResolver = (
  specifier: string,
  importer?: string,
) => string | undefined;

export type ModuleLoader = (path: string) => string | undefined;

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

export interface ExtractComponentOptions {
  filename?: string;
  /// 命名导出场景下的标识符；用于在源文件中找到 `export function Foo()` /
  /// `export const Foo = () => ...` / `export { Foo }`。缺省时按默认导出
  /// 处理。
  exportName?: string;
  loadStyle?: StyleImportLoader;
  resolveImport?: ImportResolver;
  loadModule?: ModuleLoader;
}

export type StyleImportLoader = (
  specifier: string,
  importer?: string,
) => string | undefined;

export interface ExtractComponentResult {
  component: Component;
  componentImports: ComponentImport[];
  /// 由编译器自动生成的辅助组件（如 Context Provider）。
  components: Record<string, Component>;
}

export interface ScriptContext {
  source: string;
  filename?: string;
  stateVars: Set<string>;
  stateSetters: Map<string, string>;
  methodVars: Set<string>;
  memoVars: Map<string, any>;
  idCounter: number;
  contextVars: Map<string, ContextVar>;
}

export interface ContextVar {
  id: string;
  defaultExpr: string;
}

export interface ScriptExtraction {
  script: Script;
  context: ScriptContext;
}

export interface TemplateContext {
  source: string;
  filename?: string;
  scriptContext: ScriptContext;
  aliases: Map<string, string>;
  localVars: Set<string>;
}

export interface PageFunction {
  node: any;
  renderExpression: any;
}

export interface LocatedComponentFunction {
  localName: string;
  node: any;
  renderExpression: any;
}
