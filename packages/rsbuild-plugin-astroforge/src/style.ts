import type { Selector, SelectorKind, StyleTable } from "./ir";

export function parseStyleTable(source: string): StyleTable {
  const rules = [];
  const css = stripComments(source);
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(css))) {
    const selectorSource = match[1].trim();
    const body = match[2].trim();
    if (!selectorSource || !body) {
      continue;
    }

    rules.push({
      selectors: selectorSource
        .split(",")
        .map((selector) => parseSelector(selector.trim())),
      declarations: parseDeclarations(body),
    });
  }

  return { rules };
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseSelector(selector: string): Selector {
  if (selector === "@font-face") {
    return { kind: "font_face", name: "font-face" };
  }
  if (selector.startsWith("@keyframes ")) {
    return {
      kind: "keyframes",
      name: selector.slice("@keyframes ".length).trim(),
    };
  }
  if (selector.startsWith(".")) {
    return { kind: "class", name: selector.slice(1) };
  }
  if (selector.startsWith("#")) {
    return { kind: "id", name: selector.slice(1) };
  }

  return { kind: selectorKindForTag(selector), name: selector };
}

function selectorKindForTag(_selector: string): SelectorKind {
  return "tag";
}

function parseDeclarations(body: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const item of body.split(";")) {
    const declaration = item.trim();
    if (!declaration) {
      continue;
    }

    const colon = declaration.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const key = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (key && value) {
      declarations[key] = value;
    }
  }
  return declarations;
}
