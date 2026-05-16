import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { collectAssets } from "./assets";
import type {
  AstroForgeManifestInput,
  AstroForgeProjectConfig,
} from "./config";
import { readAstroForgeConfig } from "./config";
import type { AppModule, IrDocument, JsonValue, Manifest, RoutePage } from "./ir";
import { IR_VERSION } from "./ir";
import {
  extractAppFromTsx,
  extractComponentFromTsx,
  extractPageModuleFromTsx,
  type ComponentImport,
} from "./tsx";

export interface CompileProjectOptions {
  root: string;
  configFile?: string;
  cacheDir?: string;
  outFile?: string;
  config?: AstroForgeProjectConfig;
}

export interface CompileProjectResult {
  document: IrDocument;
  outFile?: string;
  pages: PageModule[];
}

export interface PageModule {
  route: string;
  component: string;
  file: string;
}

const PAGE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx"]);

export function compileAstroForgeProject(
  options: CompileProjectOptions,
): CompileProjectResult {
  const root = resolve(options.root);
  const config =
    options.config ?? readAstroForgeConfig(root, options.configFile);
  const pages = discoverPages(root);
  if (pages.length === 0) {
    throw new Error(`${root}: 未发现 src/pages 下的页面入口`);
  }

  const document = createIrDocument(config.manifest, pages);
  document.app = extractAppModule(root);
  const visitedFiles = new Set<string>();
  for (const page of pages) {
    visitedFiles.add(resolve(page.file));
    const source = readFileSync(page.file, "utf8");
    const module = extractPageModuleFromTsx(source, {
      route: page.route,
      filename: page.file,
    });
    document.pages[page.route] = module.page;
    for (const [name, component] of Object.entries(module.components)) {
      document.components[name] = component;
    }
    loadCrossFileComponents(
      document.components,
      visitedFiles,
      page.file,
      module.componentImports,
    );
    // 跨文件组件在 extractPageModuleFromTsx 时还未加载到 document.components，
    // 因此 page.imports 只填了同文件组件。这里在 BFS 完成后重新从模板扫描
    // 一次，确保 IR 里 imports 与 components 表两侧自洽。
    document.pages[page.route].imports = importsFromTemplateAndComponents(
      document.pages[page.route].template,
      document.components,
    );
  }
  document.assets = collectAssets(root, document);

  const outFile = options.outFile ?? defaultIrOutFile(root, options.cacheDir);
  writeIrDocument(outFile, document);

  return {
    document,
    outFile,
    pages,
  };
}

/// 重新扫描页面模板，与 `document.components` 表关联，生成 `page.imports`。
///
/// 与 `tsx.ts` 的同名内部函数不同：本函数运行在所有 BFS 加载完成之后，
/// 可见跨文件组件已加入 components 表。返回值形如
/// `{ "<kebab-tag>": "<components 表主键>" }`。
function importsFromTemplateAndComponents(
  template: AppModule["lifecycle"][string] extends string
    ? IrDocument["pages"][string]["template"]
    : never,
  components: Record<string, unknown>,
): Record<string, string> {
  const imports: Record<string, string> = {};
  const visit = (nodes: IrDocument["pages"][string]["template"]) => {
    for (const node of nodes) {
      switch (node.kind) {
        case "element":
          if (node.value.is_component && components[node.value.tag]) {
            imports[node.value.tag] = node.value.tag;
          }
          visit(node.value.children);
          break;
        case "conditional":
          for (const branch of node.value.branches) {
            visit(branch.body);
          }
          break;
        case "list":
          visit(node.value.body);
          break;
        case "fragment":
          visit(node.value);
          break;
      }
    }
  };
  visit(template);
  return imports;
}

function extractAppModule(root: string): AppModule {
  const appFile = resolve(root, "src", "app.tsx");
  if (!existsSync(appFile)) {
    return { lifecycle: {} };
  }

  return extractAppFromTsx(readFileSync(appFile, "utf8"), appFile);
}

const COMPONENT_RESOLUTION_EXTENSIONS = [".tsx", ".ts", ".jsx", ""];

/// BFS 加载页面 TSX 中引用到的相对路径组件 import。
///
/// 遵循的规则：
/// - 仅解析 `./` / `../` 起头的源说明符；裸名 import（如
///   `@astroforge/core`、`some-lib`）不在此处处理。
/// - 解析顺序：`.tsx` → `.ts` → `.jsx` → 无后缀（已带后缀）→ 目录下
///   `index.tsx` / `index.ts`。这与 TypeScript bundler 默认行为一致。
/// - 已加载过的文件在 `visitedFiles` 中标记，避免循环依赖死循环。
/// - 已存在于 `components` 表中的 kebab 标签直接跳过，避免重复覆盖。
/// - 递归加载该组件内部 import 的其它组件，保证整个组件树都进入 IR。
function loadCrossFileComponents(
  components: Record<string, IrDocument["components"][string]>,
  visitedFiles: Set<string>,
  parentFile: string,
  initial: ComponentImport[],
) {
  const queue: Array<{ parent: string; ref: ComponentImport }> = initial.map(
    (ref) => ({ parent: parentFile, ref }),
  );
  while (queue.length > 0) {
    const { parent, ref } = queue.shift()!;
    if (components[ref.tag]) continue;
    const resolved = resolveComponentImport(parent, ref.from);
    if (!resolved) continue;
    if (visitedFiles.has(resolved)) continue;
    visitedFiles.add(resolved);

    const source = readFileSync(resolved, "utf8");
    const result = extractComponentFromTsx(source, {
      filename: resolved,
      exportName: ref.exportName,
    });
    // 用 import 时声明的 kebab 标签作为表内主键，确保 JSX 模板中 `<Card />`
    // 能命中——本地名与默认导出标识符可能不一致（如 `import Foo from './Card'`）。
    components[ref.tag] = { ...result.component, name: ref.tag };
    for (const nested of result.componentImports) {
      queue.push({ parent: resolved, ref: nested });
    }
  }
}

