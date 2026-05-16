import { Text, View, useState } from "@astralsight/astroforge-core";

export const lifecycle = {
  onInit() {
    console.log("page init");
  },

  onReady() {
    console.log("page ready");
  },
};

export default function IndexPage() {
  const [message, setMessage] = useState("Ready");

  return (
    <View>
      <Text>{message}</Text>
    </View>
  );
}
