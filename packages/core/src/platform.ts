// 快应用平台能力目录。
//
// 该目录服务开发期诊断和未来多后端选择，不参与 Vela 产物字节生成。新增平台
// 时应先补齐这里的组件 / feature 支持矩阵，再接入对应后端。

export type PlatformId = "vela" | "blueos";
export type CapabilityKind = "component" | "feature";
export type CapabilityScope = "shared" | "vela" | "vela-internal";

export interface PlatformSupport {
  since?: number;
  note?: string;
}

export interface RuntimeCapability {
  name: string;
  kind: CapabilityKind;
  group: string;
  scope: CapabilityScope;
  platforms: Partial<Record<PlatformId, PlatformSupport>>;
}

export interface CapabilityIssue {
  name: string;
  kind: CapabilityKind;
  platform: PlatformId;
  reason: "unsupported" | "api-level";
  required?: number;
}

const vela = (
  since?: number,
): Partial<Record<PlatformId, PlatformSupport>> => ({
  vela: since ? { since } : {},
});

const velaShared = (
  since?: number,
): Partial<Record<PlatformId, PlatformSupport>> => ({
  vela: since ? { since } : {},
});

const component = (
  name: string,
  group: string,
  scope: CapabilityScope,
  platforms: Partial<Record<PlatformId, PlatformSupport>>,
): RuntimeCapability => ({
  name,
  kind: "component",
  group,
  scope,
  platforms,
});

const feature = (
  name: string,
  group: string,
  scope: CapabilityScope,
  platforms: Partial<Record<PlatformId, PlatformSupport>>,
): RuntimeCapability => ({
  name,
  kind: "feature",
  group,
  scope,
  platforms,
});

export const RENDER_COMPONENTS = [
  component("a", "basic", "shared", velaShared()),
  component("barcode", "basic", "shared", velaShared()),
  component("canvas", "canvas", "shared", velaShared()),
  component("chart", "visualization", "vela", vela()),
  component("div", "container", "shared", velaShared()),
  component("image", "basic", "shared", velaShared()),
  component("image-animator", "basic", "shared", velaShared()),
  component("input", "form", "shared", velaShared()),
  component("label", "form", "shared", velaShared()),
  component("list", "container", "shared", velaShared()),
  component("list-item", "container", "shared", velaShared()),
  component("marquee", "basic", "shared", velaShared()),
  component("media", "media", "vela", vela()),
  component("option", "form", "vela", vela()),
  component("picker", "form", "shared", velaShared()),
  component("popup", "overlay", "vela", vela()),
  component("progress", "basic", "shared", velaShared()),
  component("prompt", "overlay", "vela", vela()),
  component("qr", "basic", "vela", vela()),
  component("rating", "form", "vela", vela()),
  component("refresh", "container", "vela", vela()),
  component("refresh-footer", "container", "vela", vela()),
  component("refresh-header", "container", "vela", vela()),
  component("richtext", "basic", "vela", vela()),
  component("screen", "container", "vela", vela()),
  component("scroll", "container", "shared", velaShared()),
  component("select", "form", "vela", vela()),
  component("slider", "form", "shared", velaShared()),
  component("span", "basic", "vela", vela()),
  component("stack", "container", "shared", velaShared()),
  component("swiper", "container", "shared", velaShared()),
  component("switch", "form", "shared", velaShared()),
  component("tab-content", "container", "vela", vela()),
  component("tabbar", "container", "vela", vela()),
  component("tabs", "container", "vela", vela()),
  component("text", "basic", "shared", velaShared()),
  component("textarea", "form", "vela", vela()),
  component("video", "media", "vela", vela()),
] as const satisfies readonly RuntimeCapability[];

export const JS_FEATURES = [
  feature("locale", "i18n", "vela", vela()),
  feature("system.fetch", "network", "shared", velaShared()),
  feature("system.uploadtask", "network", "vela", vela()),
  feature("system.request", "network", "vela", vela()),
  feature("system.network", "network", "vela", vela()),
  feature("system.interconnect", "interconnect", "vela", vela()),
  feature("system.bluetooth.ble", "connectivity", "vela", vela()),
  feature("system.router", "navigation", "shared", velaShared()),
  feature("system.app", "app", "shared", velaShared()),
  feature("system.prompt", "ui", "shared", velaShared()),
  feature("system.storage", "storage", "shared", velaShared()),
  feature("system.file", "file", "shared", velaShared()),
  feature("system.zip", "file", "shared", velaShared()),
  feature("system.zlib", "file", "vela", vela()),
  feature("system.event", "event", "vela", vela()),
  feature("system.device", "device", "shared", velaShared()),
  feature("system.configuration", "device", "vela", vela()),
  feature("system.battery", "device", "vela", vela()),
  feature("system.brightness", "device", "vela", vela()),
  feature("system.sensor", "sensor", "shared", velaShared()),
  feature("system.geolocation", "location", "shared", velaShared()),
  feature("system.vibrator", "device", "shared", velaShared()),
  feature("system.volume", "media", "vela", vela()),
  feature("system.audio", "media", "shared", velaShared()),
  feature("system.media.session", "media", "vela", vela()),
  feature("system.record", "media", "shared", velaShared()),
  feature("system.crypto", "crypto", "vela", vela()),
  feature("system.cipher", "crypto", "shared", velaShared()),
  feature("system.protobuf", "codec", "vela", vela()),
  feature("system.mqttmessage", "codec", "vela", vela()),
  feature("system.exchange", "storage", "vela", vela()),
  feature("system.serviceclient", "service", "vela", vela()),
  feature("system.folme", "animation", "vela", vela()),
  feature("system.debug", "diagnostics", "vela", vela()),
  feature("jumpApp", "navigation", "vela", vela()),
  feature("system.internal.power", "internal", "vela-internal", vela()),
  feature("system.internal.package", "internal", "vela-internal", vela()),
  feature("system.internal.activity", "internal", "vela-internal", vela()),
  feature("system.messageChannel", "internal", "vela-internal", vela()),
] as const satisfies readonly RuntimeCapability[];

export const RUNTIME_CAPABILITIES = [
  ...RENDER_COMPONENTS,
  ...JS_FEATURES,
] as const satisfies readonly RuntimeCapability[];

export function findCapability(
  kind: CapabilityKind,
  name: string,
): RuntimeCapability | undefined {
  return RUNTIME_CAPABILITIES.find(
    (item) => item.kind === kind && item.name === name,
  );
}

export function checkCapability(
  capability: RuntimeCapability,
  platform: PlatformId,
  apiLevel?: number,
): CapabilityIssue | undefined {
  const support = capability.platforms[platform];
  if (!support) {
    return {
      name: capability.name,
      kind: capability.kind,
      platform,
      reason: "unsupported",
    };
  }

  if (
    typeof apiLevel === "number" &&
    typeof support.since === "number" &&
    apiLevel < support.since
  ) {
    return {
      name: capability.name,
      kind: capability.kind,
      platform,
      reason: "api-level",
      required: support.since,
    };
  }

  return undefined;
}

export function unsupportedCapabilities(
  names: Iterable<{ kind: CapabilityKind; name: string }>,
  platform: PlatformId,
  apiLevel?: number,
): CapabilityIssue[] {
  const issues: CapabilityIssue[] = [];
  for (const item of names) {
    const capability = findCapability(item.kind, item.name);
    if (!capability) {
      issues.push({
        name: item.name,
        kind: item.kind,
        platform,
        reason: "unsupported",
      });
      continue;
    }
    const issue = checkCapability(capability, platform, apiLevel);
    if (issue) issues.push(issue);
  }
  return issues;
}