function resolveComponentImport(parent: string, spec: string): string | undefined {
  const base = resolve(dirname(parent), spec);
  for (const ext of COMPONENT_RESOLUTION_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of [".tsx", ".ts", ".jsx"]) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function discoverPages(root: string): PageModule[] {
  const pagesRoot = resolve(root, "src", "pages");
  const pages = walkFiles(pagesRoot)
    .filter((file) => PAGE_EXTENSIONS.has(extname(file)))
    .map((file) => pageModuleFromFile(root, file));

  return pages.sort((a, b) => compareRoutes(a.route, b.route));
}

export function createRsbuildEntries(root: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const page of discoverPages(root)) {
    entries[entryNameFromRoute(page.route)] =
      `./${toPosix(relative(root, page.file))}`;
  }
  return entries;
}

export function defaultIrOutFile(root: string, cacheDir?: string): string {
  const dir = cacheDir
    ? resolve(root, cacheDir)
    : resolve(root, "node_modules/.cache/astroforge");
  return join(dir, "ir-document.json");
}

function createIrDocument(
  manifestInput: AstroForgeManifestInput,
  pages: PageModule[],
): IrDocument {
  const routerPages: Record<string, RoutePage> = {};
  for (const page of pages) {
    routerPages[page.route] = {
      component: page.component,
    };
  }

  // 强类型字段从输入派生，供 IR 消费方做派生计算与校验。
  // `source` 是用户原始 manifest 对象的浅拷贝（按书写顺序保留所有键），
  // 确保未在 `AstroForgeManifestInput` 中显式建模的字段（如
  // `subpackages`、`widgets`、`router.params`）也能透传至 Vela 产物。
  const source = manifestSource(manifestInput, pages[0].route, routerPages);

  const manifest: Manifest = {
    package: manifestInput.package,
    name: manifestInput.name,
    version_name: manifestInput.versionName,
    version_code: manifestInput.versionCode,
    min_platform_version: manifestInput.minPlatformVersion,
    icon: manifestInput.icon,
    simulation_version: manifestInput.simulationVersion ?? "default",
    device_type_list: manifestInput.deviceTypeList,
    features: manifestInput.features ?? [],
    config: {
      log_level: manifestInput.config?.logLevel,
      design_width: manifestInput.config?.designWidth,
    },
    router: {
      entry: pages[0].route,
      pages: routerPages,
    },
    source,
  };

  return {
    ir_version: IR_VERSION,
    manifest,
    app: {
      lifecycle: {},
    },
    pages: {},
    components: {},
    assets: [],
  };
}

function manifestSource(
  input: AstroForgeManifestInput,
  defaultEntry: string,
  routerPages: Record<string, RoutePage>,
): Record<string, JsonValue> {
  // 源对象 = 用户书写的 manifest 浅拷贝 + IR 默认值补齐。
  //
  // 顺序策略：
  // 1. 先按用户书写顺序写入用户提供的键，保留其在源 manifest 中的位置。
  // 2. 对 `simulationVersion` / `features` / `config` 这几个 Vela 必填但
  //    可省的键，未写时按 `Manifest::*` 同款默认值在合适位置补齐；这样
  //    Vela `manifest.json` 始终携带它们，避免运行时缺字段报错。
  // 3. 路由表始终从 IR 派生（避免源 manifest 与 src/pages 漂移），所以
  //    用户写不写 `router`，最终都以扫描结果为准。
  const source: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    source[key] = value as JsonValue;
  }
  if (!("simulationVersion" in source)) {
    source.simulationVersion = "default";
  }
  if (!("features" in source)) {
    source.features = [];
  }
  if (!("config" in source)) {
    source.config = {};
  }
  source.router = {
    entry: defaultEntry,
    pages: Object.fromEntries(
      Object.entries(routerPages).map(([route, page]) => [
        route,
        { component: page.component },
      ]),
    ),
  };
  return source;
}

function pageModuleFromFile(root: string, file: string): PageModule {
  const srcRoot = resolve(root, "src");
  const rel = stripExtension(toPosix(relative(srcRoot, file)));
  let route = rel;
  if (route.endsWith("/index")) {
    route = route.slice(0, -"/index".length);
  }

  const component = stripExtension(file.split(sep).at(-1) ?? "index");
  return {
    route,
    component,
    file,
  };
}

function walkFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function writeIrDocument(path: string, document: IrDocument) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}

function stripExtension(path: string): string {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) : path;
}

function entryNameFromRoute(route: string): string {
  return route.replace(/\//g, "_");
}

function compareRoutes(a: string, b: string): number {
  if (a === "pages/index") {
    return -1;
  }
  if (b === "pages/index") {
    return 1;
  }
  return a.localeCompare(b);
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
