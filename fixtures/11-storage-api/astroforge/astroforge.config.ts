import type { AstroForgePluginOptions } from "@astralsight/astroforge-rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.storage",
    name: "fixture-11-storage-api",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    features: [{ name: "system.storage" }],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
