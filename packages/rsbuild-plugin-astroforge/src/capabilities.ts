import {
  unsupportedCapabilities,
  type CapabilityIssue,
  type PlatformId,
} from "@astralsight/astroforge-core/platform";
import type { IrDocument, Node } from "./ir";

export function validatePlatformCapabilities(
  document: IrDocument,
  platform: PlatformId,
) {
  const apiLevel = document.manifest.min_platform_version;
  const declared = new Map<
    string,
    { kind: "feature" | "component"; name: string }
  >();

  for (const feature of document.manifest.features) {
    declared.set(`feature:${feature.name}`, {
      kind: "feature",
      name: feature.name,
    });
  }

  for (const tag of collectRenderableTags(document)) {
    declared.set(`component:${tag}`, { kind: "component", name: tag });
  }

  const issues = unsupportedCapabilities(declared.values(), platform, apiLevel);
  if (issues.length === 0) {
    return;
  }

  throw new Error(platformCapabilityMessage(issues));
}

function collectRenderableTags(document: IrDocument): Set<string> {
  const out = new Set<string>();
  for (const page of Object.values(document.pages)) {
    collectTagsFromNodes(page.template, out);
  }
  for (const component of Object.values(document.components)) {
    collectTagsFromNodes(component.template, out);
  }
  return out;
}

function collectTagsFromNodes(nodes: Node[], out: Set<string>) {
  for (const node of nodes) {
    switch (node.kind) {
      case "element":
        if (!node.value.is_component) {
          out.add(node.value.tag);
        }
        collectTagsFromNodes(node.value.children, out);
        break;
      case "conditional":
        for (const branch of node.value.branches) {
          collectTagsFromNodes(branch.body, out);
        }
        break;
      case "list":
        collectTagsFromNodes(node.value.body, out);
        break;
      case "fragment":
        collectTagsFromNodes(node.value, out);
        break;
    }
  }
}

function platformCapabilityMessage(issues: CapabilityIssue[]): string {
  const lines = issues.map((issue) => {
    const label = issue.kind === "feature" ? "接口" : "组件";
    if (issue.reason === "api-level") {
      return `- ${label} ${issue.name}: 当前 minPlatformVersion 低于 ${issue.required}`;
    }
    return `- ${label} ${issue.name}: 当前目标平台 ${issue.platform} 未声明支持`;
  });
  return [
    "AstroForge 平台能力校验失败。",
    "请移除这些使用，或为目标平台增加后端支持 / 条件编译分支：",
    ...lines,
  ].join("\n");
}
