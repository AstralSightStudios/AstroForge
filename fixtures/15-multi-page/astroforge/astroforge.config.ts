import type { AstroForgePluginOptions } from "@astralsight/astroforge-rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.multi",
    name: "fixture-15-multi-page",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
