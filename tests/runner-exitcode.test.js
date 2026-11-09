import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = fixture => spawnSync(process.execPath, ["tests/run_all_probes.js", `tests/fixtures/${fixture}`], {
  cwd: repo,
  stdio: "inherit",
});

test("runner exits 0 when every probe passes", () => {
  const r = run("pass.test.js");
  assert.equal(r.error, undefined, "spawn failed: " + r.error?.message);
  assert.equal(r.status, 0);
});

test("runner exits non-zero when a probe fails", () => {
  const r = run("fail.test.js");
  assert.equal(r.error, undefined, "spawn failed: " + r.error?.message);
  assert.ok(r.status !== 0, `expected a non-zero exit, got ${r.status}`);
});
