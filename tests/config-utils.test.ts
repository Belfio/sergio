import test from "node:test";
import assert from "node:assert/strict";
import { resolvePipelineConfig } from "../src/config-utils.js";

test("resolvePipelineConfig uses safe defaults when pipeline is missing", () => {
  assert.deepEqual(resolvePipelineConfig(undefined), {
    devCommand: "",
    devReadyPattern: "",
    testCommands: [],
  });
});

test("resolvePipelineConfig preserves provided values", () => {
  assert.deepEqual(
    resolvePipelineConfig({
      devCommand: "npm run dev",
      devReadyPattern: "ready",
      testCommands: ["npm test"],
    }),
    {
      devCommand: "npm run dev",
      devReadyPattern: "ready",
      testCommands: ["npm test"],
    }
  );
});
