// ============================================================
// ECHO//LINK — the browser window: pages are what the network answers.
// Boots the lab, opens PC-C's desktop, and drives the address bar.
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

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

const txt = async loc => (await loc.innerText()).replace(/\s+/g, " ").trim();

test("browser window — the page is whatever the network answers", async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const problems = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
    page.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
    });
    page.on("dialog", d => d.accept());

    await page.goto(url);
    await page.click("#btn-lab");
    await page.waitForSelector("#game-screen:not(.hidden)");
    await page.click('[data-hs="door:office"]');
    await page.waitForSelector('[data-hs="device:PC-C"]');
    await page.click('[data-hs="device:PC-C"]');
    await page.click("#dv-use");
    await page.waitForSelector("#dock-browser");

    // (a) nothing is open yet
    assert.equal(await page.locator(".dock-item.is-open, .dock-item.is-active").count(), 0, "(a) the dock starts clean");

    await page.click("#dock-browser");
    await page.waitForSelector("#win-browser");
    assert.equal(await page.locator("#dock-terminal").count(), 1, "the dock keeps TERMINAL beside BROWSER");
    // (b) opening the browser marks it open and active, and only it
    assert.equal(await page.locator("#dock-browser.is-open").count(), 1, "(b) browser is open");
    assert.equal(await page.locator("#dock-browser.is-active").count(), 1, "(b) browser is active");
    assert.equal(await page.locator("#dock-browser").getAttribute("aria-current"), "true", "(b) the active item exposes aria-current");
    assert.equal(await page.locator("#dock-terminal.is-open, #dock-terminal.is-active").count(), 0, "(b) terminal stays clean");
    assert.match(await txt(page.locator("#win-browser .browser-page")), /NEW TAB/, "the window opens on a start page");

    // the router's page, rendered from the live engine
    await page.fill("#win-browser .browser-url", "192.168.1.1");
    await page.press("#win-browser .browser-url", "Enter");
    await page.waitForFunction(() => {
      const t = document.querySelector("#win-browser .browser-page")?.textContent || "";
      return t.includes("ASTER EDGE") && t.includes("RTR-01");
    }, null, { timeout: 10000 });

    // an honest DNS failure replaces the page — it is not appended
    await page.fill("#win-browser .browser-url", "kb.aster.local");
    await page.press("#win-browser .browser-url", "Enter");
    await page.waitForFunction(() => (document.querySelector("#win-browser .browser-page")?.textContent || "").includes("ERR_NAME_NOT_RESOLVED"), null, { timeout: 10000 });
    const after = await txt(page.locator("#win-browser .browser-page"));
    assert.ok(!after.includes("ASTER EDGE"), "the second page must replace the first");
    assert.match(after, /ERR_NAME_NOT_RESOLVED/);
    assert.equal(await page.locator("#win-browser .browser-err").count(), 1, "the error code is visible in .browser-err");

    // (c) focusing the terminal keeps the browser open
    await page.click("#dock-terminal");
    await page.waitForSelector("#win-terminal");
    assert.equal(await page.locator("#dock-terminal.is-active").count(), 1, "(c) terminal is active");
    assert.equal(await page.locator("#dock-terminal").getAttribute("aria-current"), "true", "(c) aria-current moves to the terminal");
    assert.equal(await page.locator("#dock-browser.is-open").count(), 1, "(c) the browser stays open");
    assert.equal(await page.locator("#dock-browser.is-active").count(), 0, "(c) the browser is no longer active");
    assert.equal(await page.locator("#dock-browser").getAttribute("aria-current"), null, "(c) aria-current leaves the browser");
    assert.equal(await page.locator(".dock-item.is-active").count(), 1, "(c) exactly one item is active");

    // (d) closing the terminal clears it; the browser is still open
    await page.click("#win-terminal .wb-close");
    await page.waitForSelector("#win-terminal", { state: "detached" });
    assert.equal(await page.locator("#dock-terminal.is-open, #dock-terminal.is-active").count(), 0, "(d) the closed terminal is clean");
    assert.equal(await page.locator("#dock-browser.is-open").count(), 1, "(d) the browser is still open");

    // (e) closing the browser clears the last open marker
    await page.click("#win-browser .wb-close");
    await page.waitForSelector("#win-browser", { state: "detached" });
    assert.equal(await page.locator(".dock-item.is-open").count(), 0, "(e) no window is open");

    // the dock still works after the windows close
    await page.click("#dock-terminal");
    await page.waitForSelector(".term-input");
    await page.fill(".term-input", "ipconfig");
    await page.press(".term-input", "Enter");
    await page.waitForSelector('.term-out:has-text("IPv4 Address")');

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test("device inspector — the virtual and physical halves of the panel", async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const problems = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
    page.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
    });
    page.on("dialog", d => d.accept());

    await page.goto(url);
    await page.click("#btn-lab");
    await page.waitForSelector("#game-screen:not(.hidden)");
    await page.click('[data-hs="door:office"]');
    await page.waitForSelector('[data-hs="device:PC-C"]');
    await page.click('[data-hs="device:PC-C"]');
    await page.click("#dv-use");
    await page.waitForSelector("#dock-netspace");
    await page.click("#dock-netspace");
    await page.waitForSelector("#ns-mode-virtual");

    assert.equal(await txt(page.locator("#ns-mode-virtual")), "VIRTUAL");
    assert.equal(await txt(page.locator("#ns-mode-physical")), "PHYSICAL");
    assert.equal(await page.locator("#ns-mode-virtual.on").count(), 1, "virtual is the default view");

    const open = async view => {
      await page.evaluate(v => import("/js/device.js").then(m => m.openDevice("PC-A", v ? { view: v } : undefined)), view);
      await page.waitForSelector("#device-overlay:not(.hidden)");
      return txt(page.locator("#device-overlay"));
    };
    const close = async () => {
      await page.click("#device-overlay #dv-close");
      await page.waitForSelector("#device-overlay", { state: "hidden" });
    };

    let panel = await open("virtual");
    assert.match(panel, /NIC/);
    assert.match(panel, /IP ADDRESS/);
    assert.match(panel, /CONFIG/);
    assert.ok(!panel.includes("WALL OUTLET"), "virtual shows no WALL OUTLET");
    assert.ok(!panel.includes("PATCH PANEL"), "virtual shows no PATCH PANEL");
    assert.ok(!panel.includes("LINK PATH"), "virtual shows no LINK PATH");
    assert.equal(await page.locator("#device-overlay .iface-panel").count(), 0, "virtual has no port strip");
    assert.equal(await page.locator("#device-overlay #dv-nic").count(), 1, "virtual keeps the NIC verb");
    assert.equal(await page.locator("#device-overlay #dv-power").count(), 0, "virtual has no power verb");
    await close();

    panel = await open("physical");
    assert.match(panel, /POWER/);
    assert.match(panel, /LINK PATH/);
    assert.match(panel, /WALL OUTLET/);
    assert.match(panel, /PATCH PANEL/);
    assert.ok(!panel.includes("IP ADDRESS"), "physical shows no IP ADDRESS");
    assert.ok(!panel.includes("CONFIG"), "physical shows no CONFIG");
    assert.equal(await page.locator("#device-overlay #dv-power").count(), 1, "physical keeps the power verb");
    assert.equal(await page.locator("#device-overlay #dv-nic").count(), 0, "physical has no NIC verb");
    await close();

    panel = await open(null);
    assert.match(panel, /LINK PATH/, "no view keeps the whole panel");
    assert.match(panel, /IP ADDRESS/, "no view keeps the whole panel");

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test("floor strip — L1 is a sheet, not the office", async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const problems = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
    page.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
    });
    page.on("dialog", d => d.accept());

    await page.goto(url);
    await page.click("#btn-lab");
    await page.waitForSelector("#game-screen:not(.hidden)");
    await page.click('[data-hs="door:office"]');
    await page.waitForSelector('[data-hs="device:PC-C"]');
    await page.click('[data-hs="device:PC-C"]');
    await page.click("#dv-use");
    await page.waitForSelector("#dock-netspace");
    await page.click("#dock-netspace");
    await page.waitForSelector("#ns-mode-physical");

    // virtual is a topology, not a floor plan — no floor strip there
    assert.equal(await page.locator("#ns-floors.hidden").count(), 1, "VIRTUAL shows no floor strip");

    await page.click("#ns-mode-physical");
    await page.waitForSelector("#ns-floors:not(.hidden)");
    assert.equal(await txt(page.locator("#ns-floor-f1")), "F1 — OFFICE");
    assert.equal(await txt(page.locator("#ns-floor-l1")), "L1 — NOC");
    assert.equal(await page.locator("#ns-floor-f1.on").count(), 1, "F1 is the floor on arrival");
    await page.waitForFunction(() => (document.querySelector("#ns-readout")?.textContent || "").includes("PANEL LIGHTS ON"), null, { timeout: 10000 });

    // the unwired floor prints a sheet and says so
    await page.click("#ns-floor-l1");
    await page.waitForFunction(() => (document.querySelector("#ns-readout")?.textContent || "").includes("PREVIEW"), null, { timeout: 10000 });
    assert.equal(
      await txt(page.locator("#ns-readout")),
      "PREVIEW — LEVEL 1 — NOC & IT OPERATIONS · SHEET ONLY · NO DEVICES LOADED"
    );
    assert.equal(await page.locator("#ns-floor-l1.on").count(), 1, "L1 is marked active");
    assert.equal(await page.locator("#ns-floor-f1.on").count(), 0, "F1 is no longer active");
    assert.ok(!/PC-A|SRV-01|OF-01/.test(await txt(page.locator("#netspace-overlay"))), "the preview sheet names no office device");

    // nothing on a preview sheet is hot: a click opens no inspector
    const box = await page.locator("#netspace-canvas").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await page.locator("#device-overlay:not(.hidden)").count(), 0, "a sheet with no devices opens nothing");
    assert.equal(await page.locator("#ns-tip:not(.hidden)").count(), 0, "nothing on the sheet answers a hover");

    // back to the wired floor
    await page.click("#ns-floor-f1");
    await page.waitForFunction(() => (document.querySelector("#ns-readout")?.textContent || "").includes("PANEL LIGHTS ON"), null, { timeout: 10000 });
    assert.equal(await page.locator("#ns-floor-f1.on").count(), 1, "F1 is active again");

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
