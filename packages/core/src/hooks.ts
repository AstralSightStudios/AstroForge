// hooks 占位声明。
//
// 用户在 TSX 中以 React 语法调用，AstroForge 编译器在 IR 阶段识别这些标识符
// 并下沉为 Vela 运行时的响应式数据 / 副作用注册。运行时不存在真正的 React
// 调度器，因此本文件仅提供类型；任何实际调用将触发错误。

type Updater<S> = S | ((prev: S) => S);
type SetState<S> = (next: Updater<S>) => void;

export function useState<S>(_initial: S | (() => S)): [S, SetState<S>] {
  throw new Error('AstroForge: useState 仅可在 .tsx 源码中使用，由编译器静态展开。');
}

export function useEffect(_fn: () => void | (() => void), _deps?: readonly unknown[]): void {
  throw new Error('AstroForge: useEffect 仅可在 .tsx 源码中使用，由编译器静态展开。');
}

export function useRef<T>(_initial: T | null): { current: T | null } {
  throw new Error('AstroForge: useRef 仅可在 .tsx 源码中使用，由编译器静态展开。');
}

export function useMemo<T>(_fn: () => T, _deps: readonly unknown[]): T {
  throw new Error('AstroForge: useMemo 仅可在 .tsx 源码中使用，由编译器静态展开。');
}

export function useCallback<T extends (...args: never[]) => unknown>(
  _fn: T,
  _deps: readonly unknown[],
): T {
  throw new Error('AstroForge: useCallback 仅可在 .tsx 源码中使用，由编译器静态展开。');
}
