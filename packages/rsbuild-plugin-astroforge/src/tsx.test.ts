import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractAppFromTsx,
  extractPageFromTsx,
  extractPageModuleFromTsx,
} from "./tsx";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../../fixtures/01-hello-text/astroforge");

describe("TSX extraction", () => {
  it("extracts fixture 01 into Component IR", () => {
    const file = resolve(fixtureRoot, "src/pages/index/index.tsx");
    const page = extractPageFromTsx(readFileSync(file, "utf8"), {
      route: "pages/index",
      filename: file,
    });

    expect(page).toEqual({
      route: "pages/index",
      imports: {},
      template: [
        {
          kind: "element",
          value: {
            tag: "div",
            is_component: false,
            attrs: {},
            events: {},
            children: [
              {
                kind: "element",
                value: {
                  tag: "text",
                  is_component: false,
                  attrs: {},
                  events: {},
                  children: [{ kind: "text", value: "Hello, Vela!" }],
                },
              },
            ],
          },
        },
      ],
      script: {
        props: {},
        private_data: {},
        methods: {},
        lifecycle: {},
      },
      style: {
        rules: [],
      },
    });
  });

  it("extracts inline object style as a static JSON value", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View } from '@astroforge/core';
        export default function Page() {
          return (
            <View style={{ color: 'red', fontSize: 16, padding: -8 }}>
              <Text style={{ fontWeight: 'bold' }}>x</Text>
            </View>
          );
        }
      `,
      { route: "pages/index" },
    );

    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        attrs: {
          style: {
            kind: "static",
            value: { color: "red", fontSize: 16, padding: -8 },
          },
        },
      },
    });
    expect((page.template[0] as any).value.children[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "text",
        attrs: {
          style: { kind: "static", value: { fontWeight: "bold" } },
        },
      },
    });
  });

  it("extracts mixed inline object style as per-slot values", () => {
    const page = extractPageFromTsx(
      `
        import { View, useState } from '@astroforge/core';
        export default function Page() {
          const [theme, setTheme] = useState({ color: 'red' });
          return <View style={{ color: theme.color, fontSize: 16 }} />;
        }
      `,
      { route: "pages/index" },
    );

    expect((page.template[0] as any).value.attrs.style).toEqual({
      kind: "style_object",
      value: [
        {
          name: "color",
          value: {
            kind: "dynamic",
            value: { path: "theme.color", is_callable: false },
          },
        },
        { name: "fontSize", value: { kind: "static", value: 16 } },
      ],
    });
  });

  it("accepts static array literal attributes (classList-style)", () => {
    const page = extractPageFromTsx(
      `
        import { View } from '@astroforge/core';
        export default function Page() {
          return <View data-tags={["primary", "card"]} />;
        }
      `,
      { route: "pages/index" },
    );

    expect((page.template[0] as any).value.attrs["data-tags"]).toEqual({
      kind: "static",
      value: ["primary", "card"],
    });
  });

  it("normalizes static attributes and event bindings", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View } from '@astroforge/core';
        export default function Page() {
          return <View className="card" onClick={handleClick}><Text>{title}</Text></View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        attrs: {
          class: { kind: "static", value: "card" },
        },
        events: {
          click: { path: "handleClick", is_callable: true },
        },
      },
    });
    expect(page.script.methods.handleClick).toBeUndefined();
  });

  it("maps extended built-in components to Vela tag names", () => {
    const page = extractPageFromTsx(
      `
        import { List, ListItem, QR, Slider, Swiper, Text } from '@astroforge/core';
        export default function Page() {
          return (
            <List>
              <ListItem>
                <Swiper autoPlay={true}><Text>slide</Text></Swiper>
                <Slider value={40} />
                <QR value="astroforge" />
              </ListItem>
            </List>
          );
        }
      `,
      { route: "pages/index" },
    );

    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "list",
        is_component: false,
        children: [
          {
            kind: "element",
            value: {
              tag: "list-item",
              is_component: false,
              children: [
                {
                  kind: "element",
                  value: {
                    tag: "swiper",
                    attrs: {
                      "auto-play": { kind: "static", value: true },
                    },
                  },
                },
                { kind: "element", value: { tag: "slider" } },
                { kind: "element", value: { tag: "qr" } },
              ],
            },
          },
        ],
      },
    });
  });

  it("lowers function handlers into script methods", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View } from '@astroforge/core';
        export default function Page() {
          function handleClick() {
            console.log("clicked");
          }
          return <View className="card" onClick={handleClick}><Text>{title}</Text></View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.methods.handleClick).toBe(
      'function handleClick() {\n  console.log("clicked");\n}',
    );
    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        attrs: {
          class: { kind: "static", value: "card" },
        },
        events: {
          click: { path: "handleClick", is_callable: true },
        },
      },
    });
  });

  it("lowers useState declarations and setter calls into Page IR script fields", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astroforge/core';
        export default function Page() {
          const [count, setCount] = useState(0);
          function increment() {
            setCount((prev) => prev + 1);
          }
          return <View><Text>{count}</Text><View onClick={increment}><Text>Increment</Text></View></View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({ count: 0 });
    expect(page.script.methods.increment).toBe(
      "function increment() {\n  this.count = this.count + 1;\n}",
    );
    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        children: [
          {
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
          },
          {
            kind: "element",
            value: {
              events: {
                click: { path: "increment", is_callable: true },
              },
            },
          },
        ],
      },
    });
  });

  it("lowers ternary JSX into conditional Component IR", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astroforge/core';
        export default function Page() {
          const [isReady, setIsReady] = useState(true);
          return <View>{isReady ? <Text>Ready</Text> : <Text>Loading</Text>}</View>;
        }
      `,
      { route: "pages/index" },
    );

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
                  body: [
                    {
                      kind: "element",
                      value: {
                        tag: "text",
                        children: [{ kind: "text", value: "Ready" }],
                      },
                    },
                  ],
                },
                {
                  guard: null,
                  body: [
                    {
                      kind: "element",
                      value: {
                        tag: "text",
                        children: [{ kind: "text", value: "Loading" }],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
  });

  it("lowers Array.map JSX into list Component IR", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astroforge/core';
        export default function Page() {
          const [items, setItems] = useState([{ id: 'ada', name: 'Ada' }]);
          return <View>{items.map((item, idx) => <View key={item.id}><Text>{item.name}</Text><Text>{idx}</Text></View>)}</View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({
      items: [{ id: "ada", name: "Ada" }],
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
                    children: [
                      {
                        kind: "element",
                        value: {
                          tag: "text",
                          children: [
                            {
                              kind: "expression",
                              value: {
                                path: "item.name",
                                is_callable: false,
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: "element",
                        value: {
                          tag: "text",
                          children: [
                            {
                              kind: "expression",
                              value: { path: "idx", is_callable: false },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });

  it("extracts exported page lifecycle object", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astroforge/core';
        export const lifecycle = {
          onInit() {
            console.log('page init');
          },
          onReady: () => {
            console.log('page ready');
          },
        };
        export default function Page() {
          const [message, setMessage] = useState('Ready');
          return <View><Text>{message}</Text></View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.lifecycle).toEqual({
      onInit: 'function onInit() {\n  console.log("page init");\n}',
      onReady: 'function onReady() {\n  console.log("page ready");\n}',
    });
  });

  it("lowers useEffect into Vela lifecycle hooks", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useEffect, useState } from '@astroforge/core';
        export default function Page() {
          const [message, setMessage] = useState('Ready');
          useEffect(() => {
            console.log(message);
            return () => {
              console.log('cleanup');
            };
          }, []);
          return <View><Text>{message}</Text></View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.lifecycle).toEqual({
      onReady:
        'function onReady() {\n  console.log(this.message);\n}',
      onDestroy:
        'function onDestroy() {\n  console.log("cleanup");\n}',
    });
  });

  it("infers component props from TypeScript annotations", () => {
    const module = extractPageModuleFromTsx(
      `
        import { Text, View } from '@astroforge/core';

        interface CardProps {
          title: string;
          count?: number;
          active?: boolean;
          onTap?: () => void;
        }

        function Card({ title, count = 0, active }: CardProps) {
          return <View><Text>{title}</Text><Text>{count}</Text><Text>{active}</Text></View>;
        }

        export default function Page() {
          return <Card title="A" active={true} />;
        }
      `,
      { route: "pages/index" },
    );
    const page = module.page;

    expect(page.imports).toEqual({ card: "card" });
    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        tag: "card",
        is_component: true,
      },
    });
    expect(module.components.card.script.props).toEqual({
      title: { type: "String" },
      count: { type: "Number", default: 0 },
      active: { type: "Boolean" },
      onTap: { type: "Function" },
    });
  });

  it("extracts CSS imports with an explicit loader", () => {
    const page = extractPageFromTsx(
      `
        import './card.css';
        import { View } from '@astroforge/core';
        export const styles = '.title { color: red; }';
        export default function Page() {
          return <View className="card" />;
        }
      `,
      {
        route: "pages/index",
        filename: "/src/pages/index.tsx",
        loadStyle(specifier, importer) {
          expect(specifier).toBe("./card.css");
          expect(importer).toBe("/src/pages/index.tsx");
          return ".card { padding: 8px; }";
        },
      },
    );

    expect(page.style.rules).toEqual([
      {
        selectors: [{ kind: "class", name: "card" }],
        declarations: { padding: "8px" },
      },
      {
        selectors: [{ kind: "class", name: "title" }],
        declarations: { color: "red" },
      },
    ]);
  });

  it("extracts app lifecycle bodies from default export object", () => {
    const app = extractAppFromTsx(`
      export default {
        onCreate() {
          console.log('app created');
        },
        onDestroy() {
          console.log('app destroyed');
        },
      };
    `);

    expect(app.lifecycle).toEqual({
      onCreate: 'console.log("app created");',
      onDestroy: 'console.log("app destroyed");',
    });
  });
});
