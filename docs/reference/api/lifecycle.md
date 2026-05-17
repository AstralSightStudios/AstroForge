# 生命周期参考

本文档列出 Vela 快应用的所有页面和应用生命周期。

## 页面生命周期

| 生命周期 | 触发时机 | 参数 |
|---------|---------|------|
| `onInit` | 页面初始化 | 无 |
| `onReady` | 页面就绪，DOM 构建完成 | 无 |
| `onShow` | 页面显示 | 无 |
| `onHide` | 页面隐藏 | 无 |
| `onDestroy` | 页面销毁 | 无 |
| `onBackPress` | 用户点击返回键 | 无 |
| `onMenuPress` | 用户点击菜单键 | `{ index: number }` |
| `onRefresh` | 下拉刷新触发 | 无 |
| `onReachTop` | 滚动到顶部 | 无 |
| `onReachBottom` | 滚动到底部 | 无 |

### 声明方式

```tsx
export const lifecycle = {
  onInit() {
    console.log('init');
  },
  onReady() {
    console.log('ready');
  },
  onShow() {
    console.log('show');
  },
  onHide() {
    console.log('hide');
  },
  onDestroy() {
    console.log('destroy');
  },
};

export default function Page() {
  return (...);
}
```

## 应用生命周期

| 生命周期 | 触发时机 |
|---------|---------|
| `onCreate` | 应用创建 |
| `onDestroy` | 应用销毁 |
| `onError` | 应用错误 |
| `onPageNotFound` | 页面未找到 |

### 声明方式

```tsx
// src/app.tsx
export default {
  onCreate() {
    console.log('app created');
  },
  onDestroy() {
    console.log('app destroyed');
  },
};
```

## 生命周期对照

| 场景 | 调用顺序 |
|------|---------|
| 首次进入页面 | `app.onCreate` → `page.onInit` → `page.onReady` → `page.onShow` |
| 切换到其他页面 | `page.onHide` |
| 返回当前页面 | `page.onShow` |
| 返回键退出 | `page.onBackPress` → `page.onHide` → `page.onDestroy` |
| 应用被销毁 | `page.onDestroy` → `app.onDestroy` |

## 异步生命周期

所有生命周期方法都支持 `async/await`：

```tsx
export const lifecycle = {
  async onReady() {
    const data = await fetchData();
    this.data = data;
  },
};
```

## 与 useEffect 的关系

```tsx
useEffect(() => {
  // 等效于 onReady
  console.log('ready');

  return () => {
    // 等效于 onDestroy
    console.log('cleanup');
  };
}, []);
```
