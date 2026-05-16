import { Image, Text, View } from "@astroforge/core";

// 首页入口。文件位于 `src/pages/index/index.tsx`，按约定 entry 路由为
// `pages/index`。`<View>` / `<Text>` / `<Image>` 来自 @astroforge/core，
// 在编译期被下沉为 Vela 厂商运行时的 `aiot.__ce__` 调用。
export const styles = `
  .root {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 32px;
  }

  .title {
    font-size: 32px;
    color: #ffffff;
  }

  .logo {
    width: 96px;
    height: 96px;
    margin-bottom: 16px;
  }
`;

export default function IndexPage() {
  return (
    <View className="root">
      <Image className="logo" src="/common/logo.svg" />
      <Text className="title">Hello, AstroForge!</Text>
    </View>
  );
}
