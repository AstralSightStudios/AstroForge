import { Text, View, useState } from "@astroforge/core";

export default function IndexPage() {
  const [items, setItems] = useState([
    { id: "ada", name: "Ada" },
    { id: "grace", name: "Grace" },
  ]);

  return (
    <View>
      {items.map((item, idx) => (
        <View key={item.id}>
          <Text>{item.name}</Text>
          <Text>{idx}</Text>
        </View>
      ))}
    </View>
  );
}
