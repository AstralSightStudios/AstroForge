// 内置组件占位声明。
//
// 这些"组件"在运行时不存在为 React 组件——AstroForge 编译器在 IR 阶段识别这
// 些标识符并下沉为 Vela 运行时的内置标签（`div` / `text` / `image`）。本文件
// 仅提供 TS 类型与导出，便于用户在 TSX 中以 JSX 语法书写。

import type { FC, PropsWithChildren } from './jsx-runtime';

export interface ViewProps extends PropsWithChildren {
  className?: string;
  style?: Record<string, string | number>;
  onClick?: (evt: Event) => void;
}

export const View: FC<ViewProps> = () => {
  throw new Error(
    'AstroForge: <View> 在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。',
  );
};

export interface TextProps extends PropsWithChildren {
  className?: string;
  style?: Record<string, string | number>;
  value?: string;
}

export const Text: FC<TextProps> = () => {
  throw new Error(
    'AstroForge: <Text> 在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。',
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
    'AstroForge: <Image> 在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。',
  );
};
