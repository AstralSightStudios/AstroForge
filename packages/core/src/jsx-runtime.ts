// Rsbuild 自动 JSX 转换使用的 JSX runtime 声明。
//
// AstroForge 在这些函数执行前消费 TSX 源码。保留这些导出是为了让 TypeScript、
// 编辑器以及误配置的运行路径获得确定行为。

export type FC<P = {}> = (props: P) => unknown;
export type PropsWithChildren<P = {}> = P & { children?: unknown };

export namespace JSX {
  export interface IntrinsicAttributes {
    key?: unknown;
  }

  export interface IntrinsicElements {
    // 接受任意 intrinsic element，以兼容 JSX 转换器和类型检查流程。
    [tag: string]: Record<string, unknown>;
  }
  export type Element = unknown;
}

const NOT_REACHABLE =
  "AstroForge: jsx 运行时不应被执行。请确认已启用 @astralsight/astroforge-rsbuild-plugin。";

export function jsx(_type: unknown, _props: unknown, _key?: unknown): never {
  throw new Error(NOT_REACHABLE);
}

export function jsxs(_type: unknown, _props: unknown, _key?: unknown): never {
  throw new Error(NOT_REACHABLE);
}

export const Fragment: unique symbol = Symbol("astroforge.Fragment");
