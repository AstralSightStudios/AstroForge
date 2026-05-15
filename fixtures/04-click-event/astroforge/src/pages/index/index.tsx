import { Text, View } from "@astroforge/core";

export default function IndexPage() {
  function handleClick(evt: unknown) {
    console.log("tap", evt);
  }

  return (
    <View onClick={handleClick}>
      <Text>Tap me</Text>
    </View>
  );
}
