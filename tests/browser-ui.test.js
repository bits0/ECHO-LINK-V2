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

    // (a) no window is open; the workspace itself is the focused surface
    assert.equal(await page.locator("#win-terminal, #win-browser").count(), 0, "(a) no window is open yet");
    assert.equal(await page.locator("#dock-pc.is-open").count(), 1, "(a) the desktop surface is open");
    assert.equal(await page.locator("#dock-pc.is-active").count(), 1, "(a) the desktop surface is active");

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

    // (e) closing the browser clears the last window marker
    await page.click("#win-browser .wb-close");
    await page.waitForSelector("#win-browser", { state: "detached" });
    assert.equal(await page.locator(".dock-item.is-open:not(#dock-pc)").count(), 0, "(e) no window is open");
    assert.equal(await page.locator("#dock-pc.is-active").count(), 1, "(e) the workspace takes focus back");

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

    // Chapter 1 keeps two modes; the feed is an Act 0 view
    assert.equal(await page.locator(".ns3d-modes .ns-mode").count(), 2, "no SYSLOG mode outside Act 0");
    assert.equal(await page.locator("#ns-mode-syslog").count(), 0);
    assert.equal(await page.locator("#ns-syslog").count(), 0);

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

    // (a/b) the stack is fitted to the canvas and reads top to bottom
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const fit = await page.evaluate(() => {
      const c = document.querySelector("#netspace-canvas");
      return {
        w: c.clientWidth, h: c.clientHeight,
        pts: ["L0","L1","L2","L3"].map(id => c.dataset["slab" + id].split(",").map(Number)),
      };
    });
    for (const [x, y] of fit.pts) {
      assert.ok(x >= 40 && x <= fit.w - 40, `slab x ${x} keeps its margin (${fit.w}px wide)`);
      assert.ok(y >= 40 && y <= fit.h - 40, `slab y ${y} keeps its margin (${fit.h}px tall)`);
    }
    for (let i = 1; i < fit.pts.length; i++) {
      const gap = fit.pts[i][1] - fit.pts[i - 1][1];
      assert.ok(gap >= 20, `floors ${i - 1}→${i} are ${gap}px apart`);
    }

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

