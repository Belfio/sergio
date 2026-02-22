import test from "node:test";
import assert from "node:assert/strict";
import { buildUrlPolicy } from "../src/claude-common.js";

test("buildUrlPolicy returns empty policy when list is empty", () => {
  assert.equal(buildUrlPolicy([]), "");
});

test("buildUrlPolicy renders all allowed URLs", () => {
  const policy = buildUrlPolicy(["https://github.com", "https://docs.example.com"]);
  assert.match(policy, /https:\/\/github\.com/);
  assert.match(policy, /https:\/\/docs\.example\.com/);
  assert.match(policy, /Do NOT fetch, read, or access any URL not on this list\./);
});
