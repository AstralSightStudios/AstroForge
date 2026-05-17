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
        import { Text, View } from '@astralsight/astroforge-core';
        export default function Page() {
          return (
            <View style={{ color: 'red', 'flex-direction': 'column', fontSize: 16, padding: -8 }}>
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
            value: {
              color: "red",
              flexDirection: "column",
              fontSize: 16,
              padding: -8,
            },
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
        import { View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [theme, setTheme] = useState({ color: 'red' });
          return <View style={{ color: theme.color, 'align-items': 'center', fontSize: 16 }} />;
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
        {
          name: "alignItems",
          value: { kind: "static", value: "center" },
        },
        { name: "fontSize", value: { kind: "static", value: 16 } },
      ],
    });
  });

  it("accepts static array literal attributes (classList-style)", () => {
    const page = extractPageFromTsx(
      `
        import { View } from '@astralsight/astroforge-core';
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
        import { Text, View } from '@astralsight/astroforge-core';
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

  it("extracts inline arrow event handlers as template functions", () => {
    const page = extractPageFromTsx(
      `
        import { View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [count, setCount] = useState(0);
          return <View onClick={() => { setCount((prev) => prev + 1); }} />;
        }
      `,
      { route: "pages/index" },
    );

    expect((page.template[0] as any).value.events.click).toEqual({
      path: "() => { setCount((prev) => prev + 1); }",
      expr: "function(evt) {\n  _vm_.count = _vm_.count + 1;\n}",
      is_callable: true,
    });
  });

  it("keeps runtime bridge imports unqualified inside inline event handlers", () => {
    const page = extractPageFromTsx(
      `
        import { View, prompt, router } from '@astralsight/astroforge-core';
        export default function Page() {
          return <View onClick={() => { router.push({ uri: "pages/detail" }); prompt.showToast({ message: "ok" }); }} />;
        }
      `,
      { route: "pages/index" },
    );

    expect((page.template[0] as any).value.events.click.expr).toContain(
      'router.push({ uri: "pages/detail" })',
    );
    expect((page.template[0] as any).value.events.click.expr).not.toContain(
      "_vm_.router",
    );
    expect((page.template[0] as any).value.events.click.expr).toContain(
      'prompt.showToast({ message: "ok" })',
    );
    expect((page.template[0] as any).value.events.click.expr).not.toContain(
      "_vm_.prompt",
    );
  });

  it("extracts template literals and ternaries as text value expressions", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [items, setItems] = useState([1, 2]);
          const [cost, setCost] = useState(null);
          return (
            <View>
              <Text className="info">{\`已创建组件：\${items.length}\`}</Text>
              <Text>{cost === null ? "--" : \`\${cost}ms\`}</Text>
            </View>
          );
        }
      `,
      { route: "pages/index" },
    );

    const children = (page.template[0] as any).value.children;
    expect(children[0].value.children[0]).toEqual({
      kind: "expression",
      value: {
        path: "`已创建组件：${items.length}`",
        expr: '"已创建组件：" + (_vm_.items.length)',
        is_callable: false,
      },
    });
    expect(children[1].value.children[0]).toEqual({
      kind: "expression",
      value: {
        path: 'cost === null ? "--" : `${cost}ms`',
        expr: '_vm_.cost === null ? "--" : (_vm_.cost) + "ms"',
        is_callable: false,
      },
    });
  });

  it("preserves arithmetic precedence while lowering template expressions", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [height, setHeight] = useState(480);
          return <View><Text>{(height - 600) / 2}</Text></View>;
        }
      `,
      { route: "pages/index" },
    );

    const expression = (page.template[0] as any).value.children[0].value
      .children[0];
    expect(expression.value.expr).toBe("(_vm_.height - 600) / 2");
  });

  it("preserves arithmetic precedence while lowering script methods", () => {
    const page = extractPageFromTsx(
      `
        import { View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [height, setHeight] = useState(480);
          function move() {
            const top = (height - 600) / 2;
            setHeight(top);
          }
          return <View onClick={move} />;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.methods.move).toContain(
      "const top = (this.height - 600) / 2;",
    );
  });

  it("maps extended built-in components to Vela tag names", () => {
    const page = extractPageFromTsx(
      `
        import { List, ListItem, QR, Slider, Swiper, Text } from '@astralsight/astroforge-core';
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
        import { Text, View } from '@astralsight/astroforge-core';
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
        import { Text, View, useState } from '@astralsight/astroforge-core';
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

  it("supports lazy useState initializers and block-body updaters", () => {
    const page = extractPageFromTsx(
      `
        import { View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [count, setCount] = useState(() => 2);
          function increment() {
            setCount((prev) => {
              return prev + 1;
            });
          }
          return <View onClick={increment} />;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({ count: 2 });
    expect(page.script.methods.increment).toBe(
      "function increment() {\n  this.count = this.count + 1;\n}",
    );
  });

  it("supports Fragment elements and empty top-level render returns", () => {
    const fragmentPage = extractPageFromTsx(
      `
        import { Fragment, Text } from '@astralsight/astroforge-core';
        export default function Page() {
          return <Fragment><Text>A</Text><Text>B</Text></Fragment>;
        }
      `,
      { route: "pages/index" },
    );
    const emptyPage = extractPageFromTsx(
      `
        export default function Page() {
          return null;
        }
      `,
      { route: "pages/index" },
    );

    expect(fragmentPage.template).toMatchObject([
      { kind: "element", value: { tag: "text" } },
      { kind: "element", value: { tag: "text" } },
    ]);
    expect(emptyPage.template).toEqual([]);
  });

  it("lowers ternary JSX into conditional Component IR", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useState } from '@astralsight/astroforge-core';
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
        import { Text, View, useState } from '@astralsight/astroforge-core';
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
        import { Text, View, useState } from '@astralsight/astroforge-core';
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
        import { Text, View, useEffect, useState } from '@astralsight/astroforge-core';
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
      onReady: "function onReady() {\n  console.log(this.message);\n}",
      onDestroy: 'function onDestroy() {\n  console.log("cleanup");\n}',
    });
  });

  it("lowers timer closures and TypeScript locals inside useEffect", () => {
    const page = extractPageFromTsx(
      `
        import { View, useEffect, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [count, setCount] = useState(3);
          useEffect(() => {
            let stepInterval: any = null;
            stepInterval = setInterval(() => setCount((prev) => prev - 1), 16);
            return () => {
              clearInterval(stepInterval);
            };
          }, []);
          return <View />;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.lifecycle.onReady).toContain(
      "let stepInterval = null;",
    );
    expect(page.script.lifecycle.onReady).toContain(
      "this.count = this.count - 1",
    );
    expect(page.script.lifecycle.onReady).not.toContain("setCount");
  });

  it("qualifies local callbacks referenced from lifecycle closures", () => {
    const page = extractPageFromTsx(
      `
        import { View, useCallback, useEffect, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [count, setCount] = useState(2);
          const tick = useCallback(() => {
            setCount((prev) => prev - 1);
          }, []);
          useEffect(() => {
            setInterval(() => tick(), 16);
          }, []);
          return <View onClick={tick} />;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.lifecycle.onReady).toContain("this.tick()");
    expect(page.script.methods.tick).toContain("this.count = this.count - 1");
  });

  it("extracts useRef and useCallback into component VM script", () => {
    const page = extractPageFromTsx(
      `
        import { View, useCallback, useRef } from '@astralsight/astroforge-core';
        export default function Page() {
          const timer = useRef<any>(null);
          const stop = useCallback(() => {
            clearInterval(timer.current);
            timer.current = null;
          }, []);
          return <View onClick={stop} />;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({ timer: { current: null } });
    expect(page.script.methods.stop).toBe(
      "function stop() {\n  clearInterval(this.timer.current);\n  this.timer.current = null;\n}",
    );
  });

  it("inlines useMemo expressions in template bindings", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View, useMemo, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [count, setCount] = useState(2);
          const label = useMemo(() => \`count:\${count}\`, [count]);
          return <View><Text>{label}</Text></View>;
        }
      `,
      { route: "pages/index" },
    );

    const text = (page.template[0] as any).value.children[0].value.children[0];
    expect(text).toEqual({
      kind: "expression",
      value: {
        path: "label",
        expr: '("count:" + (_vm_.count))',
        is_callable: false,
      },
    });
  });

  it("preserves async lifecycle functions", () => {
    const page = extractPageFromTsx(
      `
        import { View } from '@astralsight/astroforge-core';
        export const lifecycle = {
          async onCreate() {
            await loadProfile();
          },
        };
        export default function Page() {
          return <View />;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.lifecycle.onCreate).toBe(
      "async function onCreate() {\n  await loadProfile();\n}",
    );
  });

  it("infers component props from TypeScript annotations", () => {
    const module = extractPageModuleFromTsx(
      `
        import { Text, View } from '@astralsight/astroforge-core';

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
        import { View } from '@astralsight/astroforge-core';
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

  it("preserves async app lifecycle functions", () => {
    const app = extractAppFromTsx(`
      export default {
        async onCreate() {
          await boot();
        },
      };
    `);

    expect(app.lifecycle).toEqual({
      onCreate: "async function onCreate() {\n  await boot();\n}",
    });
  });

  it("inlines local function imports into script.methods", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View } from '@astralsight/astroforge-core';
        import { formatDate } from './utils';
        export default function Page() {
          const label = formatDate('2024-01-01');
          return <View><Text>{label}</Text></View>;
        }
      `,
      {
        route: "pages/index",
        filename: "/src/pages/index.tsx",
        resolveImport(specifier) {
          if (specifier === "./utils") return "/src/pages/utils.ts";
          return undefined;
        },
        loadModule(path) {
          if (path === "/src/pages/utils.ts") {
            return `
              export function formatDate(d: string) {
                return d.replace(/-/g, "/");
              }
            `;
          }
          return undefined;
        },
      },
    );

    expect(page.script.methods.formatDate).toBe(
      "function formatDate(d) {\n  return d.replace(/-/g, \"/\");\n}",
    );
  });

  it("maps props.children to a slot element in component templates", () => {
    const module = extractPageModuleFromTsx(
      `
        import { Text, View } from '@astralsight/astroforge-core';
        function Card({ title, children }) {
          return <View><Text>{title}</Text>{children}</View>;
        }
        export default function Page() {
          return <Card title="A"><Text>Hello</Text></Card>;
        }
      `,
      { route: "pages/index" },
    );

    const card = module.components.card;
    expect(card.script.props).not.toHaveProperty("children");
    expect(card.template).toEqual([
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
                children: [
                  {
                    kind: "expression",
                    value: { path: "title", is_callable: false },
                  },
                ],
              },
            },
            {
              kind: "element",
              value: {
                tag: "slot",
                is_component: false,
                attrs: {},
                events: {},
                children: [],
              },
            },
          ],
        },
      },
    ]);
  });

  it("maps member expression props.children to a slot element", () => {
    const module = extractPageModuleFromTsx(
      `
        import { View } from '@astralsight/astroforge-core';
        function Card(props) {
          return <View>{props.children}</View>;
        }
        export default function Page() {
          return <Card><Text>Hello</Text></Card>;
        }
      `,
      { route: "pages/index" },
    );

    const card = module.components.card;
    expect(card.template[0].value.children[0]).toEqual({
      kind: "element",
      value: {
        tag: "slot",
        is_component: false,
        attrs: {},
        events: {},
        children: [],
      },
    });
  });

  it("lowers useReducer into private_data and dispatch method", () => {
    const page = extractPageFromTsx(
      `
        import { View, useReducer } from '@astralsight/astroforge-core';
        function counterReducer(state, action) {
          switch (action.type) {
            case 'inc': return state + 1;
            default: return state;
          }
        }
        export default function Page() {
          const [count, dispatch] = useReducer(counterReducer, 0);
          return <View onClick={() => dispatch({ type: 'inc' })}>{count}</View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({ count: 0 });
    expect(page.script.methods.dispatch).toContain(
      "this.count = (counterReducer)(this.count, action)",
    );
  });

  it("lowers useReducer with init function", () => {
    const page = extractPageFromTsx(
      `
        import { View, useReducer } from '@astralsight/astroforge-core';
        export default function Page() {
          const [count, dispatch] = useReducer((s, a) => s + a, 0, () => 10);
          return <View>{count}</View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({ count: 10 });
  });

  it("lowers useId into private_data as stable identifier", () => {
    const page = extractPageFromTsx(
      `
        import { View, useId } from '@astralsight/astroforge-core';
        export default function Page() {
          const id = useId();
          const id2 = useId();
          return <View id={id}><View id={id2} /></View>;
        }
      `,
      { route: "pages/index" },
    );

    expect(page.script.private_data).toEqual({
      id: "__af_id_1",
      id2: "__af_id_2",
    });
  });

  it("inlines local constant imports into script.private_data", () => {
    const page = extractPageFromTsx(
      `
        import { Text, View } from '@astralsight/astroforge-core';
        import { MAX_SIZE } from './constants';
        export default function Page() {
          const label = MAX_SIZE;
          return <View><Text>{label}</Text></View>;
        }
      `,
      {
        route: "pages/index",
        filename: "/src/pages/index.tsx",
        resolveImport(specifier) {
          if (specifier === "./constants") return "/src/pages/constants.ts";
          return undefined;
        },
        loadModule(path) {
          if (path === "/src/pages/constants.ts") {
            return `export const MAX_SIZE = 128;`;
          }
          return undefined;
        },
      },
    );

    expect(page.script.private_data).toEqual({ MAX_SIZE: 128 });
  });

  it("extracts JSX spread attributes into element spreads", () => {
    const page = extractPageFromTsx(
      `
        import { View, useState } from '@astralsight/astroforge-core';
        export default function Page() {
          const [props, setProps] = useState({ className: 'card' });
          return <View {...props} style={{ color: 'red' }} />;
        }
      `,
      { route: "pages/index" },
    );

    expect((page.template[0] as any).value.spreads).toEqual([
      { path: "props", is_callable: false },
    ]);
    expect((page.template[0] as any).value.attrs.style).toEqual({
      kind: "static",
      value: { color: "red" },
    });
  });

  it("treats uppercase local variables as dynamic tags", () => {
    const page = extractPageFromTsx(
      `
        import { View } from '@astralsight/astroforge-core';
        export default function Page() {
          const Tag = 'text';
          return <View><Tag className="info">Hello</Tag></View>;
        }
      `,
      { route: "pages/index" },
    );

    const tagElement = (page.template[0] as any).value.children[0];
    expect(tagElement.value.tag).toBe("div");
    expect(tagElement.value.tag_binding).toEqual({
      path: "Tag",
      is_callable: false,
    });
    expect(tagElement.value.is_component).toBe(false);
    expect(tagElement.value.attrs.class).toEqual({
      kind: "static",
      value: "info",
    });
  });

  it("lowers createContext / useContext / Provider into context provider components", () => {
    const module = extractPageModuleFromTsx(
      `
        import { Text, View, createContext, useContext } from '@astralsight/astroforge-core';
        const ThemeContext = createContext('light');
        function Button() {
          const theme = useContext(ThemeContext);
          return <Text>{theme}</Text>;
        }
        export default function Page() {
          return (
            <View>
              <ThemeContext.Provider value="dark">
                <Button />
              </ThemeContext.Provider>
            </View>
          );
        }
      `,
      { route: "pages/index" },
    );

    const page = module.page;
    const button = module.components.button;
    const provider = module.components.__af_ctxp___af_ctx_1;

    expect(button.script.private_data).toEqual({ theme: null });
    expect(button.script.lifecycle.onInit).toContain(
      "this.theme = __af_g.__af_ctx['__af_ctx_1'] !== undefined ? __af_g.__af_ctx['__af_ctx_1'] : 'light';",
    );

    expect(provider.name).toBe("__af_ctxp___af_ctx_1");
    expect(provider.template[0]).toMatchObject({
      kind: "element",
      value: { tag: "slot" },
    });
    expect(provider.script.lifecycle.onInit).toContain(
      "__af_g.__af_ctx_push('__af_ctx_1', this.value);",
    );
    expect(provider.script.lifecycle.onDestroy).toContain(
      "__af_g.__af_ctx_pop('__af_ctx_1');",
    );

    expect(page.template[0]).toMatchObject({
      kind: "element",
      value: {
        children: [
          {
            kind: "element",
            value: {
              tag: "__af_ctxp___af_ctx_1",
              is_component: true,
              attrs: {
                value: { kind: "static", value: "dark" },
              },
            },
          },
        ],
      },
    });
  });
});
