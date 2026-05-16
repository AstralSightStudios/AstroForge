import type { AstroForgePluginOptions } from "@astroforge/rsbuild-plugin";

export default {
  manifest: {
    package: "com.astroforge.fixture.image",
    name: "fixture-03-image-asset",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.svg",
    deviceTypeList: ["watch"],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" } satisfies AstroForgePluginOptions,
};