test("Act 0 syslog — a third NetSpace view: cards, counts, filters, freeze, locate", async () => {
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
    await page.click("#btn-act0");
    await page.waitForSelector("#dock-netspace");
    assert.equal(await page.locator("#dock-syslog").count(), 0, "the desktop dock no longer offers SYSLOG");
    await page.click("#dock-netspace");
    await page.waitForSelector("#ns-mode-syslog");

    // (a) three modes; SYSLOG swaps the canvas region to the feed
    assert.equal(await page.locator(".ns3d-modes .ns-mode").count(), 3, "VIRTUAL, PHYSICAL, SYSLOG");
    assert.equal(await page.locator("#ns-mode-virtual.on").count(), 1, "the board opens in VIRTUAL");
    assert.equal(await page.locator("#ns-syslog.hidden").count(), 1, "the feed is not the opening view");
    await page.click("#ns-mode-syslog");
    assert.equal(await page.locator("#ns-mode-syslog.on").count(), 1);
    assert.equal(await page.locator("#ns-mode-virtual.on").count(), 0);
    assert.equal(await page.locator("#ns-syslog.hidden").count(), 0, "SYSLOG shows the feed");
    assert.equal(await page.locator(".sys-card").count(), 12, "boot draws the twelve calm cards");

    const countOf = async cls => Number((await txt(page.locator(`#nf-counts .${cls}`))).split(/\s+/)[1]);
    assert.equal(await countOf("nf-i"), 12);
    assert.equal(await countOf("nf-w"), 0);
    assert.equal(await countOf("nf-c"), 0);

    // (b) the cascade lands in the same feed; counts sum to the card count
    await page.evaluate(() => import("/js/act0.js").then(m => m.cascade()));
    await page.waitForFunction(() => document.querySelectorAll(".sys-card").length === 36, null, { timeout: 10000 });
    const sum = await page.evaluate(() =>
      ["nf-i", "nf-w", "nf-c"].reduce((n, c) => n + Number(document.querySelector(`#nf-counts .${c}`).textContent.split(" ")[1]), 0));
    assert.equal(sum, 36, "the header counts sum to the feed");
    assert.equal(await page.locator(".sys-card.info").count(), 14);
    assert.equal(await page.locator(".sys-card.warn").count(), 6);
    assert.equal(await page.locator(".sys-card.crit").count(), 16);
    assert.equal(await page.locator(".sys-card").last().locator(".sc-ts").textContent(), "02:14:00.047", "newest card at the tail");

    // (c) one chip at a time: CRIT keeps only critical cards
    await page.click('.nf-chip[data-chip="CRIT"]');
    assert.equal(await page.locator(".nf-chip.on").count(), 1);
    assert.equal(await page.locator(".sys-card").count(), 16);
    assert.equal(await page.locator(".sys-card:not(.crit)").count(), 0);
    assert.equal(await countOf("nf-c"), 16);

    // (f) THE ANOMALY CHECK — same class list, same payload keys as a neighbour
    const anomaly = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".sys-card")];
      const target = cards.find(c => c.querySelector(".sc-ts").textContent === "02:13:58.771");
      const other = cards.find(c => c.classList.contains("crit") && c !== target);
      return {
        found: !!target,
        sameClass: target.className === other.className,
        sameKeys: JSON.stringify([...target.querySelectorAll(".sc-kv .k")].map(k => k.textContent))
          === JSON.stringify([...other.querySelectorAll(".sc-kv .k")].map(k => k.textContent)),
      };
    });
    assert.equal(anomaly.found, true, "the 02:13:58.771 card is in the feed");
    assert.equal(anomaly.sameClass, true, "the anomaly has exactly a CRIT card's class list");
    assert.equal(anomaly.sameKeys, true, "the anomaly payload has exactly a CRIT card's keys");

    // (d) FREEZE holds the view; unfreezing returns to the tail
    await page.click('.nf-chip[data-chip="ALL"]');
    await page.waitForFunction(() => document.querySelectorAll(".sys-card").length === 36);
    const scrollTop = () => page.evaluate(() => document.querySelector("#nf-scroll").scrollTop);
    await page.evaluate(() => { document.querySelector("#nf-scroll").scrollTop = 0; });
    await page.click("#nf-freeze");
    assert.equal(await page.locator("#nf-freeze.on").count(), 1);
    const held = await scrollTop();
    await page.waitForTimeout(1000);
    assert.equal(await scrollTop(), held, "FREEZE stops the auto-scroll");
    await page.click("#nf-freeze");
    await page.waitForFunction(() => {
      const s = document.querySelector("#nf-scroll");
      return Math.abs(s.scrollTop - (s.scrollHeight - s.clientHeight)) <= 1;
    }, null, { timeout: 5000 });

    // NEGATIVE — L0 is hidden before a console session; the source refuses
    const sourceOf = text => page.locator(".sys-card").filter({ has: page.locator(".sys-src", { hasText: text }) }).first().locator(".sys-src");
    await sourceOf("L0-SW-ACC01").click();
    assert.equal(await txt(page.locator("#toast")), "not visible on the board yet");
    assert.equal(await page.locator("#ns-mode-syslog.on").count(), 1, "the toast leaves SYSLOG in place");
    assert.equal(await page.evaluate(() => document.querySelector("#netspace-canvas").dataset.act0Pulse), undefined);

    // (e) a visible source switches to VIRTUAL and pulses its node
    await sourceOf("L1-SW-DIST01").click();
    assert.equal(await page.locator("#ns-mode-virtual.on").count(), 1, "locating returns to the board");
    assert.equal(await page.locator("#ns-syslog.hidden").count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector("#netspace-canvas").dataset.act0Pulse), "L1-SW-DIST01");

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test("Act 0 cascade — the wave arrives card by card", async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const problems = [];
  const watch = p => {
    p.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
    p.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
    });
    p.on("dialog", d => d.accept());
  };
  const openFeed = async p => {
    await p.goto(url);
    await p.click("#btn-act0");
    await p.waitForSelector("#dock-netspace");
    await p.click("#dock-netspace");
    await p.waitForSelector("#ns-mode-syslog");
    await p.click("#ns-mode-syslog");
    await p.waitForSelector("#ns-syslog:not(.hidden)");
  };
  const snap = p => p.evaluate(() => ({
    cards: document.querySelectorAll(".sys-card").length,
    fresh: document.querySelectorAll(".sys-card.is-new").length,
    header: ["nf-i", "nf-w", "nf-c"].map(c => Number(document.querySelector(`#nf-counts .${c}`).textContent.split(" ")[1])),
  }));
  try {
    browser = await chromium.launch({ headless: true });

    // ---- the wave, sampled while it lands ----
    const page = await browser.newPage();
    watch(page);
    await openFeed(page);
    assert.equal(await page.locator(".sys-card").count(), 12, "the twelve calm cards are drawn");

    await page.evaluate(() => import("/js/act0.js").then(m => m.cascadeStream({ minDelay: 100, maxDelay: 100 })));
    await page.waitForTimeout(500);
    const at500 = await snap(page);
    await page.waitForTimeout(1000);
    const at1500 = await snap(page);
    const tFull = Date.now();
    await page.waitForFunction(() => document.querySelectorAll(".sys-card").length === 36,
      null, { timeout: 20000 });
    const arriveMs = Date.now() - tFull;
    const atFull = await snap(page);
    console.log(`cascade samples: 0.5s=${at500.cards} 1.5s=${at1500.cards}; full wave after ${arriveMs}ms`);

    assert.ok(at500.cards > 12 && at500.cards < 24, `(w) the feed grows in steps (0.5s: ${at500.cards})`);
    assert.ok(at500.fresh > 0, "arriving cards carry .is-new");
    assert.ok(at1500.cards > at500.cards && at1500.cards < 36, `(w) still climbing at 1.5s (${at1500.cards})`);
    assert.equal(at1500.header[0] + at1500.header[1] + at1500.header[2], at1500.cards, "header counts follow the feed");
    assert.ok(at1500.header[2] > 0 && at1500.header[0] >= 12, "the counters tick up mid-stream");
    assert.equal(atFull.cards, 36, "the whole block landed");
    assert.deepEqual(atFull.header, [14, 6, 16], "final counts are the feed's own tally");
    await page.waitForFunction(() => document.querySelectorAll(".sys-card.is-new").length === 0,
      null, { timeout: 2000 });
    assert.equal((await snap(page)).fresh, 0, "the arrival class ages out");
    assert.equal(await page.locator(".sys-card").last().locator(".sc-ts").textContent(), "02:14:00.047", "newest card at the tail");

    // the anomaly still wears exactly a CRIT card's class list
    const anomaly = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".sys-card")];
      const target = cards.find(c => c.querySelector(".sc-ts").textContent === "02:13:58.771");
      const other = cards.find(c => c.classList.contains("crit") && c !== target);
      return { found: !!target, same: !!target && target.className === other.className };
    });
    assert.equal(anomaly.found, true, "the 02:13:58.771 card is in the feed");
    assert.equal(anomaly.same, true, "the anomaly is indistinguishable from another CRIT card");
    await page.close();

    // ---- freeze while the wave is landing ----
    const parked = await browser.newPage();
    watch(parked);
    await openFeed(parked);
    assert.equal(await parked.locator(".sys-card").count(), 12, "freeze at twelve visible cards");
    await parked.click("#nf-freeze");
    assert.equal(await parked.locator("#nf-freeze.on").count(), 1, "the feed is frozen");
    const top = await parked.locator("#nf-scroll").evaluate(el => el.scrollTop);
    await parked.evaluate(() => import("/js/act0.js").then(m => m.cascadeStream({ minDelay: 120, maxDelay: 120 })));
    await parked.waitForTimeout(1500);
    assert.equal(await parked.locator("#nf-scroll").evaluate(el => el.scrollTop), top, "the frozen feed does not move");
    const pill = await parked.locator("#nf-new").innerText();
    assert.ok(Number(pill.split(" ")[0]) > 0, `the pill counts the arrivals (${pill})`);
    assert.equal(await parked.locator("#nf-new.hidden").count(), 0, "the pill is visible while frozen");
    await parked.click("#nf-new");
    await parked.waitForTimeout(450);
    assert.equal(await parked.locator("#nf-new.hidden").count(), 1, "unfreeze clears the pill");
    assert.equal(await parked.locator("#nf-scroll").evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop <= 1),
      true, "unfreeze returns to the newest card");
    await parked.close();

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test("syslog — scrollback holds, and the wave keeps its own pace", async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const problems = [];
  const watch = p => {
    p.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
    p.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
    });
    p.on("dialog", d => d.accept());
  };
  const openFeed = async p => {
    await p.goto(url);
    await p.click("#btn-act0");
    await p.waitForSelector("#dock-netspace");
    await p.click("#dock-netspace");
    await p.waitForSelector("#ns-mode-syslog");
    await p.click("#ns-mode-syslog");
    await p.waitForSelector("#ns-syslog:not(.hidden)");
  };
  const atBottom = p => p.locator("#nf-scroll").evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop <= 4);
  try {
    browser = await chromium.launch({ headless: true });

    // ---- scrollback while cards keep arriving ----
    const page = await browser.newPage();
    watch(page);
    await openFeed(page);
    await page.evaluate(() => import("/js/act0.js").then(m => m.cascadeStream({ minDelay: 250, maxDelay: 250 })));
    await page.waitForTimeout(1000);

    // (aa) read the top: the feed must hold still while cards land underneath
    await page.locator("#nf-scroll").evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(1200);
    const top = await page.locator("#nf-scroll").evaluate(el => el.scrollTop);
    assert.ok(top <= 40, `(aa) a scrolled-up feed is not snapped (scrollTop ${top})`);
    const pill = await page.locator("#nf-new").innerText();
    assert.ok(Number(pill.split(" ")[0]) > 0, `(aa) the pill counts what arrived (${pill})`);
    assert.equal(await page.locator("#nf-new.hidden").count(), 0, "(aa) the pill is visible");

    // (ab) the pill returns to the newest card
    await page.click("#nf-new");
    assert.equal(await atBottom(page), true, "(ab) the pill jumps to the bottom");

    // (ac) a manual return to the bottom is sticky
    await page.locator("#nf-scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(1200);
    assert.equal(await atBottom(page), true, "(ac) the bottom stays pinned");

    // the wave finishes; a finished feed does not snap either
    await page.waitForFunction(() => document.querySelectorAll(".sys-card").length === 36, null, { timeout: 30000 });
    await page.locator("#nf-scroll").evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("#nf-scroll").evaluate(el => el.scrollTop), 0, "(aa) a finished wave still holds its place");

    // (ad) FREEZE pins mid-list; unfreeze goes to the bottom
    await page.locator("#nf-scroll").evaluate(el => { el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2); });
    const mid = await page.locator("#nf-scroll").evaluate(el => el.scrollTop);
    await page.click("#nf-freeze");
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("#nf-scroll").evaluate(el => el.scrollTop), mid, "(ad) frozen mid-list, nothing moves");
    await page.click("#nf-freeze");
    await page.waitForTimeout(150);
    assert.equal(await atBottom(page), true, "(ad) unfreeze returns to the bottom");
    assert.equal(await page.locator("#nf-scroll").isVisible(), true, "the feed is still the feed");
    await page.close();

    // ---- the act's own cadence: one card every 1–5s ----
    const slow = await browser.newPage();
    watch(slow);
    await openFeed(slow);
    const started = Date.now();
    await slow.evaluate(() => import("/js/act0.js").then(m => m.cascadeStream()));

    // time the wait for the first card; never sample a fixed instant
    const t0 = Date.now();
    await slow.waitForFunction(() => document.querySelectorAll(".sys-card").length > 12,
      null, { timeout: 15000 });
    const firstGap = (Date.now() - t0) / 1000;
    assert.ok(firstGap >= 0.9 && firstGap <= 8,
      `first card arrives on a seconds scale (${firstGap.toFixed(2)}s)`);

    // pace, not a snapshot: wait for the next card and time that gap too
    const before = await slow.locator(".sys-card").count();
    const t1 = Date.now();
    await slow.waitForFunction(c => document.querySelectorAll(".sys-card").length > c,
      before, { timeout: 15000 });
    const nextGap = (Date.now() - t1) / 1000;
    assert.ok(nextGap >= 0.9 && nextGap <= 8,
      `the next card is a seconds-scale gap (${nextGap.toFixed(2)}s)`);

    await slow.waitForFunction(() => document.querySelectorAll(".sys-card").length === 36, null, { timeout: 150000 });
    const seconds = (Date.now() - started) / 1000;
    console.log(`cadence: first=${firstGap.toFixed(2)}s next=${nextGap.toFixed(2)}s total=${seconds.toFixed(1)}s`);
    assert.ok(seconds >= 20 && seconds <= 160, `24 gaps on a human scale (took ${seconds.toFixed(1)}s)`);
    await slow.close();

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test("Act 0 board — one graph per layer, a device card, and the rack", async () => {
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
    await page.click("#btn-act0");
    await page.waitForSelector("#dock-netspace");
    await page.click("#dock-netspace");
    await page.waitForSelector("#ns-mode-syslog");

    const canvasBox = await page.locator("#netspace-canvas").boundingBox();
    const data = key => page.evaluate(k => JSON.parse(document.querySelector("#netspace-canvas").dataset[k]), key);
    const clickAt = (x, y) => page.mouse.click(canvasBox.x + x, canvasBox.y + y);
    const clickNode = async id => {
      const b = (await data("act0Boxes"))[id];
      await clickAt(b.x + b.w/2, b.y + b.h/2);
      await page.waitForTimeout(120);
    };
    const pickLayer = async (l, count) => {
      await page.click(`.ns-layer[data-layer="${l}"]`);
      await page.waitForFunction(n =>
        Object.keys(JSON.parse(document.querySelector("#netspace-canvas").dataset.act0Boxes)).length === n, count);
      return { boxes: await data("act0Boxes"), links: await data("act0Links") };
    };
    const boxIds = boxes => Object.keys(boxes);
    await page.waitForFunction(() => !!document.querySelector("#netspace-canvas").dataset.act0Boxes);

    // (a) the board opens on L1: its own six nodes, laid out as a spine
    assert.equal(await page.evaluate(() => document.querySelector("#netspace-canvas").dataset.act0Layer), "L1", "(a) L1 is the default layer");
    assert.equal(await page.locator('.ns-layer[data-layer="L1"]').getAttribute("aria-pressed"), "true", "(a) L1 is pressed");
    assert.equal(await page.locator('.ns-layer[data-layer="L0"]').isDisabled(), true, "(a) L0 is disabled before a session");
    const l1 = await data("act0Boxes");
    assert.equal(boxIds(l1).length, 6, "(a) L1 has its six nodes");
    const l1Links = await data("act0Links");
    assert.equal(l1Links.length, 5, "(a) five cables inside L1");
    assert.equal(l1Links.every(l => !l.external), true, "(a) every L1 cable stays inside the layer");
    assert.ok(l1["L1-RTR-LOC01"].y < l1["L1-SW-DIST01"].y, "(a) positions come from the layer layout, not a row");

    // kinds are derived for every node, and several kinds are in play
    const kinds = await data("act0Kinds");
    const distinct = [...new Set(Object.values(kinds))];
    assert.equal(Object.keys(kinds).length, 21, "(a) kinds cover all 21 nodes");
    assert.ok(distinct.length >= 6, `(a) at least six kinds (${distinct.join(", ")})`);
    for (const k of ["switch", "router", "server", "camera", "storage"])
      assert.ok(distinct.includes(k), `(a) ${k} is derived`);
    assert.deepEqual(new Set(distinct), new Set(distinct.filter(k =>
      ["switch","router","server","workstation","console","ups","nvr","acs","storage","camera","generic"].includes(k))),
      new Set(distinct), "(a) no kind invented outside the mapping");
    const nodes = await page.evaluate(() => import("/js/state.js").then(m => m.S.nodes.length));
    assert.equal(nodes, 21, "NEGATIVE — the roster is untouched");

    // (b) L2 is its own graph: two access switches and their two links
    const l2 = await pickLayer("L2", 2);
    assert.equal(boxIds(l2.boxes).length, 2, "(b) L2 has two nodes");
    assert.equal(l2.links.length, 2, "(b) L2 shows exactly its two links");
    assert.deepEqual(l2.links.map(l => l.external), [true, true], "(b) both far ends live on L1, so both are stubs");
    assert.equal(boxIds(l2.boxes).every(id => id.startsWith("L2-")), true, "(b) no L1 nodes leak into the view");

    // (c) L3: core, archive and SAN cable together; the uplinks become stubs
    const l3 = await pickLayer("L3", 3);
    assert.equal(boxIds(l3.boxes).length, 3, "(c) L3 has three nodes");
    assert.equal(l3.links.length, 4, "(c) four links touch L3");
    assert.equal(l3.links.filter(l => l.external).length, 2, "(c) two are off-layer stubs");

    // (e) every visible node appears in exactly one layer view
    const boot = [...new Set([...boxIds(l1), ...boxIds(l2.boxes), ...boxIds(l3.boxes)])];
    assert.equal(boot.length, 11, "(e) L1+L2+L3 hold the eleven boot nodes");
    assert.equal(boot.length, boxIds(l1).length + boxIds(l2.boxes).length + boxIds(l3.boxes).length, "(e) no node appears twice");

    // (f) a node in L2 opens the same card, and a layer change closes it
    await pickLayer("L2", 2);
    await clickNode("L2-SW-ACC01");
    assert.equal(await page.locator("#ns-card.hidden").count(), 0, "(f) the L2 node opens a card");
    assert.equal(await txt(page.locator("#nsc-name")), "L2-SW-ACC01", "(f) the card names the L2 node");
    await page.click('.ns-layer[data-layer="L3"]');
    assert.equal(await page.locator("#ns-card.hidden").count(), 1, "NEGATIVE — switching layers closes the card");
    await pickLayer("L1", 6);

    // the cascade lands; the board's state dots and the card read the same data
    await page.evaluate(() => import("/js/act0.js").then(m => m.cascade()));
    await page.waitForTimeout(150);

    // (b) clicking L1-SW-DIST01 opens a card tied to its own newest line
    await clickNode("L1-SW-DIST01");
    assert.equal(await page.locator("#ns-card.hidden").count(), 0, "(b) the card is open");
    assert.equal(await txt(page.locator("#nsc-kind")), "SWITCH");
    assert.equal(await txt(page.locator("#nsc-name")), "L1-SW-DIST01");
    assert.equal(await txt(page.locator("#nsc-state")), "RED", "(b) the card follows the cascade");
    assert.equal(await txt(page.locator("#nsc-layer")), "L1 — OPERATIONS");
    assert.equal(await txt(page.locator("#nsc-physical")), "distribution switch");
    assert.match(await txt(page.locator("#nsc-last")), /^02:14:00\.033 · stp topology change$/, "(b) LAST EVENT is its own newest entry");
    // the same mechanism yields each device's own newest line (ordered, not sorted)
    await pickLayer("L3", 3);
    await clickNode("L3-SW-CORE01");
    assert.equal(await txt(page.locator("#nsc-name")), "L3-SW-CORE01", "another node replaces the card");
    assert.equal(await txt(page.locator("#nsc-last")), "02:14:00.038 · stp topology change");

    // the card sits below the mode buttons and never covers them
    const cardBox = await page.locator("#ns-card").boundingBox();
    const modeBox = await page.locator(".ns3d-modes").boundingBox();
    assert.ok(cardBox.y >= modeBox.y + modeBox.height, "the card starts below the mode row");
    assert.ok(cardBox.x + cardBox.width <= 1280, "the card is docked inside the map");
    const modeHit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && !!el.closest(".ns3d-modes");
    }, [modeBox.x + modeBox.width/2, modeBox.y + modeBox.height/2]);
    assert.equal(modeHit, true, "the mode buttons stay on top");

    // (d) Escape closes the card; the board remains
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#ns-card.hidden").count(), 1, "(d) Escape closes the card");
    assert.equal(await page.locator("#ns-mode-virtual.on").count(), 1, "(d) the board remains");
    assert.equal(await page.evaluate(() => !!document.querySelector("#netspace-canvas").dataset.act0Boxes), true);

    // (c) SHOW IN FEED switches to SYSLOG filtered to that device
    await pickLayer("L1", 6);
    await clickNode("L1-SW-DIST01");
    await page.click("#nsc-show");
    assert.equal(await page.locator("#ns-mode-syslog.on").count(), 1, "(c) SHOW IN FEED opens SYSLOG");
    assert.equal(await page.locator("#ns-card.hidden").count(), 1, "the feed is not covered by the card");
    await page.waitForTimeout(200);
    const sources = await page.locator(".sys-card .sys-src").allInnerTexts();
    assert.ok(sources.length > 0, "(c) the filtered feed has cards");
    assert.ok(sources.every(s => s === "L1-SW-DIST01"), "(c) every visible card is the device's own");
    assert.equal(await txt(page.locator(".nf-device")), "L1-SW-DIST01 ×", "(c) the device chip is shown");
    const filteredCounts = await page.evaluate(() =>
      ["nf-i", "nf-w", "nf-c"].map(c => Number(document.querySelector(`#nf-counts .${c}`).textContent.split(" ")[1])));
    assert.deepEqual(filteredCounts, [1, 1, 2], "(c) counters reflect what is displayed");
    assert.match(await txt(page.locator("#nf-counts")), /SHOWING 4\/36/, "(c) the header says it is filtered");
    await page.click(".nf-device");
    assert.equal(await page.locator(".sys-card").count(), 36, "(c) the device chip clears the filter");
    assert.equal(await page.locator(".nf-device").count(), 0, "(c) the chip is gone");
    const cleared = await page.evaluate(() =>
      ["nf-i", "nf-w", "nf-c"].map(c => Number(document.querySelector(`#nf-counts .${c}`).textContent.split(" ")[1])));
    assert.deepEqual(cleared, [14, 6, 16], "(c) the counters return to the whole feed");

    // (e) the bench: three-unit rack, same click-then-click seating, one log line
    await page.click("#ns-mode-physical");
    await page.waitForFunction(() => !!document.querySelector("#netspace-canvas").dataset.act0Bench);
    const bench = await data("act0Bench");
    await clickAt(bench.left.x + bench.left.w/2, bench.left.y + bench.left.h/2);
    await clickAt(bench.right.x + bench.right.w/2, bench.right.y + bench.right.h/2);
    await page.waitForTimeout(120);
    const seatedLogs = () => page.evaluate(() =>
      import("/js/state.js").then(m => m.S.logs.filter(l => l.message.includes("console lead seated")).length));
    assert.equal(await seatedLogs(), 1, "(e) exactly one console-lead log line");
    await clickAt(bench.lead.x, bench.lead.y);
    assert.equal(await txt(page.locator("#toast")), "console lead is seated", "(e) the lead is drawn and answers the single-use toast");
    await clickAt(bench.right.x + bench.right.w/2, bench.right.y + bench.right.h/2);
    assert.equal(await seatedLogs(), 1, "(e) the lead cannot be seated twice");

    // (d) L0 stays shut until a console session opens it; then it is its own graph
    assert.equal(await page.locator('.ns-layer[data-layer="L0"]').isDisabled(), true, "(d) L0 is still disabled before the session");
    await page.click("#dock-terminal");
    await page.waitForSelector(".term-input");
    await page.fill(".term-input", "session open sw-l0");
    await page.press(".term-input", "Enter");
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".t-line")].some(l => l.textContent.includes("connected to SW-L0")));
    await page.click("#win-terminal .wb-close");
    await page.waitForSelector("#win-terminal", { state: "detached" });
    await page.click("#ns-mode-virtual");
    await page.waitForFunction(() => {
      const b = document.querySelector('.ns-layer[data-layer="L0"]');
      return b && !b.disabled;
    });
    const l0 = await pickLayer("L0", 10);
    assert.equal(boxIds(l0.boxes).length, 10, "(d) L0 has its ten nodes");
    assert.equal(l0.links.length, 9, "(d) nine links inside L0");
    assert.equal(l0.links.every(l => !l.external), true, "(d) every L0 link is internal");
    const all = [...new Set([...boot, ...boxIds(l0.boxes)])];
    assert.equal(all.length, 21, "(e) with L0 live the views cover all 21 nodes");

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

