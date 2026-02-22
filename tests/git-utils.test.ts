import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeBranchName } from "../src/git-utils.js";

test("sanitizeBranchName normalizes unsafe characters", () => {
  assert.equal(sanitizeBranchName("Feature: Add Login + OAuth"), "feature-add-login-oauth");
});

test("sanitizeBranchName trims and collapses dashes", () => {
  assert.equal(sanitizeBranchName("---A---B---"), "a-b");
});

test("sanitizeBranchName enforces max length", () => {
  const input = "x".repeat(120);
  assert.equal(sanitizeBranchName(input).length, 50);
});
