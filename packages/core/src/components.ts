// AstroForge 源码侧内置组件声明。
//
// 这些导出仅作为类型声明与编译期标记使用。前端转换会将其解析为 Component IR
// 标签，目标后端负责生成对应快应用运行时代码。

import type { FC, PropsWithChildren } from "./jsx-runtime";

export interface ViewProps extends PropsWithChildren {
  className?: string;
  style?: Record<string, string | number>;
  onClick?: (evt: Event) => void;
}

export const View: FC<ViewProps> = () => {
  throw new Error(
    "AstroForge: <View> 在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。",
  );
};

export interface TextProps extends PropsWithChildren {
  className?: string;
  style?: Record<string, string | number>;
  value?: string;
}

export const Text: FC<TextProps> = () => {
  throw new Error(
    "AstroForge: <Text> 在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。",
  );
};

export interface ImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: Record<string, string | number>;
}

export const Image: FC<ImageProps> = () => {
  throw new Error(
    "AstroForge: <Image> 在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。",
  );
};
