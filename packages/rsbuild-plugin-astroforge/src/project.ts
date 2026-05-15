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
import type { AppModule, IrDocument, Manifest, RoutePage } from "./ir";
import { IR_VERSION } from "./ir";
import { extractAppFromTsx, extractPageModuleFromTsx } from "./tsx";

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
  for (const page of pages) {
    const source = readFileSync(page.file, "utf8");
    const module = extractPageModuleFromTsx(source, {
      route: page.route,
      filename: page.file,
    });
    document.pages[page.route] = module.page;
    for (const [name, component] of Object.entries(module.components)) {
      document.components[name] = component;
    }
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

function extractAppModule(root: string): AppModule {
  const appFile = resolve(root, "src", "app.tsx");
  if (!existsSync(appFile)) {
    return { lifecycle: {} };
  }

  return extractAppFromTsx(readFileSync(appFile, "utf8"), appFile);
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
