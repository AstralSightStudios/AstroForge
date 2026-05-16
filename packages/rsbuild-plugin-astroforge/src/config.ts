import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "@babel/parser";
import type { JsonValue } from "./ir";

export interface AstroForgeManifestInput {
  package: string;
  name: string;
  versionName: string;
  versionCode: number;
  minPlatformVersion: number;
  icon: string;
  simulationVersion?: string;
  deviceTypeList: string[];
  features?: Array<{ name: string }>;
  config?: {
    logLevel?: string;
    designWidth?: string;
  };
  // AstroForge IR 不会丢弃用户在 manifest 中声明的任何额外字段。本类型仅
  // 列出做强校验的字段，其余键会按源顺序透传到 Vela `manifest.json` 中。
  [extra: string]: JsonValue | undefined;
}

export interface AstroForgeProjectConfig {
  manifest: AstroForgeManifestInput;
  plugin?: AstroForgePluginConfig;
}

export interface AstroForgePluginConfig {
  target?: "vela";
  cacheDir?: string;
}

export function readAstroForgeConfig(
  root: string,
  configFile = "astroforge.config.ts",
): AstroForgeProjectConfig {
  const path = resolve(root, configFile);
  const source = readFileSync(path, "utf8");
  return parseAstroForgeConfig(source, path);
}

export function parseAstroForgeConfig(
  source: string,
  filename = "astroforge.config.ts",
) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });

  for (const statement of ast.program.body) {
    if (statement.type !== "ExportDefaultDeclaration") {
      continue;
    }

    const declaration = unwrapTsExpression(statement.declaration);
    if (declaration.type !== "ObjectExpression") {
      throw new Error(`${filename}: default export 必须是对象字面量`);
    }

    const config = valueFromExpression(declaration);
    assertProjectConfig(config, filename);
    return config;
  }

  throw new Error(`${filename}: 未找到 default export`);
}

function assertProjectConfig(
  value: unknown,
  filename: string,
): asserts value is AstroForgeProjectConfig {
  if (!isRecord(value) || !isRecord(value.manifest)) {
    throw new Error(`${filename}: 缺少 manifest 对象`);
  }

  const manifest = value.manifest;
  assertString(manifest.package, filename, "manifest.package");
  assertString(manifest.name, filename, "manifest.name");
  assertString(manifest.versionName, filename, "manifest.versionName");
  assertNumber(manifest.versionCode, filename, "manifest.versionCode");
  assertNumber(
    manifest.minPlatformVersion,
    filename,
    "manifest.minPlatformVersion",
  );
  assertString(manifest.icon, filename, "manifest.icon");

  if (!Array.isArray(manifest.deviceTypeList)) {
    throw new Error(`${filename}: manifest.deviceTypeList 必须是字符串数组`);
  }
  for (const value of manifest.deviceTypeList) {
    if (typeof value !== "string") {
      throw new Error(`${filename}: manifest.deviceTypeList 必须是字符串数组`);
    }
  }
}

function valueFromExpression(node: any): JsonValue {
  const expression = unwrapTsExpression(node);

  switch (expression.type) {
    case "StringLiteral":
      return expression.value;
    case "NumericLiteral":
      return expression.value;
    case "BooleanLiteral":
      return expression.value;
    case "NullLiteral":
      return null;
    case "UnaryExpression": {
      const argument = unwrapTsExpression(expression.argument);
      if (expression.operator === "-" && argument.type === "NumericLiteral") {
        return -argument.value;
      }
      break;
    }
    case "ArrayExpression":
      return expression.elements.map((element: any) => {
        if (!element) {
          return null;
        }
        if (element.type === "SpreadElement") {
          throw new Error("配置数组暂不支持展开语法");
        }
        return valueFromExpression(element);
      });
    case "ObjectExpression": {
      const out: Record<string, JsonValue> = {};
      for (const property of expression.properties) {
        if (property.type === "SpreadElement") {
          throw new Error("配置对象暂不支持展开语法");
        }
        if (property.type !== "ObjectProperty") {
          throw new Error("配置对象暂不支持访问器或方法");
        }

        const key = propertyKey(property.key);
        out[key] = valueFromExpression(property.value);
      }
      return out;
    }
  }

  throw new Error(`配置项仅支持可序列化字面量，收到 ${expression.type}`);
}

function propertyKey(node: any): string {
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "StringLiteral":
    case "NumericLiteral":
      return String(node.value);
    default:
      throw new Error(`不支持的配置键类型：${node.type}`);
  }
}

function unwrapTsExpression(node: any): any {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "ParenthesizedExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function assertString(
  value: JsonValue | undefined,
  filename: string,
  key: string,
) {
  if (typeof value !== "string") {
    throw new Error(`${filename}: ${key} 必须是字符串`);
  }
}

function assertNumber(
  value: JsonValue | undefined,
  filename: string,
  key: string,
) {
  if (typeof value !== "number") {
    throw new Error(`${filename}: ${key} 必须是数字`);
  }
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
