import { Text, View } from '@astroforge/core';

// fixture 01：单页面、单文本节点，无样式无交互。
export default function IndexPage() {
  return (
    <View>
      <Text>Hello, Vela!</Text>
    </View>
  );
}
