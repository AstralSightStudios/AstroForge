import { Text, View, router } from "@astroforge/core";

export default function IndexPage() {
  function goDetail() {
    router.push({ uri: "pages/detail" });
  }

  return (
    <View onClick={goDetail}>
      <Text>Open detail</Text>
    </View>
  );
}
