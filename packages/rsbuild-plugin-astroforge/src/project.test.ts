import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const navigationFixtureRoot = resolve(
  repoRoot,
  "fixtures/10-navigation/astroforge",
);
const storageFixtureRoot = resolve(
  repoRoot,
  "fixtures/11-storage-api/astroforge",
);
const networkFixtureRoot = resolve(
  repoRoot,
  "fixtures/12-network-api/astroforge",
);
const timerFixtureRoot = resolve(repoRoot, "fixtures/13-timer/astroforge");
const nestedComponentFixtureRoot = resolve(
  repoRoot,
  "fixtures/14-nested-component/astroforge",
);
const multiPageFixtureRoot = resolve(
  repoRoot,
  "fixtures/15-multi-page/astroforge",
);
const permissionFixtureRoot = resolve(
  repoRoot,
  "fixtures/16-permission-manifest/astroforge",
);
const resourceFixtureRoot = resolve(
  repoRoot,
  "fixtures/17-resource-path/astroforge",
);
const cssFixtureRoot = resolve(
  repoRoot,
  "fixtures/18-css-edge-cases/astroforge",
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

    expect(withoutAssets(result.document)).toEqual(expected);
    expect(withoutAssets(generated)).toEqual(expected);
    expect(result.document.assets).toEqual([
      {
        path: "/common/logo.png",
        source_path: resolve(fixtureRoot, "src/common/logo.png"),
        digest: "dceecceee51e11be0f9fadd0e6fef0cafb5787e0",
      },
    ]);
    expect(generated.assets).toEqual(result.document.assets);
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

  it("emits navigation IR with router feature, routes, and bridge call", () => {
    const { document } = compileFixture(navigationFixtureRoot);

    expect(document.manifest.features).toEqual([{ name: "system.router" }]);
    expect(document.manifest.router.entry).toBe("pages/index");
    expect(Object.keys(document.pages)).toEqual([
      "pages/index",
      "pages/detail",
    ]);
    expect(document.pages["pages/index"].script.methods.goDetail).toContain(
      "router.push",
    );
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits storage-api IR with storage feature and bridge call", () => {
    const { document } = compileFixture(storageFixtureRoot);

    expect(document.manifest.features).toEqual([{ name: "system.storage" }]);
    expect(document.pages["pages/index"].script.methods.saveToken).toContain(
      "storage.set",
    );
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits network-api IR with fetch feature and bridge call", () => {
    const { document } = compileFixture(networkFixtureRoot);

    expect(document.manifest.features).toEqual([{ name: "system.fetch" }]);
    expect(document.pages["pages/index"].script.methods.load).toContain(
      "network.fetch",
    );
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits timer IR while preserving timer runtime calls", () => {
    const { document } = compileFixture(timerFixtureRoot);

    expect(document.pages["pages/index"].script.methods.startTimer).toContain(
      "setTimeout",
    );
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits nested-component IR with component imports and component template", () => {
    const { document } = compileFixture(nestedComponentFixtureRoot);

    const page = document.pages["pages/index"];
    const component = document.components["contact-card"];
    expect(page.imports).toEqual({ "contact-card": "contact-card" });
    expect(component).toBeDefined();
    if (!component) {
      throw new Error("fixture 14 应生成 contact-card 组件");
    }

    const root = page.template[0];
    expect(root.kind).toBe("element");
    if (root.kind !== "element") {
      throw new Error("fixture 14 页面根节点应为 element");
    }
    expect(root.value.children[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "contact-card",
        is_component: true,
        attrs: {
          name: { kind: "static", value: "Ada" },
        },
        events: {
          cardtap: { path: "handleCardTap", is_callable: true },
        },
      },
    });
    expect(component.template[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "div",
        events: {
          click: { path: "props.onCardTap", is_callable: true },
        },
        children: [
          {
            kind: "element",
            value: {
              tag: "text",
              children: [
                {
                  kind: "expression",
                  value: { path: "props.name", is_callable: false },
                },
              ],
            },
          },
        ],
      },
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits multi-page IR with stable entry ordering and Rsbuild entries", () => {
    const { document } = compileFixture(multiPageFixtureRoot);

    expect(document.manifest.router.entry).toBe("pages/index");
    expect(Object.keys(document.pages)).toEqual([
      "pages/index",
      "pages/settings",
    ]);
    expect(createRsbuildEntries(multiPageFixtureRoot)).toEqual({
      pages_index: "./src/pages/index/index.tsx",
      pages_settings: "./src/pages/settings/index.tsx",
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits permission-manifest IR with all declared features", () => {
    const { document } = compileFixture(permissionFixtureRoot);

    expect(document.manifest.features).toEqual([
      { name: "system.router" },
      { name: "system.storage" },
      { name: "system.fetch" },
    ]);
    expect(validateIrDocument(document)).toBe(true);
  });

  it("rejects features unsupported by the selected platform", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "astroforge-capability-"));
    const srcRoot = join(tmpRoot, "src");
    mkdirSync(join(srcRoot, "pages/index"), { recursive: true });
    mkdirSync(join(srcRoot, "common"), { recursive: true });
    writeFileSync(
      join(srcRoot, "pages/index/index.tsx"),
      `import { Text, View } from "@astralsight/astroforge-core";

export default function IndexPage() {
  return <View><Text>Unsupported feature</Text></View>;
}
`,
    );
    writeFileSync(
      join(tmpRoot, "astroforge.config.ts"),
      `export default {
  manifest: {
    package: "com.example.unsupported",
    name: "unsupported",
    versionName: "0.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    features: [{ name: "system.bluetooth" }],
  },
  plugin: { target: "vela" },
};
`,
    );
    writeFileSync(join(srcRoot, "common/logo.png"), Buffer.alloc(0));

    expect(() =>
      compileAstroForgeProject({
        root: tmpRoot,
        outFile: join(tmpRoot, "ir-document.json"),
      }),
    ).toThrow("接口 system.bluetooth");
  });

  it("emits resource-path IR with collected static image assets", () => {
    const { document } = compileFixture(resourceFixtureRoot);

    expect(document.assets).toEqual([
      {
        path: "/common/logo.svg",
        source_path: resolve(resourceFixtureRoot, "src/common/logo.svg"),
        digest: "83114282cbb35121ae4329da092b7001da930bcd",
      },
    ]);
    expect(document.pages["pages/index"].template[0]).toMatchObject({
      kind: "element",
      value: {
        children: [
          {
            kind: "element",
            value: {
              tag: "image",
              attrs: {
                src: { kind: "static", value: "/common/logo.svg" },
              },
            },
          },
        ],
      },
    });
    expect(validateIrDocument(document)).toBe(true);
  });

  it("emits css-edge-cases IR with parsed style rules", () => {
    const { document } = compileFixture(cssFixtureRoot);

    expect(document.assets).toEqual([
      {
        path: "/common/logo.png",
        source_path: resolve(cssFixtureRoot, "src/common/logo.png"),
        digest: "dceecceee51e11be0f9fadd0e6fef0cafb5787e0",
      },
      {
        path: "/common/fixture.woff",
        source_path: resolve(cssFixtureRoot, "src/common/fixture.woff"),
        digest: "3c21209a8c880a523ae59c2327aff5b888be4deb",
      },
    ]);
    expect(document.pages["pages/index"].style.rules).toEqual([
      {
        selectors: [
          { kind: "class", name: "card" },
          { kind: "id", name: "primary" },
        ],
        declarations: {
          width: "192px",
          color: "#ffffff",
        },
      },
      {
        selectors: [{ kind: "tag", name: "text" }],
        declarations: {
          "font-size": "24px",
        },
      },
      {
        selectors: [{ kind: "font_face", name: "font-face" }],
        declarations: {
          "font-family": "AstroForgeFixture",
          src: 'url("/common/fixture.woff")',
        },
      },
      {
        selectors: [{ kind: "keyframes", name: "pulse" }],
        declarations: {
          opacity: "1",
        },
      },
    ]);
    expect(validateIrDocument(document)).toBe(true);
  });

  it("preserves manifest source order and unknown fields end-to-end", () => {
    const { document } = compileFixture(fixtureRoot);
    expect(document.manifest.source).toBeDefined();
    const source = document.manifest.source!;
    // 用户书写顺序：package, name, versionName, versionCode, minPlatformVersion,
    // icon, deviceTypeList, config（fixture 01 没写 simulationVersion / features，
    // project.ts 自动补齐于尾部前），router 始终从扫描派生写到末尾。
    expect(Object.keys(source)).toEqual([
      "package",
      "name",
      "versionName",
      "versionCode",
      "minPlatformVersion",
      "icon",
      "deviceTypeList",
      "config",
      "simulationVersion",
      "features",
      "router",
    ]);
  });

  it("recursively loads cross-file components via relative imports", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "astroforge-crossfile-"));
    const srcRoot = join(tmpRoot, "src");
    mkdirSync(join(srcRoot, "pages/index"), { recursive: true });
    mkdirSync(join(srcRoot, "components"), { recursive: true });
    mkdirSync(join(srcRoot, "common"), { recursive: true });

    writeFileSync(
      join(srcRoot, "pages/index/index.tsx"),
      `import { View } from "@astralsight/astroforge-core";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";

export default function IndexPage() {
  return (
    <View>
      <Card />
      <Badge />
    </View>
  );
}
`,
    );
    writeFileSync(
      join(srcRoot, "components/Card.tsx"),
      `import { Text, View } from "@astralsight/astroforge-core";
import { Badge } from "./Badge";

export function Card() {
  return (
    <View>
      <Text>Card body</Text>
      <Badge />
    </View>
  );
}
`,
    );
    writeFileSync(
      join(srcRoot, "components/Badge.tsx"),
      `import { Text } from "@astralsight/astroforge-core";

export function Badge() {
  return <Text>Badge text</Text>;
}
`,
    );
    writeFileSync(
      join(tmpRoot, "astroforge.config.ts"),
      `export default {
  manifest: {
    package: "com.example.crossfile",
    name: "crossfile",
    versionName: "0.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
  },
};
`,
    );
    writeFileSync(join(srcRoot, "common/logo.png"), Buffer.alloc(0));

    const { document } = compileAstroForgeProject({
      root: tmpRoot,
      outFile: join(tmpRoot, "ir-document.json"),
    });
    // Card 与 Badge 都应进入 components 表（且 Badge 只加载一次：BFS 去重）。
    expect(Object.keys(document.components).sort()).toEqual(["badge", "card"]);
    expect(document.components.card.template[0]).toMatchObject({
      kind: "element",
    });
    expect(document.components.badge.template[0]).toMatchObject({
      kind: "element",
      value: { tag: "text" },
    });
    expect(document.pages["pages/index"].imports).toEqual({
      card: "card",
      badge: "badge",
    });
  });

  it("loads relative CSS imports into page style", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "astroforge-css-import-"));
    const srcRoot = join(tmpRoot, "src");
    mkdirSync(join(srcRoot, "pages/index"), { recursive: true });
    mkdirSync(join(srcRoot, "common"), { recursive: true });

    writeFileSync(
      join(srcRoot, "pages/index/index.tsx"),
      `import "./index.css";
import { View } from "@astralsight/astroforge-core";

export default function IndexPage() {
  return <View className="card" />;
}
`,
    );
    writeFileSync(
      join(srcRoot, "pages/index/index.css"),
      `.card { color: red; padding: 8px; }`,
    );
    writeFileSync(
      join(tmpRoot, "astroforge.config.ts"),
      `export default {
  manifest: {
    package: "com.example.css",
    name: "css",
    versionName: "0.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
  },
};
`,
    );
    writeFileSync(join(srcRoot, "common/logo.png"), Buffer.alloc(0));

    const { document } = compileAstroForgeProject({
      root: tmpRoot,
      outFile: join(tmpRoot, "ir-document.json"),
    });

    expect(document.pages["pages/index"].style.rules).toEqual([
      {
        selectors: [{ kind: "class", name: "card" }],
        declarations: { color: "red", padding: "8px" },
      },
    ]);
  });
});

function compileFixture(root: string) {
  return compileAstroForgeProject({
    root,
    outFile: join(
      mkdtempSync(join(tmpdir(), "astroforge-ir-")),
      "ir-document.json",
    ),
  });
}

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

function withoutAssets(document: any) {
  // Rust 快照里 manifest.source 字段缺失（snapshot 单测以 `source: None`
  // 构造 Manifest，serde `skip_serializing_if = "Option::is_none"` 略去）。
  // 此处剥离 manifest.source 让 TSX 端生成的文档与之等价比较；source 行为
  // 由 `manifest 源对象保留` 一节独立断言。
  const { manifest, ...rest } = document;
  const manifestWithoutSource = { ...manifest };
  delete manifestWithoutSource.source;
  return {
    ...rest,
    manifest: manifestWithoutSource,
    assets: [],
  };
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
