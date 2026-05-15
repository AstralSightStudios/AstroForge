// JSX runtime 类型与运行期占位。
//
// 用户的 .tsx 在 Rsbuild 中以 `automatic` JSX transform 编译，jsxImportSource
// 指向 `@astroforge/core`。Rsbuild 会调用本文件导出的 `jsx` / `jsxs` / Fragment。
// 这些调用在 AstroForge 流水线中并不会执行——@astroforge/rsbuild-plugin 在
// 转换阶段直接抽取 JSX 树并构建 IR，最终产物由 Rust 后端生成。
//
// 保留这些导出是为了：
// 1) 让 IDE 与 tsc 在用户源码上类型检查正确；
// 2) 在不启用插件的情况下给出明确的运行期错误。

export type FC<P = {}> = (props: P) => unknown;
export type PropsWithChildren<P = {}> = P & { children?: unknown };

export namespace JSX {
  export interface IntrinsicAttributes {
    key?: unknown;
  }

  export interface IntrinsicElements {
    // 内置元素的占位声明。Phase 2 落地具体属性类型。
    [tag: string]: Record<string, unknown>;
  }
  export type Element = unknown;
}

const NOT_REACHABLE =
  "AstroForge: jsx 运行时不应被执行。请确认已启用 @astroforge/rsbuild-plugin。";

export function jsx(_type: unknown, _props: unknown, _key?: unknown): never {
  throw new Error(NOT_REACHABLE);
}

export function jsxs(_type: unknown, _props: unknown, _key?: unknown): never {
  throw new Error(NOT_REACHABLE);
}

export const Fragment: unique symbol = Symbol("astroforge.Fragment");
