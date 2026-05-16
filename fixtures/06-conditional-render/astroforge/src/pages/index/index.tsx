import { Text, View, useState } from "@astralsight/astroforge-core";

export default function IndexPage() {
  const [isReady, setIsReady] = useState(true);

  return <View>{isReady ? <Text>Ready</Text> : <Text>Loading</Text>}</View>;
}
