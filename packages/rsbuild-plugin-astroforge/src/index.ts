import type { RsbuildPlugin } from "@rsbuild/core";
import type { PlatformId } from "@astroforge/core/platform";
import type { AstroForgeManifestInput } from "./config";
import {
  compileAstroForgeProject,
  createRsbuildEntries,
  defaultIrOutFile,
} from "./project";

export interface AstroForgePluginOptions {
  // 目标后端。能力校验可识别多平台，当前实际构建仅支持 `'vela'`。
  target?: PlatformId;

  // IR / 中间产物目录。默认 `node_modules/.cache/astroforge/`。
  cacheDir?: string;

  // 项目根目录。默认使用 Rsbuild context 中的 rootPath。
  root?: string;

  // AstroForge 配置文件路径，按项目根目录解析。
  configFile?: string;

  // 直接传入 manifest，适用于没有 `astroforge.config.ts` 的集成测试或上层 CLI。
  manifest?: AstroForgeManifestInput;

  // 显式指定 IR 输出文件。优先级高于 `cacheDir`。
  outFile?: string;
}

export function pluginAstroForge(
  options: AstroForgePluginOptions = {},
): RsbuildPlugin {
  const target = options.target ?? "vela";
  if (target !== "vela") {
    throw new Error(`@astroforge/rsbuild-plugin: 暂不支持 target=${target}`);
  }

  return {
    name: "@astroforge/rsbuild-plugin",
    setup(api) {
      const root = () => options.root ?? api.context.rootPath;
      const outFile = () =>
        options.outFile ?? defaultIrOutFile(root(), options.cacheDir);

      api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
        const entries = createRsbuildEntries(root());

        return mergeRsbuildConfig(config, {
          source: {
            entry: entries,
          },
          tools: {
            swc(swcConfig: any) {
              swcConfig.jsc ??= {};
              swcConfig.jsc.transform ??= {};
              swcConfig.jsc.transform.react = {
                ...swcConfig.jsc.transform.react,
                runtime: "automatic",
                importSource: "@astroforge/core",
              };
              return swcConfig;
            },
          },
        });
      });

      const emitIr = () => {
        const result = compileAstroForgeProject({
          root: root(),
          configFile: options.configFile,
          cacheDir: options.cacheDir,
          outFile: options.outFile,
          config: options.manifest ? { manifest: options.manifest } : undefined,
        });
        api.logger.info(
          `AstroForge IR 已写入 ${outFile()}，页面数：${result.pages.length}`,
        );
      };

      api.onBeforeBuild(emitIr);
      api.onBeforeDevCompile(emitIr);
      api.expose("astroforge:ir", { emitIr, outFile });
    },
  };
}

export type {
  AstroForgeManifestInput,
  AstroForgePluginConfig,
  AstroForgeProjectConfig,
} from "./config";
export { parseAstroForgeConfig, readAstroForgeConfig } from "./config";
export type {
  CompileProjectOptions,
  CompileProjectResult,
  PageModule,
} from "./project";
export {
  compileAstroForgeProject,
  createRsbuildEntries,
  defaultIrOutFile,
  discoverPages,
} from "./project";
export { extractPageFromTsx } from "./tsx";
export type * from "./ir";
