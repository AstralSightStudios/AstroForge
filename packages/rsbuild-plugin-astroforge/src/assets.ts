import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { AssetRef, Component, IrDocument, Node, Page } from "./ir";

export function collectAssets(root: string, document: IrDocument): AssetRef[] {
  const assets = new Map<string, AssetRef>();
  addAsset(root, document.manifest.icon, assets);
  collectCommonAssets(root, assets);
  for (const page of Object.values(document.pages)) {
    collectPageAssets(root, page, assets);
  }
  for (const component of Object.values(document.components)) {
    collectComponentAssets(root, component, assets);
  }
  return [...assets.values()];
}

function collectCommonAssets(root: string, assets: Map<string, AssetRef>) {
  const commonRoot = resolve(root, "src", "common");
  if (!existsSync(commonRoot)) return;
  for (const file of walkFiles(commonRoot)) {
    const rel = relative(resolve(root, "src"), file).split(sep).join("/");
    addAsset(root, `/${rel}`, assets);
  }
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(next));
    else if (entry.isFile()) out.push(next);
  }
  return out;
}

function collectPageAssets(
  root: string,
  page: Page,
  assets: Map<string, AssetRef>,
) {
  collectNodeAssets(root, page.template, assets);
  collectStyleAssets(root, page.style, assets);
}

function collectComponentAssets(
  root: string,
  component: Component,
  assets: Map<string, AssetRef>,
) {
  collectNodeAssets(root, component.template, assets);
  collectStyleAssets(root, component.style, assets);
}

function collectStyleAssets(
  root: string,
  style: Page["style"],
  assets: Map<string, AssetRef>,
) {
  for (const rule of style.rules) {
    for (const value of Object.values(rule.declarations)) {
      for (const path of extractCssUrls(value)) {
        addAsset(root, path, assets);
      }
    }
  }
}

function extractCssUrls(value: string): string[] {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^'")\s]+))\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    urls.push(match[1] ?? match[2] ?? match[3]);
  }

  return urls;
}

function collectNodeAssets(
  root: string,
  nodes: Node[],
  assets: Map<string, AssetRef>,
) {
  for (const node of nodes) {
    switch (node.kind) {
      case "element":
        if (node.value.tag === "image") {
          const src = node.value.attrs.src;
          if (src?.kind === "static" && typeof src.value === "string") {
            addAsset(root, src.value, assets);
          }
        }
        collectNodeAssets(root, node.value.children, assets);
        break;
      case "conditional":
        for (const branch of node.value.branches) {
          collectNodeAssets(root, branch.body, assets);
        }
        break;
      case "list":
        collectNodeAssets(root, node.value.body, assets);
        break;
      case "fragment":
        collectNodeAssets(root, node.value, assets);
        break;
    }
  }
}

function addAsset(root: string, path: string, assets: Map<string, AssetRef>) {
  if (!path.startsWith("/") || assets.has(path)) {
    return;
  }

  const sourcePath = resolve(root, "src", path.slice(1));
  if (!existsSync(sourcePath)) {
    return;
  }

  const bytes = readFileSync(sourcePath);
  assets.set(path, {
    path,
    source_path: sourcePath,
    digest: createHash("sha1").update(bytes).digest("hex"),
  });
}
