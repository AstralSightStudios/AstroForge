import { Text, View, network } from "@astralsight/astroforge-core";

export default function IndexPage() {
  function load() {
    network.fetch({ url: "https://example.com/api", method: "GET" });
  }

  return (
    <View onClick={load}>
      <Text>Load</Text>
    </View>
  );
}
