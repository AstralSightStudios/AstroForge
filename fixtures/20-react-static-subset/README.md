# fixture 20 — react-static-subset

React 常用写法的静态展开基线。验证 AstroForge 在不引入 React runtime 的前提下，
可以接受接近 React 组件书写习惯的源码，并下沉为 Vela 的 `private`、方法与
生命周期模型。

## 等价契约

- 页面通过 `@features/entry/SplashPage` 别名加载跨文件组件。
- 页面同时导入未出现在 JSX 标签中的 PascalCase 常量，提取器不得误判为组件。
- 组件使用 `useState(() => 初值)`、`useRef`、`useMemo`、`useCallback` 与
  `useEffect` cleanup。
- `setState` block-body updater 与 effect 内嵌套 closure 都必须 lower 为 VM
  状态赋值，不保留 React setter 符号。
- `<Fragment>` 只作为编译期分组，不生成自定义组件。
