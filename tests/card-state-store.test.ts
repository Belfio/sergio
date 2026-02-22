import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCardStateStore } from "../src/card-state-store.js";

test("card state store persists processed cards and attempts", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sergio-state-test-"));
  const store = createCardStateStore({
    dataDir: tmpDir,
    processedFilename: "processed.json",
    attemptsFilename: "attempts.json",
    log: { info: () => undefined },
    processedLabel: "processed cards",
    emptyStateMessage: "empty",
  });

  await store.load();
  assert.equal(store.isProcessed("card-1"), false);
  assert.equal(store.getAttempts("card-1"), 0);

  await store.markProcessed("card-1");
  const attempts = await store.incrementAttempts("card-1");
  assert.equal(attempts, 1);

  const reloaded = createCardStateStore({
    dataDir: tmpDir,
    processedFilename: "processed.json",
    attemptsFilename: "attempts.json",
    log: { info: () => undefined },
    processedLabel: "processed cards",
    emptyStateMessage: "empty",
  });
  await reloaded.load();
  assert.equal(reloaded.isProcessed("card-1"), true);
  assert.equal(reloaded.getAttempts("card-1"), 1);
});
