import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { pluginAstroForge } from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../../fixtures/01-hello-text/astroforge");

describe("pluginAstroForge", () => {
  it("registers Rsbuild config and IR emission hooks", () => {
    const configHooks: Function[] = [];
    const buildHooks: Function[] = [];
    const devHooks: Function[] = [];
    const exposed = new Map<string, unknown>();
    const api = {
      context: { rootPath: fixtureRoot },
      logger: { info: vi.fn() },
      modifyRsbuildConfig(fn: Function) {
        configHooks.push(fn);
      },
      onBeforeBuild(fn: Function) {
        buildHooks.push(fn);
      },
      onBeforeDevCompile(fn: Function) {
        devHooks.push(fn);
      },
      expose(id: string, value: unknown) {
        exposed.set(id, value);
      },
    };

    pluginAstroForge().setup(api as any);

    expect(configHooks).toHaveLength(1);
    expect(buildHooks).toHaveLength(1);
    expect(devHooks).toHaveLength(1);
    expect(exposed.has("astroforge:ir")).toBe(true);

    const merged = configHooks[0](
      {},
      {
        mergeRsbuildConfig(_base: unknown, patch: unknown) {
          return patch;
        },
      },
    );
    expect(merged.source.entry).toEqual({
      pages_index: "./src/pages/index/index.tsx",
    });

    const swcConfig = merged.tools.swc({});
    expect(swcConfig.jsc.transform.react).toMatchObject({
      runtime: "automatic",
      importSource: "@astroforge/core",
    });
  });
});
