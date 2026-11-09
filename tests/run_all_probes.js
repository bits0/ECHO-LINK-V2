// ============================================================
// ECHO//LINK — trusted probe runner.
// Runs every tests/*.test.js plus the boot smoke, then sets the
// process exit code from the results. Optional args run only those
// files (used by runner-exitcode.test.js against the fixtures).
// ============================================================
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(testsDir, "..");
const smoke = path.join(testsDir, "boot.smoke.js");
const rel = p => path.relative(repo, p).split(path.sep).join("/");

const requested = process.argv.slice(2);
const probes = requested.length
  ? requested.map(p => path.resolve(process.cwd(), p))
  : [
      ...readdirSync(testsDir).filter(f => f.endsWith(".test.js")).sort().map(f => path.join(testsDir, f)),
      smoke,
    ];

async function playwrightProblem() {
  try {
    const { chromium } = await import("playwright");
    const exe = chromium.executablePath();
    return existsSync(exe) ? null : `Chromium binary missing at ${exe}`;
  } catch (e) {
    return `playwright is not installed (${e.code || e.message})`;
  }
}

let failed = 0;
for (const probe of probes) {
  const name = rel(probe);
  if (path.resolve(probe) === smoke) {
    const problem = await playwrightProblem();
    if (problem) {
      failed++;
      console.error(`FAIL ${name} — ${problem}`);
      console.error("Install with: npm i -D playwright && npx playwright install chromium");
      continue;
    }
  }
  // an inherited NODE_TEST_CONTEXT makes the nested test runner swallow failures
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ["--test", probe], { cwd: repo, stdio: "inherit", env, timeout: 180000 });
  if (r.error) { failed++; console.error(`FAIL ${name} — spawn error: ${r.error.message}`); }
  else if (r.status !== 0) { failed++; console.error(`FAIL ${name} — exit ${r.status}`); }
  else console.log(`PASS ${name}`);
}

console.log(`\nProbes: ${probes.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
