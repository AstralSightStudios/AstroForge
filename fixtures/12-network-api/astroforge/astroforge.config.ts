import type { AstroForgePluginOptions } from "@astroforge/rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.network",
    name: "fixture-12-network-api",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    features: [{ name: "system.fetch" }],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
