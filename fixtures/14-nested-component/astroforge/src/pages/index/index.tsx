import { Text, View } from "@astroforge/core";

function ContactCard(props: {
  name: string;
  onCardTap?: (evt: Event) => void;
}) {
  return (
    <View onClick={props.onCardTap}>
      <Text>{props.name}</Text>
    </View>
  );
}

export default function IndexPage() {
  function handleCardTap(evt: Event) {
    console.log(evt);
  }

  return (
    <View>
      <ContactCard name="Ada" onCardTap={handleCardTap} />
    </View>
  );
}
