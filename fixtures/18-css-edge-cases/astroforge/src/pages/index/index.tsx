import { Text, View } from "@astroforge/core";

export const styles = `
  /* Comments are ignored before selector parsing. */
  .card, #primary {
    width: 192px;
    color: #ffffff;
  }

  text {
    font-size: 24px;
  }

  @font-face {
    font-family: AstroForgeFixture;
    src: url("/common/fixture.woff");
  }

  @keyframes pulse {
    opacity: 1;
  }
`;

export default function IndexPage() {
  return (
    <View className="card">
      <Text>Styled</Text>
    </View>
  );
}
