import type { AstroForgePluginOptions } from "@astralsight/astroforge-rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.navigation",
    name: "fixture-10-navigation",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    features: [{ name: "system.router" }],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
