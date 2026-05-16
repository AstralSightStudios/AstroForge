import type { AstroForgePluginOptions } from "@astralsight/astroforge-rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.permission",
    name: "fixture-16-permission-manifest",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    features: [
      { name: "system.router" },
      { name: "system.storage" },
      { name: "system.fetch" },
    ],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
