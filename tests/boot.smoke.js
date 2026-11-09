// ============================================================
// ECHO//LINK — boot smoke: real Chromium against a static server.
// Listeners attach before goto so the very first boot failure is caught.
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const hidden = (page, id) => page.evaluate(id => document.getElementById(id).classList.contains("hidden"), id);

function startServer() {
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://127.0.0.1");
    if (pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
    const file = path.resolve(repo, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(repo + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("static: no absolute /src/ or /public/ paths", async () => {
  for (const f of [path.join(repo, "index.html"), ...await jsFiles(path.join(repo, "js"))]) {
    const text = await readFile(f, "utf8");
    assert.ok(!/\/src\/|\/public\//.test(text), `${path.relative(repo, f)} contains an absolute /src/ or /public/ path`);
  }
});

test("static: lab objective is written at runtime, not in markup", async () => {
  const html = await readFile(path.join(repo, "index.html"), "utf8");
  assert.ok(!html.includes("inspect, power, cable, verify"), "index.html must not hardcode the lab objective text");
});

test("boot smoke", async () => {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch (e) { assert.fail(`playwright is not installed (${e.message}). Run: npm i -D playwright && npx playwright install chromium`); }

  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [], consoleMsgs = [];
    page.on("pageerror", e => pageErrors.push(`[pageerror] ${e.message}`));
    page.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`[console.${m.type()}] ${m.text()}`);
    });
    page.on("dialog", d => d.accept());

    const boot = async () => {
      await page.goto(url);
      // module evaluation is complete once main.js has wired the lab button
      try {
        await page.waitForFunction(() => document.getElementById("btn-lab")?.onclick !== null, null, { timeout: 10000 });
      } catch {
        // reported by the assertions below, which print the captured boot errors
      }
      const problems = [...pageErrors, ...consoleMsgs];
      assert.deepEqual(problems, [], "boot reported errors:\n" + problems.join("\n"));
      assert.equal(await page.evaluate(() => document.getElementById("btn-lab").onclick !== null), true, "main.js never attached handlers");
      pageErrors.length = 0; consoleMsgs.length = 0;
    };

    await boot();
    assert.equal(await hidden(page, "game-screen"), true, "#game-screen must start hidden");
    assert.equal(await page.locator("#objective-text").textContent(), "", "#objective-text must start empty");

    await page.click("#title-settings");
    assert.equal(await hidden(page, "settings-overlay"), false);
    assert.equal(await page.locator("#set-ns-remember").isChecked(), true);
    await page.click("#settings-close");
    assert.equal(await hidden(page, "settings-overlay"), true);

    await page.click("#btn-lab");
    assert.equal(await hidden(page, "title-screen"), true);
    assert.equal(await hidden(page, "game-screen"), false);
    assert.equal(await hidden(page, "objective-bar"), false);
    const objective = await page.locator("#objective-text").textContent();
    assert.ok(objective.startsWith("MECHANICS LAB"), `objective text was ${JSON.stringify(objective)}`);
    assert.equal(await hidden(page, "amber-dot"), true);
    assert.equal(await hidden(page, "phone-button"), true);

    await boot();
    await page.click("#title-settings");
    await page.uncheck("#set-ns-remember");
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("echolink-settings-v1") || "null"));
    assert.equal(settings?.nsRememberView, false, "unchecking must persist nsRememberView:false");
    await page.click("#settings-close");

    await boot();
    await page.click("#title-settings");
    assert.equal(await page.locator("#set-ns-remember").isChecked(), false, "persisted setting must survive a reload");
  } finally {
    await browser.close();
    server.close();
  }
});
