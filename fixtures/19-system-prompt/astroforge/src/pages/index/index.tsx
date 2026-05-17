import { Text, View, prompt } from "@astralsight/astroforge-core";

export default function IndexPage() {
  return (
    <View onClick={() => prompt.showToast({ message: "Prompt opened" })}>
      <Text>Show prompt</Text>
    </View>
  );
}
