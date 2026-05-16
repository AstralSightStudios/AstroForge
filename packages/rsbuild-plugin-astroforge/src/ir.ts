export const IR_VERSION = 1;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface IrDocument {
  ir_version: number;
  manifest: Manifest;
  app: AppModule;
  pages: Record<string, Page>;
  components: Record<string, Component>;
  assets: AssetRef[];
}

export interface Manifest {
  package: string;
  name: string;
  version_name: string;
  version_code: number;
  min_platform_version: number;
  icon: string;
  simulation_version?: string;
  device_type_list: string[];
  features: Feature[];
  config: AppConfig;
  router: Router;
  // 源 manifest 的 camelCase 原始对象，按用户书写顺序保留所有字段（含
  // IR 未显式建模的扩展字段）。Vela 后端在生成 `manifest.json` 时优先以
  // 此对象作为基础。
  source?: Record<string, JsonValue>;
}

export interface Feature {
  name: string;
}

export interface AppConfig {
  log_level?: string;
  design_width?: string;
}

export interface Router {
  entry: string;
  pages: Record<string, RoutePage>;
}

export interface RoutePage {
  component: string;
}

export interface AppModule {
  lifecycle: Record<string, string>;
}

export interface Page {
  route: string;
  imports: Record<string, string>;
  template: Node[];
  script: Script;
  style: StyleTable;
}

export interface Component {
  name: string;
  template: Node[];
  script: Script;
  style: StyleTable;
}

export interface Script {
  props: Record<string, Prop>;
  private_data: Record<string, JsonValue>;
  methods: Record<string, string>;
  lifecycle: Record<string, string>;
}

export interface Prop {
  type: string;
  default?: JsonValue;
}

export interface StyleTable {
  rules: StyleRule[];
}

export interface StyleRule {
  selectors: Selector[];
  declarations: Record<string, string>;
}

export interface Selector {
  kind: SelectorKind;
  name: string;
}

export type SelectorKind = "class" | "id" | "tag" | "keyframes" | "font_face";

export interface AssetRef {
  path: string;
  source_path: string;
  digest: string;
}

export type Node =
  | { kind: "element"; value: Element }
  | { kind: "text"; value: string }
  | { kind: "expression"; value: Binding }
  | { kind: "conditional"; value: Conditional }
  | { kind: "list"; value: List }
  | { kind: "fragment"; value: Node[] };

export interface Element {
  tag: string;
  is_component: boolean;
  attrs: Record<string, Attr>;
  events: Record<string, Binding>;
  children: Node[];
}

export type Attr =
  | { kind: "static"; value: JsonValue }
  | { kind: "dynamic"; value: Binding }
  | { kind: "style_object"; value: StyleSlot[] };

export interface StyleSlot {
  name: string;
  value: StyleSlotValue;
}

export type StyleSlotValue =
  | { kind: "static"; value: JsonValue }
  | { kind: "dynamic"; value: Binding };

export interface Binding {
  path: string;
  is_callable: boolean;
}

export interface Conditional {
  branches: ConditionalBranch[];
}

export interface ConditionalBranch {
  guard: Binding | null;
  body: Node[];
}

export interface List {
  source: Binding;
  item_var: string;
  index_var?: string;
  key?: Binding;
  body: Node[];
}

export function createEmptyScript(): Script {
  return {
    props: {},
    private_data: {},
    methods: {},
    lifecycle: {},
  };
}

export function createEmptyStyleTable(): StyleTable {
  return {
    rules: [],
  };
}
