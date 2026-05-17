# 生命周期映射

本文档详细说明 UX 生命周期与 AstroForge 的对应关系。

## 生命周期对照表

| UX 生命周期 | AstroForge 等价写法 | 触发时机 |
|------------|---------------------|---------|
| `onInit()` | `lifecycle.onInit()` / `useEffect(() => {}, [])` | 页面/组件初始化 |
| `onReady()` | `lifecycle.onReady()` / `useEffect(() => {}, [])` | 页面就绪 |
| `onShow()` | `lifecycle.onShow()` | 页面显示 |
| `onHide()` | `lifecycle.onHide()` | 页面隐藏 |
| `onDestroy()` | `lifecycle.onDestroy()` / `useEffect cleanup` | 页面/组件销毁 |
| `onBackPress()` | `lifecycle.onBackPress()` | 返回键按下 |
| `onMenuPress()` | `lifecycle.onMenuPress()` | 菜单键按下 |
| `onRefresh()` | `lifecycle.onRefresh()` | 下拉刷新 |
| `onReachTop()` | `lifecycle.onReachTop()` | 滚动到顶部 |
| `onReachBottom()` | `lifecycle.onReachBottom()` | 滚动到底部 |

## 声明方式

### 页面生命周期

```tsx
export const lifecycle = {
  onInit() {
    console.log('页面初始化');
  },
  onReady() {
    console.log('页面就绪');
  },
  onShow() {
    console.log('页面显示');
  },
  onHide() {
    console.log('页面隐藏');
  },
  onDestroy() {
    console.log('页面销毁');
  },
};

export default function Page() {
  return (...);
}
```

### App 生命周期

```tsx
// src/app.tsx
export default {
  onCreate() {
    console.log('应用创建');
  },
  onDestroy() {
    console.log('应用销毁');
  },
};
```

## useEffect 与生命周期的关系

`useEffect` 是声明生命周期的 React 风格方式：

```tsx
import { useEffect, useState } from '@astralsight/astroforge-core';

export default function Page() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // 等效于 onReady
    console.log('组件就绪');
    fetchData().then(setData);

    return () => {
      // 等效于 onDestroy
      console.log('组件销毁');
    };
  }, []);

  return (...);
}
```

编译结果：
- effect 函数体 → `lifecycle.onReady`
- cleanup 函数 → `lifecycle.onDestroy`

## 带参数的生命周期

UX 中部分生命周期接收参数：

```ux
<script>
export default {
  onMenuPress({ index }) {
    console.log('菜单项', index);
  }
}
</script>
```

AstroForge 中同样支持：

```tsx
export const lifecycle = {
  onMenuPress(evt: any) {
    console.log('菜单项', evt.index);
  },
};
```

## 异步生命周期

支持 async/await：

```tsx
export const lifecycle = {
  async onReady() {
    const data = await fetchData();
    console.log(data);
  },
};
```

编译后保留 `async function` 关键字。

## 下一步

[状态与逻辑迁移](08-state-and-logic.md)
