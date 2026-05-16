import { Text, View, useState } from "@astralsight/astroforge-core";

export default function IndexPage() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount((prev) => prev + 1);
  }

  return (
    <View>
      <Text>{count}</Text>
      <View onClick={increment}>
        <Text>Increment</Text>
      </View>
    </View>
  );
}
