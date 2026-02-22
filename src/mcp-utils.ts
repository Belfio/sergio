import type { McpServersConfig } from "./mcp-types.js";

function resolveTemplateString(input: string, env: NodeJS.ProcessEnv): string {
  return input.replace(/\$\{(\w+)\}/g, (_, key: string) => env[key] || "");
}

function resolveValue(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value === "string") {
    return resolveTemplateString(value, env);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, env));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveValue(v, env);
    }
    return out;
  }
  return value;
}

export function resolveMcpServersEnv(
  servers: McpServersConfig,
  env: NodeJS.ProcessEnv = process.env
): McpServersConfig {
  return resolveValue(servers, env) as McpServersConfig;
}

export function buildMcpConfigPayload(
  servers?: McpServersConfig,
  env: NodeJS.ProcessEnv = process.env
): { mcpServers: McpServersConfig } | null {
  if (!servers || Object.keys(servers).length === 0) return null;
  return { mcpServers: resolveMcpServersEnv(servers, env) };
}

export function parseMcpConfigDocument(doc: string): McpServersConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid MCP config JSON: ${msg}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid MCP config: expected JSON object");
  }

  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error("Invalid MCP config: expected object at `mcpServers`");
  }
  return servers as McpServersConfig;
}

export function collectMcpEnvPlaceholders(servers?: McpServersConfig): string[] {
  if (!servers) return [];
  const keys = new Set<string>();
  const regex = /\$\{(\w+)\}/g;
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(regex)) {
        keys.add(match[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (value && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) walk(v);
    }
  };

  walk(servers);
  return [...keys].sort();
}
