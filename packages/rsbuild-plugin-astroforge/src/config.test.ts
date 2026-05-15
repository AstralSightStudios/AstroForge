import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAstroForgeConfig, readAstroForgeConfig } from "./config";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../../fixtures/01-hello-text/astroforge");

describe("AstroForge config parser", () => {
  it("loads fixture 01 project config without evaluating TypeScript", () => {
    const config = readAstroForgeConfig(fixtureRoot);

    expect(config.manifest).toEqual({
      package: "com.astroforge.fixture.hello",
      name: "fixture-01-hello-text",
      versionName: "1.0.0",
      versionCode: 1,
      minPlatformVersion: 1200,
      icon: "/common/logo.png",
      deviceTypeList: ["watch"],
      config: { logLevel: "log", designWidth: "device-width" },
    });
    expect(config.plugin).toEqual({ target: "vela" });
  });

  it("rejects dynamic config values", () => {
    const source = readFileSync(
      resolve(fixtureRoot, "astroforge.config.ts"),
      "utf8",
    );
    const dynamic = source.replace(
      "'fixture-01-hello-text'",
      "process.env.APP_NAME",
    );

    expect(() => parseAstroForgeConfig(dynamic)).toThrow(
      "配置项仅支持可序列化字面量",
    );
  });
});
