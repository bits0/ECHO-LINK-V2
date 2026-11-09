import test from "node:test";
import assert from "node:assert/strict";

test("fixture is red", () => {
  assert.fail("intentional fixture failure");
});
