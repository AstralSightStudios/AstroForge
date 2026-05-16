import { Text, View } from "@astroforge/core";

export const styles = `
  .card {
    width: 192px;
    color: #ffffff;
  }

  text {
    font-size: 24px;
  }
`;

export default function IndexPage() {
  return (
    <View className="card">
      <Text>Styled</Text>
    </View>
  );
}
