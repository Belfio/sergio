import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMcpConfigPayload,
  collectMcpEnvPlaceholders,
  parseMcpConfigDocument,
  resolveMcpServersEnv,
} from "../src/mcp-utils.js";

test("buildMcpConfigPayload returns null when servers are missing", () => {
  assert.equal(buildMcpConfigPayload(undefined), null);
});

test("resolveMcpServersEnv interpolates placeholders recursively", () => {
  const servers = {
    "google-docs": {
      command: "npx",
      args: ["-y", "google-docs-mcp", "${MCP_EXTRA_ARG}"],
      env: {
        GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}",
        GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET}",
      },
    },
  };
  const resolved = resolveMcpServersEnv(servers, {
    GOOGLE_CLIENT_ID: "abc",
    GOOGLE_CLIENT_SECRET: "def",
    MCP_EXTRA_ARG: "--stdio",
  });

  assert.equal(resolved["google-docs"].args?.[2], "--stdio");
  assert.equal(resolved["google-docs"].env?.GOOGLE_CLIENT_ID, "abc");
  assert.equal(resolved["google-docs"].env?.GOOGLE_CLIENT_SECRET, "def");
});

test("parseMcpConfigDocument parses valid mcpServers object", () => {
  const servers = parseMcpConfigDocument(
    JSON.stringify({
      mcpServers: {
        figma: { type: "http", url: "http://127.0.0.1:3845/mcp" },
      },
    })
  );

  assert.equal(servers.figma.type, "http");
});

test("parseMcpConfigDocument rejects invalid shape", () => {
  assert.throws(
    () => parseMcpConfigDocument(JSON.stringify({ mcpServers: [] })),
    /expected object at `mcpServers`/
  );
});

test("collectMcpEnvPlaceholders returns unique sorted keys", () => {
  const keys = collectMcpEnvPlaceholders({
    docs: {
      env: {
        A: "${GOOGLE_CLIENT_ID}",
        B: "${GOOGLE_CLIENT_SECRET}",
      },
      args: ["--token", "${GOOGLE_CLIENT_SECRET}"],
    },
  });

  assert.deepEqual(keys, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
});
