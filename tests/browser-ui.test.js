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

test("facility map — four floors, one sheet, one breadcrumb", async () => {
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

    // VIRTUAL mode still has no building controls
    assert.equal(await page.locator("#ns-crumb.hidden").count(), 1, "VIRTUAL shows no breadcrumb");
    assert.equal(await page.locator("#ns-fac.hidden").count(), 1, "VIRTUAL shows no floor cards");

    // (a) physical opens on the office floor
    await page.click("#ns-mode-physical");
    await page.waitForSelector("#ns-crumb:not(.hidden)");
    assert.equal(await txt(page.locator("#ns-crumb-text")), "F1 — OFFICE");
    assert.match(await txt(page.locator("#ns-head-ctx")), /F1 — OFFICE/);
    await page.waitForFunction(() => (document.querySelector("#ns-readout")?.textContent || "").includes("PANEL LIGHTS ON"), null, { timeout: 10000 });

    // (b) FACILITY MAP opens the building
    await page.click("#ns-view-toggle");
    await page.waitForFunction(() => (document.querySelector("#ns-crumb-text")?.textContent || "").includes("FACILITY MAP"), null, { timeout: 10000 });
    const buildingCrumb = await txt(page.locator("#ns-crumb-text"));
    assert.match(buildingCrumb, /FACILITY MAP/);
    assert.match(await txt(page.locator("#ns-head-ctx")), /COMPLEX 09/);

    // (b2) the building zooms, and the zoom reaches the drawing scale
    assert.equal(await page.locator("#ns-zoom").evaluate(el => getComputedStyle(el).display), "flex", "the zoom bar is live in the building");
    const facZoom = () => page.evaluate(() => document.querySelector("#netspace-canvas").dataset.faczoom);
    assert.equal(await facZoom(), "1.00", "the building opens at zoom 1");
    await page.click("#ns-zoom-in");
    await page.click("#ns-zoom-in");
    assert.equal(await facZoom(), "1.44", "two clicks step the zoom");
    for (let i = 0; i < 10; i++) await page.click("#ns-zoom-in");
    assert.equal(await facZoom(), "2.20", "zoom is clamped at 2.2");
    await page.click("#ns-zoom-reset");
    assert.equal(await facZoom(), "1.00", "reset returns to 1");

    // (c) four cards; only the surveyed floor can be opened
    assert.equal(await page.locator("#ns-fac .fac-card").count(), 4);
    assert.equal(await page.locator("#fac-l1").evaluate(el => el.disabled), false, "L1 card is enabled");
    for (const id of ["l0", "l2", "l3"]) {
      assert.equal(await page.locator(`#fac-${id}`).evaluate(el => el.disabled), true, `${id} card is disabled`);
      assert.match(await txt(page.locator(`#fac-${id}`)), /NO SHEET — NOT SURVEYED/);
    }

    // (d) a card with no sheet cannot change the map
    const before = await txt(page.locator("#ns-readout"));
    await page.evaluate(() => document.querySelector('[data-floor="L2"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(await txt(page.locator("#ns-crumb-text")), buildingCrumb, "a void card leaves the building");
    assert.match(await txt(page.locator("#ns-head-ctx")), /COMPLEX 09/);
    assert.equal(await txt(page.locator("#ns-readout")), before, "a void card changes no readout");
    assert.equal(await page.locator("#fac-l2.active").count(), 0);

    // (a/b) slabs answer the pointer; a void floor says default
    const centreOf = async id => {
      const v = await page.evaluate(slab => document.querySelector("#netspace-canvas").dataset[slab], `slab${id}`);
      const [cx, cy] = v.split(",").map(Number);
      const box = await page.locator("#netspace-canvas").boundingBox();
      return { x: box.x + cx, y: box.y + cy };
    };
    const facHover = () => page.evaluate(() => document.querySelector("#netspace-canvas").dataset.facHover);
    const cursor = () => page.locator("#netspace-canvas").evaluate(el => el.style.cursor);
    const idle = () => page.waitForFunction(() => document.querySelector("#netspace-canvas").dataset.nsBusy === "0", null, { timeout: 10000 });

    const l1 = await centreOf("L1");
    await page.mouse.move(l1.x, l1.y);
    assert.equal(await facHover(), "L1", "the surveyed slab answers the pointer");
    assert.equal(await cursor(), "pointer", "a floor with a sheet is clickable");

    const l2 = await centreOf("L2");
    await page.mouse.move(l2.x, l2.y);
    assert.equal(await facHover(), "L2", "a void slab answers too");
    assert.equal(await cursor(), "default", "a floor without a sheet is not clickable");

    // (c) a void slab click opens nothing
    await page.mouse.click(l2.x, l2.y);
    await page.waitForTimeout(300);   // the swap, if any, would land inside this window
    assert.equal(await txt(page.locator("#ns-crumb-text")), buildingCrumb, "a void slab leaves the building");
    assert.equal(await txt(page.locator("#ns-readout")), before, "a void slab changes no readout");
    assert.equal(await page.evaluate(() => document.querySelector("#netspace-canvas").dataset.nsBusy), "0", "a void slab starts no transition");

    // (g) leaving the slab field clears the hover
    await page.mouse.move(l1.x, l1.y);
    assert.equal(await facHover(), "L1");
    await page.mouse.move(200, 30);
    assert.equal(await facHover(), "", "empty space clears the hover");

    // (f) the view transition has a real duration
    assert.equal(await page.locator("#ns-fade").count(), 1, "the fade layer exists");
    assert.notEqual(await page.locator("#ns-fade").evaluate(el => getComputedStyle(el).transitionDuration), "0s");

    // the surveyed card opens its sheet
    await page.click("#fac-l1");
    await page.waitForFunction(() => (document.querySelector("#ns-readout")?.textContent || "").includes("PREVIEW"), null, { timeout: 10000 });
    await idle();
    assert.equal(await txt(page.locator("#ns-crumb-text")), "L1 — NOC");
    assert.match(await txt(page.locator("#ns-head-ctx")), /L1 — NOC/);
    assert.equal(await page.locator("#fac-l1.active").count(), 1, "the open floor is marked active");
    assert.equal(await page.locator("#ns-fac.hidden").count(), 1, "cards belong to the building");

    // back to the building, then back to the office
    await page.click("#ns-view-toggle");
    await page.waitForFunction(() => (document.querySelector("#ns-crumb-text")?.textContent || "").includes("FACILITY MAP"), null, { timeout: 10000 });
    await idle();
    assert.equal(await page.locator("#fac-l1.active").count(), 1, "the surveyed floor stays marked");
    assert.equal(await txt(page.locator("#ns-view-toggle")), "BACK");

    // (d) the surveyed slab opens the same sheet the card does — behind the veil
    await page.mouse.move(l1.x, l1.y);
    await page.mouse.click(l1.x, l1.y);
    const duringOut = await page.evaluate(() => ({
      busy: document.querySelector("#netspace-canvas").dataset.nsBusy,
      crumb: (document.querySelector("#ns-crumb-text")?.textContent || "").trim(),
    }));
    assert.equal(duringOut.busy, "1", "the veil is busy");
    assert.equal(duringOut.crumb, buildingCrumb, "the swap waits for the dark");

    // (e) navigation is locked while the veil is down
    await page.evaluate(() => document.querySelector('[data-floor="L0"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(await page.evaluate(() => document.querySelector("#netspace-canvas").dataset.nsBusy), "1", "still busy");

    await page.waitForFunction(() => (document.querySelector("#ns-crumb-text")?.textContent || "").includes("L1 — NOC"), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector("#netspace-canvas").dataset.nsBusy === "0", null, { timeout: 10000 });
    assert.equal(await txt(page.locator("#ns-crumb-text")), "L1 — NOC", "the locked click changed nothing");
    assert.match(await txt(page.locator("#ns-head-ctx")), /L1 — NOC/);
    assert.match(await txt(page.locator("#ns-readout")), /PREVIEW/);
    assert.equal(await page.locator("#fac-l1.active").count(), 1);

    // and back to the office
    await page.click("#ns-view-toggle");
    await page.waitForFunction(() => (document.querySelector("#ns-crumb-text")?.textContent || "").includes("FACILITY MAP"), null, { timeout: 10000 });
    await idle();
    await page.click("#ns-view-toggle");
    await page.waitForFunction(() => (document.querySelector("#ns-readout")?.textContent || "").includes("PANEL LIGHTS ON"), null, { timeout: 10000 });
    assert.equal(await txt(page.locator("#ns-crumb-text")), "F1 — OFFICE");
    assert.match(await txt(page.locator("#ns-head-ctx")), /F1 — OFFICE/);

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
