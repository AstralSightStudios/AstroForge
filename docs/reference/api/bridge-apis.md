# 桥接 API 参考

本文档列出 Vela 运行时提供的系统桥接 API，通过 `@astralsight/astroforge-core` 导出。

## router

路由导航。

```tsx
import { router } from '@astralsight/astroforge-core';

// 页面跳转
router.push({ uri: 'pages/detail' });

// 返回
router.back();

// 替换当前页面
router.replace({ uri: 'pages/home' });

// 清空栈并跳转
router.clear({ uri: 'pages/home' });
```

## fetch

网络请求。

```tsx
import { fetch } from '@astralsight/astroforge-core';

fetch.fetch({
  url: 'https://api.example.com/data',
  method: 'GET',
  success(response) {
    console.log(response.data);
  },
  fail(error) {
    console.error(error);
  },
});
```

## storage

本地存储。

```tsx
import { storage } from '@astralsight/astroforge-core';

// 设置
storage.set({ key: 'token', value: 'abc123' });

// 获取
storage.get({ key: 'token', success(data) { console.log(data); } });

// 删除
storage.delete({ key: 'token' });

// 清空
storage.clear();
```

## prompt

提示框。

```tsx
import { prompt } from '@astralsight/astroforge-core';

// Toast
prompt.showToast({ message: '操作成功' });

// Dialog
prompt.showDialog({
  title: '提示',
  message: '确定删除？',
  buttons: [
    { text: '取消', color: '#999' },
    { text: '确定', color: '#1890ff' },
  ],
  success(buttonIndex) {
    console.log('点击了', buttonIndex);
  },
});
```

## app

应用信息。

```tsx
import { app } from '@astralsight/astroforge-core';

// 获取应用信息
const info = app.getInfo();
console.log(info.packageName);

// 退出应用
app.terminate();
```

## device

设备信息。

```tsx
import { device } from '@astralsight/astroforge-core';

// 获取设备信息
const info = device.getInfo();
console.log(info.model);
console.log(info.screenWidth);
console.log(info.screenHeight);
```

## sensor

传感器。

```tsx
import { sensor } from '@astralsight/astroforge-core';

// 加速度计
sensor.subscribeAccelerometer({ callback(data) {
  console.log(data.x, data.y, data.z);
}});

// 陀螺仪
sensor.subscribeGyroscope({ callback(data) {
  console.log(data.x, data.y, data.z);
}});
```

## geolocation

地理位置。

```tsx
import { geolocation } from '@astralsight/astroforge-core';

geolocation.getLocation({
  success(data) {
    console.log(data.latitude, data.longitude);
  },
});
```

## vibrator

振动。

```tsx
import { vibrator } from '@astralsight/astroforge-core';

vibrator.vibrate({ mode: 'long' });
```

## 完整模块列表

| 模块 | 说明 |
|------|------|
| `app` | 应用信息 |
| `audio` | 音频 |
| `cipher` | 加密 |
| `console` | 日志（全局可用） |
| `device` | 设备信息 |
| `file` | 文件系统 |
| `geolocation` | 地理位置 |
| `network` | 网络状态 |
| `prompt` | 提示框 |
| `record` | 录音 |
| `router` | 路由导航 |
| `sensor` | 传感器 |
| `storage` | 本地存储 |
| `vibrator` | 振动 |
| `zip` | 压缩/解压 |

## 注意事项

1. 使用桥接 API 前需在 `manifest.json` 的 `features` 中声明对应权限
2. 桥接 API 的调用方式与官方 UX 项目一致
3. 部分 API 在模拟器和真机上的行为可能有差异，建议真机测试
