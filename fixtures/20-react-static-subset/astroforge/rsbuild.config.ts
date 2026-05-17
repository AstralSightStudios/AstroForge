import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rsbuild/core";
import { pluginAstroForge } from "@astralsight/astroforge-rsbuild-plugin";
import astroforgeConfig from "./astroforge.config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@features": resolve(here, "src/features"),
    },
  },
  plugins: [pluginAstroForge(astroforgeConfig.plugin)],
});
