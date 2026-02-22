export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "stdio" | "http";
  url?: string;
}

export type McpServersConfig = Record<string, McpServerConfig>;
