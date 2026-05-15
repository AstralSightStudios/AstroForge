// AstroForge 源码侧 hooks 声明。
//
// 源码可以使用 React-like 的开发模型，但生成的快应用代码不依赖 React 调度器。
// 前端转换识别受支持的 hook 调用，并下沉为后端可消费的 IR 字段。

type Updater<S> = S | ((prev: S) => S);
type SetState<S> = (next: Updater<S>) => void;

export function useState<S>(_initial: S | (() => S)): [S, SetState<S>] {
  throw new Error(
    "AstroForge: useState 仅可在 .tsx 源码中使用，由编译器静态展开。",
  );
}

export function useEffect(
  _fn: () => void | (() => void),
  _deps?: readonly unknown[],
): void {
  throw new Error(
    "AstroForge: useEffect 仅可在 .tsx 源码中使用，由编译器静态展开。",
  );
}

export function useRef<T>(_initial: T | null): { current: T | null } {
  throw new Error(
    "AstroForge: useRef 仅可在 .tsx 源码中使用，由编译器静态展开。",
  );
}

export function useMemo<T>(_fn: () => T, _deps: readonly unknown[]): T {
  throw new Error(
    "AstroForge: useMemo 仅可在 .tsx 源码中使用，由编译器静态展开。",
  );
}

export function useCallback<T extends (...args: never[]) => unknown>(
  _fn: T,
  _deps: readonly unknown[],
): T {
  throw new Error(
    "AstroForge: useCallback 仅可在 .tsx 源码中使用，由编译器静态展开。",
  );
}
