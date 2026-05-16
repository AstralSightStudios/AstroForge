import type { AstroForgePluginOptions } from "@astralsight/astroforge-rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.resource",
    name: "fixture-17-resource-path",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.svg",
    deviceTypeList: ["watch"],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
