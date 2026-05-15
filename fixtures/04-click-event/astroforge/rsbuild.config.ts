import { defineConfig } from "@rsbuild/core";
import { pluginAstroForge } from "@astroforge/rsbuild-plugin";
import astroforgeConfig from "./astroforge.config";

export default defineConfig({
  plugins: [pluginAstroForge(astroforgeConfig.plugin)],
});
