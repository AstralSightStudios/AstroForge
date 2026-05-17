import { View } from "@astralsight/astroforge-core";
import SplashPage from "@features/entry/SplashPage";
import { SETTINGS } from "../../settings";

export default function IndexPage() {
  return (
    <View data-title="AstroForge">
      <SplashPage />
    </View>
  );
}
