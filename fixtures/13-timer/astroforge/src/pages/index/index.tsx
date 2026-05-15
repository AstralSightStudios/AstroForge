import { Text, View } from "@astroforge/core";

export default function IndexPage() {
  function startTimer() {
    setTimeout(() => {
      console.log("timer fired");
    }, 1000);
  }

  return (
    <View onClick={startTimer}>
      <Text>Start timer</Text>
    </View>
  );
}
