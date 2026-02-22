import test from "node:test";
import assert from "node:assert/strict";
import { workflowListDefs } from "../src/setup/trello-setup.js";

test("workflowListDefs returns seven ordered lists", () => {
  const defs = workflowListDefs("Sergio");
  assert.equal(defs.length, 7);
  assert.equal(defs[0].key, "todo");
  assert.equal(defs[1].name, "🔍 Sergio Revision");
  assert.equal(defs[6].name, "🚀 Ready for Review");
});
