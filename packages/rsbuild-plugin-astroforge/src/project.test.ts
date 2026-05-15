import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  compileAstroForgeProject,
  createRsbuildEntries,
  discoverPages,
} from "./project";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const fixtureRoot = resolve(repoRoot, "fixtures/01-hello-text/astroforge");
const clickFixtureRoot = resolve(
  repoRoot,
  "fixtures/04-click-event/astroforge",
);
const counterFixtureRoot = resolve(
  repoRoot,
  "fixtures/05-use-state-counter/astroforge",
);
const conditionalFixtureRoot = resolve(
  repoRoot,
  "fixtures/06-conditional-render/astroforge",
);
const listFixtureRoot = resolve(repoRoot, "fixtures/07-list-render/astroforge");
const pageLifecycleFixtureRoot = resolve(
  repoRoot,
  "fixtures/08-page-lifecycle/astroforge",
);
const appLifecycleFixtureRoot = resolve(
  repoRoot,
  "fixtures/09-app-lifecycle/astroforge",
);

describe("AstroForge project compiler", () => {
  it("discovers pages and creates stable Rsbuild entries", () => {
    expect(discoverPages(fixtureRoot)).toEqual([
      {
        route: "pages/index",
        component: "index",
        file: resolve(fixtureRoot, "src/pages/index/index.tsx"),
      },
    ]);
    expect(createRsbuildEntries(fixtureRoot)).toEqual({
      pages_index: "./src/pages/index/index.tsx",
    });
  });

  it("emits fixture 01 IR matching the Rust snapshot and schema", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const result = compileAstroForgeProject({
      root: fixtureRoot,
      outFile,
    });
    const generated = JSON.parse(readFileSync(outFile, "utf8"));
    const expected = readRustFixtureSnapshot();

    expect(result.document).toEqual(expected);
    expect(generated).toEqual(expected);
    expect(validateIrDocument(generated)).toBe(true);
  });

  it("emits click-event IR with event binding and method source", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const { document } = compileAstroForgeProject({
      root: clickFixtureRoot,
      outFile,
    });

    const page = document.pages["pages/index"];
    expect(page.script.methods.handleClick).toBe(
      'function handleClick(evt) {\n  console.log("tap", evt);\n}',
    );
    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "div",
        events: {
          click: { path: "handleClick", is_callable: true },
        },
      },
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits use-state-counter IR with private data and lowered setter", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const { document } = compileAstroForgeProject({
      root: counterFixtureRoot,
      outFile,
    });

    const page = document.pages["pages/index"];
    expect(page.script.private_data).toEqual({ count: 0 });
    expect(page.script.methods.increment).toBe(
      "function increment() {\n  this.count = this.count + 1;\n}",
    );
    expect(page.template[0].kind).toBe("element");
    if (page.template[0].kind !== "element") {
      throw new Error("fixture 05 根节点应为 element");
    }
    expect(page.template[0].value.children[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "text",
        children: [
          {
            kind: "expression",
            value: { path: "count", is_callable: false },
          },
        ],
      },
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits conditional-render IR with a conditional node", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const { document } = compileAstroForgeProject({
      root: conditionalFixtureRoot,
      outFile,
    });

    const page = document.pages["pages/index"];
    expect(page.script.private_data).toEqual({ isReady: true });
    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        children: [
          {
            kind: "conditional",
            value: {
              branches: [
                {
                  guard: { path: "isReady", is_callable: false },
                },
                {
                  guard: null,
                },
              ],
            },
          },
        ],
      },
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits list-render IR with source, vars, key, and body", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const { document } = compileAstroForgeProject({
      root: listFixtureRoot,
      outFile,
    });

    const page = document.pages["pages/index"];
    expect(page.script.private_data).toEqual({
      items: [
        { id: "ada", name: "Ada" },
        { id: "grace", name: "Grace" },
      ],
    });
    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        children: [
          {
            kind: "list",
            value: {
              source: { path: "items", is_callable: false },
              item_var: "item",
              index_var: "idx",
              key: { path: "item.id", is_callable: false },
              body: [
                {
                  kind: "element",
                  value: {
                    tag: "div",
                    attrs: {},
                  },
                },
              ],
            },
          },
        ],
      },
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits page-lifecycle IR with script lifecycle methods", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const { document } = compileAstroForgeProject({
      root: pageLifecycleFixtureRoot,
      outFile,
    });

    const page = document.pages["pages/index"];
    expect(page.script.private_data).toEqual({ message: "Ready" });
    expect(page.script.lifecycle).toEqual({
      onInit: 'function onInit() {\n  console.log("page init");\n}',
      onReady: 'function onReady() {\n  console.log("page ready");\n}',
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits app-lifecycle IR with app lifecycle bodies", () => {
    const outFile = join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    );
    const { document } = compileAstroForgeProject({
      root: appLifecycleFixtureRoot,
      outFile,
    });

    expect(document.app.lifecycle).toEqual({
      onCreate: 'console.log("app created");',
      onDestroy: 'console.log("app destroyed");',
    });
    expect(validateIrDocument(document)).toBe(true);
  });
});

function readRustFixtureSnapshot() {
  const raw = readFileSync(
    resolve(
      repoRoot,
      "crates/astroforge-ir/tests/snapshots/snapshot_fixture_01__fixture_01_hello_text_ir_document.snap",
    ),
    "utf8",
  );
  const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("无法解析 fixture 01 Rust snapshot");
  }
  return JSON.parse(match[1]);
}

function validateIrDocument(value: unknown) {
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, "docs/ir-document.schema.json"), "utf8"),
  );
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(JSON.stringify(validate.errors, null, 2));
  }
  return true;
}
