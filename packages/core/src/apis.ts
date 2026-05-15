// 源码侧系统 API 声明。
//
// 这些函数定义后端下沉可映射到厂商 bridge 的开发接口。若在开发机 JS runtime
// 中直接执行，说明缺少 AstroForge 编译步骤或入口不受支持。

export interface RouterPushOptions {
  uri: string;
  params?: Record<string, string | number | boolean>;
}

export const router = {
  push(_options: RouterPushOptions): void {
    throw new Error("AstroForge: router API 仅可在设备运行时使用。");
  },
  replace(_options: RouterPushOptions): void {
    throw new Error("AstroForge: router API 仅可在设备运行时使用。");
  },
  back(): void {
    throw new Error("AstroForge: router API 仅可在设备运行时使用。");
  },
};

export const storage = {
  get(_options: { key: string }): void {
    throw new Error("AstroForge: storage API 仅可在设备运行时使用。");
  },
  set(_options: { key: string; value: string }): void {
    throw new Error("AstroForge: storage API 仅可在设备运行时使用。");
  },
  delete(_options: { key: string }): void {
    throw new Error("AstroForge: storage API 仅可在设备运行时使用。");
  },
};

export const network = {
  fetch(_options: {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    data?: Record<string, unknown>;
  }): void {
    throw new Error("AstroForge: network API 仅可在设备运行时使用。");
  },
};
