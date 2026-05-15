import { Text, View, storage } from "@astroforge/core";

export default function IndexPage() {
  function saveToken() {
    storage.set({ key: "token", value: "ready" });
  }

  return (
    <View onClick={saveToken}>
      <Text>Save</Text>
    </View>
  );
}