test("shell dock — one dock, three states, one surface", async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const problems = [];
  const watch = page => {
    page.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
    page.on("console", m => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
    });
    page.on("dialog", d => d.accept());
  };
  const dockIds = page => page.locator("#shell-dock .dock-item").evaluateAll(btns => btns.map(b => b.dataset.dock));
  const dockShown = async page => {
    const box = await page.locator("#shell-dock").boundingBox();
    const display = await page.locator("#shell-dock").evaluate(el => getComputedStyle(el).display);
    return display !== "none" && !!box && box.height > 0;
  };
  try {
    browser = await chromium.launch({ headless: true });

    // ---------- Act 0 ----------
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    watch(page);
    await page.goto(url);
    await page.click("#btn-act0");
    await page.waitForSelector("#game-screen:not(.hidden)");

    // (a) exactly one dock for the whole shell
    assert.equal(await page.locator("#shell-dock").count(), 1, "(a) the shell owns one dock");
    assert.equal(await page.locator(".ns3d-dock").count(), 0, "(a) Network Space has no dock of its own");
    assert.equal(await page.locator(".desk-dock").count(), 0, "(a) the desktop has no dock of its own");

    // (b) Act 0 vocabulary
    assert.deepEqual(await dockIds(page), ["terminal", "netspace", "notepad", "sop", "quit"]);
    const act0Labels = await txt(page.locator("#shell-dock"));
    for (const label of ["TERMINAL", "NETWORK SPACE", "NOTEPAD", "SOP", "QUIT TO TITLE"])
      assert.ok(act0Labels.includes(label), `(b) ${label} is on the dock`);

    // (j) the action stands apart from the tools, at 1280x720
    const spacing = await page.evaluate(() => {
      const tools = [...document.querySelectorAll("#shell-dock .dock-item:not(.dock-action)")];
      const action = document.querySelector("#dock-quit").getBoundingClientRect();
      const last = tools[tools.length - 1].getBoundingClientRect();
      return {
        gap: action.left - last.right,
        actionLeft: action.left,
        toolRights: tools.map(t => t.getBoundingClientRect().right),
        dividers: document.querySelectorAll("#shell-dock .dock-divider").length,
      };
    });
    assert.ok(spacing.gap >= 24, `(j) the gap before QUIT is ${spacing.gap}px (wanted >= 24)`);
    assert.ok(spacing.toolRights.every(r => spacing.actionLeft > r), "(j) QUIT sits right of every tool");
    assert.equal(spacing.dividers, 1, "(j) one divider separates the tools from the action");

    // (d) Network Space opens over the desktop; the one dock sits above it
    await page.click("#dock-netspace");
    await page.waitForSelector("#ns-mode-virtual");
    // ...and the map brings no dock of its own with it
    assert.equal(await page.locator("#shell-dock").count(), 1, "(a) still exactly one dock with the map open");
    assert.equal(await page.locator(".ns3d-dock").count(), 0, "(a) the map adds no second dock");
    assert.equal(await page.locator(".desk-dock").count(), 0, "(a) the desktop adds no second dock");
    assert.equal(await dockShown(page), true, "(d) the dock stays visible over Network Space");
    assert.equal(await page.locator("#dock-netspace.is-open").count(), 1, "(d) Network Space is open");
    assert.equal(await page.locator("#dock-netspace.is-active").count(), 1, "(d) Network Space is active");
    assert.equal(await page.locator(".dock-item.is-active").count(), 1, "(d) exactly one item is active");
    assert.equal(await page.locator(".dock-item.is-open:not(#dock-netspace)").count(), 0, "(d) the other tools stay closed");
    assert.equal(await page.evaluate(() => {
      const b = document.querySelector("#dock-netspace").getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return !!hit && !!hit.closest("#shell-dock");
    }), true, "(d) the dock paints above the map");

    // (e) clicking the active item minimises: open stays, active goes
    await page.click("#dock-netspace");
    assert.equal(await page.locator("#netspace-overlay.hidden").count(), 1, "(e) the overlay is parked");
    assert.equal(await page.locator("#dock-netspace.is-open").count(), 1, "(e) Network Space is still open");
    assert.equal(await page.locator("#dock-netspace.is-active").count(), 0, "(e) it is no longer active");
    assert.equal(await page.locator(".dock-item.is-active").count(), 0, "(e) nothing else takes focus");

    // (f) + NEGATIVE — clicking it again restores it; two clicks end visible
    await page.click("#dock-netspace");
    assert.equal(await page.locator("#netspace-overlay.hidden").count(), 0, "(f) the overlay is back");
    assert.equal(await page.locator("#dock-netspace.is-active").count(), 1, "(f) focus returns");
    await page.click("#dock-netspace");
    await page.click("#dock-netspace");
    assert.equal(await page.locator("#netspace-overlay.hidden").count(), 0, "(f) a double click ends visible, not stuck hidden");
    assert.equal(await page.locator("#dock-netspace.is-active").count(), 1);

    // (g) INVERTED — a tool floats over the map instead of replacing it
    await page.click("#dock-terminal");
    await page.waitForSelector("#win-terminal");
    assert.equal(await page.locator("#netspace-overlay.hidden").count(), 0, "(g) the map stays visible");
    assert.equal(await page.locator("#win-terminal").count(), 1, "(g) the terminal window exists");
    assert.equal(await page.locator("#dock-terminal.is-active").count(), 1, "(g) TERMINAL is active");
    assert.equal(await page.locator("#dock-netspace.is-open").count(), 1, "(g) NETWORK SPACE is still open");
    assert.equal(await page.locator("#dock-netspace.is-active").count(), 0, "(g) NETWORK SPACE yields focus");
    assert.equal(await page.evaluate(() => {
      const b = document.querySelector("#win-terminal").getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return !!hit && !!hit.closest("#win-terminal");
    }), true, "(g) the window paints above the map");

    // (h) closing the last floating window leaves the map up (NEGATIVE)
    await page.click("#win-terminal .wb-close");
    await page.waitForSelector("#win-terminal", { state: "detached" });
    assert.equal(await page.locator("#dock-terminal.is-open").count(), 0, "(h) TERMINAL is closed");
    assert.equal(await page.locator("#netspace-overlay.hidden").count(), 0, "(h) the map is still up");
    assert.equal(await dockShown(page), true, "(h) the dock stays visible");

    // (i) touching the map returns focus to it; floating windows stay put
    await page.click("#dock-terminal");
    await page.waitForSelector("#win-terminal");
    const canvasSpot = await page.evaluate(() => {
      const c = document.querySelector("#netspace-canvas");
      const r = c.getBoundingClientRect();
      for (const [fx, fy] of [[0.008, 0.6], [0.992, 0.6], [0.008, 0.3]]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y) === c) return { x, y };
      }
      return null;
    });
    assert.ok(canvasSpot, "(i) an empty patch of the map canvas is reachable");
    await page.mouse.click(canvasSpot.x, canvasSpot.y);
    assert.equal(await page.locator("#dock-netspace.is-active").count(), 1, "(i) the map takes focus back");
    assert.equal(await page.locator("#dock-terminal.is-active").count(), 0, "(i) the terminal yields focus");
    assert.equal(await page.locator("#win-terminal").count(), 1, "(i) the floating window stays where it is");

    // (q) QUIT TO TITLE leaves the game, keeps the save, takes the dock
    await page.click("#dock-quit");
    await page.waitForSelector("#title-screen:not(.hidden)");
    assert.equal(await page.locator("#game-screen.hidden").count(), 1, "(q) the game screen is gone");
    assert.equal(await page.locator("#shell-dock.hidden").count(), 1, "(q) the dock leaves with it");
    const saved = await page.evaluate(() => localStorage.getItem("echolink-ch1-save-v1"));
    assert.ok(saved, "(q) the save key is still present");
    assert.equal(JSON.parse(saved).act0, true, "(q) the save still holds Act 0");
    await page.close();

    // ---------- Chapter 1 ----------
    const lab = await browser.newPage();
    watch(lab);
    await lab.goto(url);
    await lab.click("#btn-lab");
    await lab.waitForSelector("#game-screen:not(.hidden)");

    // (c) Chapter 1 vocabulary
    assert.deepEqual(await dockIds(lab), ["terminal", "browser", "netspace", "pc", "away"]);
    const ch1Labels = await txt(lab.locator("#shell-dock"));
    for (const label of ["TERMINAL", "BROWSER", "NETWORK SPACE", "PC", "STEP AWAY"])
      assert.ok(ch1Labels.includes(label), `(c) ${label} is on the dock`);
    assert.equal(await dockShown(lab), true, "the dock is there over the physical room");

    // the phone outranks the dock; the dock returns when the phone is away
    await lab.click("#phone-button");
    await lab.waitForSelector("#phone-overlay:not(.hidden)");
    assert.equal(await lab.evaluate(() => {
      const b = document.querySelector("#dock-netspace").getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return !!hit && !!hit.closest("#phone-overlay");
    }), true, "the phone sits above the dock");
    await lab.click("#phone-close");
    assert.equal(await dockShown(lab), true, "the dock is visible with the phone away");

    await lab.click('[data-hs="door:office"]');
    await lab.waitForSelector('[data-hs="device:PC-C"]');
    await lab.click('[data-hs="device:PC-C"]');
    await lab.click("#dv-use");
    await lab.waitForSelector("#desk-body");
    assert.equal(await lab.locator("#dock-pc.is-open").count(), 1, "the workstation surface is open");
    assert.equal(await lab.locator("#dock-pc.is-active").count(), 1, "and it owns the screen");

    // STEP AWAY keeps its old meaning: the desktop closes, the room returns
    await lab.click("#dock-away");
    assert.equal(await lab.locator("#desktop-overlay.hidden").count(), 1, "STEP AWAY leaves the desktop");
    assert.equal(await lab.locator("#dock-pc.is-open, #dock-pc.is-active").count(), 0, "the workstation closes");
    assert.equal(await dockShown(lab), true, "the dock stays with the room");

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
