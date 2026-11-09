// ============================================================
// ECHO//LINK — the PC-D repair: the light beats the printed label.
// Baseline trusts the ink and fails; only the real patch answers.
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
const verified = page => page.evaluate(() => import("/js/state.js").then(m => m.S.pcdVerified));

test("PC-D repair — the light beats the printed label", async () => {
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

    // 3. boot the lab
    await page.goto(url);
    await page.click("#btn-lab");
    await page.waitForSelector("#game-screen:not(.hidden)");
    assert.ok((await page.locator("#objective-text").textContent()).startsWith("MECHANICS LAB"), "step 3: objective must start with MECHANICS LAB");

    // 4. baseline — trusting the printed label must fail
    await page.click('[data-hs="door:office"]');
    await page.waitForSelector('[data-hs="device:PC-C"]');
    await page.click('[data-hs="device:PC-C"]');
    await page.click("#dv-use");
    await page.waitForSelector("#dock-terminal");
    await page.click("#dock-terminal");
    await page.waitForSelector(".term-input");
    await page.fill(".term-input", "ping PC-D");
    await page.press(".term-input", "Enter");
    await page.waitForSelector('.term-out:has-text("Ping statistics for")');
    const baselineOut = await txt(page.locator(".term-out"));
    const baselineGreen = await page.locator(".term-out .t-green").allTextContents();
    assert.ok(!baselineGreen.some(l => l.includes("Reply from 192.168.1.13")), "step 4: the label-trusting path must not answer");
    assert.match(baselineOut, /Request timed out\.|Destination host unreachable/, "step 4: baseline ping must fail");
    assert.equal(await verified(page), false, "step 4: PC-D must still be unverified");

    // 5. the true repair — the light names OF-04, the ink names OF-07
    await page.click("#dt-leave");
    await page.waitForSelector("#desktop-overlay.hidden", { state: "attached" });
    assert.equal(await page.locator("#device-overlay").isHidden(), true, "step 5: the PC inspector is already closed by USE");
    assert.match(await txt(page.locator("#location-bar")), /STAFF OFFICES/, "step 5: stepping away returns to the office scene");
    await page.click('[data-hs="door:hallway"]');
    await page.waitForSelector('[data-hs="door:server"]');
    await page.click('[data-hs="door:server"]');
    await page.waitForSelector('[data-hs="device:panel"]');
    await page.click('[data-hs="device:panel"]');
    await page.waitForSelector('[data-jack="PP-07"]');
    await page.locator('[data-jack="PP-07"]').first().click();
    const pre = await txt(page.locator(".iface-detail"));
    assert.match(pre, /LIGHT ON/, "step 5 pre-patch: PP-07 light is on");
    assert.match(pre, /OF-04/, "step 5 pre-patch: the light names OF-04");
    assert.match(pre, /PC-D/, "step 5 pre-patch: the light names PC-D");
    assert.match(pre, /PATCH LEAD\s*none/, "step 5 pre-patch: PP-07 has no patch lead");
    assert.match(await txt(page.locator(".pp-warn")), /LABEL DISAGREES/, "step 5 pre-patch: amber label warning is shown");
    await page.locator('[data-jack="PP-04"]').first().click();
    const lie = await txt(page.locator(".iface-detail"));
    assert.match(lie, /DARK/, "step 5 pre-patch: PP-04 is dark");
    assert.match(lie, /PRINTED\s*OF-04/, "step 5 pre-patch: PP-04 is printed OF-04");
    assert.equal(await page.locator(".iface-detail .pp-warn").count(), 0, "step 5 pre-patch: PP-04 shows no amber warning");

    await page.click('[data-plug="C-SPARE-1|a"]');
    await page.waitForSelector("#hand-chip");
    await page.click('[data-port="PP-07:jack"]');
    await page.waitForSelector("#hand-chip");
    assert.match(await txt(page.locator("#hand-chip")), /END B/, "step 5: the spare's other end is now in hand");
    await page.click("#dv-close");
    await page.click('[data-hs="device:CSW-01"]');
    await page.waitForSelector('[data-iface="SW-05"]');
    await page.click('[data-iface="SW-05"]');
    await page.waitForSelector("#if-place");
    await page.click("#if-place");
    await page.waitForSelector("#hand-chip", { state: "detached", timeout: 5000 });

    // 6. panel truth — patched and still honest
    await page.click("#dv-close");
    await page.click('[data-hs="device:panel"]');
    await page.waitForSelector('[data-jack="PP-07"]');
    await page.locator('[data-jack="PP-07"]').first().click();
    const fixed = await txt(page.locator(".iface-detail"));
    assert.match(fixed, /LIGHT ON/, "step 6: PP-07 is lit");
    assert.match(fixed, /OF-04/, "step 6: the light names OF-04");
    assert.match(fixed, /PC-D/, "step 6: the light names PC-D");
    assert.match(fixed, /PATCH LEAD\s*CSW-01\s*·\s*P05/i, "step 6: PP-07's lead reaches CSW-01 p05");
    assert.match(await txt(page.locator(".pp-hint")), /Patched\. The printed label is wrong/, "step 6: patched disagreement note is shown");
    await page.locator('[data-jack="PP-04"]').first().click();
    const lieAgain = await txt(page.locator(".iface-detail"));
    assert.match(lieAgain, /DARK/, "step 6: PP-04 stays dark");
    assert.match(lieAgain, /PRINTED\s*OF-04/, "step 6: PP-04 stays printed OF-04");

    // 7. verify — the repaired path answers
    await page.click("#dv-close");
    await page.click('[data-hs="door:hallway"]');
    await page.waitForSelector('[data-hs="door:office"]');
    await page.click('[data-hs="door:office"]');
    await page.waitForSelector('[data-hs="device:PC-C"]');
    await page.click('[data-hs="device:PC-C"]');
    await page.click("#dv-use");
    await page.waitForSelector("#dock-terminal");
    await page.click("#dock-terminal");
    await page.waitForSelector(".term-input");
    await page.fill(".term-input", "ping PC-D");
    await page.press(".term-input", "Enter");
    try {
      await page.locator(".term-out .t-green", { hasText: "Reply from 192.168.1.13" }).first().waitFor({ timeout: 15000 });
    } catch {
      assert.fail("step 7: expected a green 'Reply from 192.168.1.13' line within 15s — the patch did not carry PC-D");
    }
    await page.waitForFunction(() => (document.getElementById("toast")?.textContent || "").includes("PC-D verified"), null, { timeout: 5000 });
    assert.equal(await verified(page), true, "step 7: S.pcdVerified must be true");

    assert.deepEqual(problems, [], "page errors:\n" + problems.join("\n"));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
