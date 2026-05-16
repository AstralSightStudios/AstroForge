# fixture 03 — image-asset

静态图片资源基线。用于验证 `Image` 的绝对资源路径会进入 IR 资产图，并在
AstroForge 与 aiot-toolkit 产物中以相同包内路径出现。

## 等价契约

- manifest icon 使用 `/common/logo.svg`。
- 页面图片使用 `/common/picture.svg`。
- 两个资源文件都进入最终 unpacked 目录。
