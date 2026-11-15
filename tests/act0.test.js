// ============================================================
// ECHO//LINK — Act 0 foundation probes (node only).
// Drives the pure session state machine and the boot seed directly.
//   run:  node --test tests/act0.test.js
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";
import { S, resetState } from "../js/state.js";
import {
  ACT0, bootAct0, clockNow,
  openSession, closeSession, seatConsoleLink, pinLog, removePin,
} from "../js/act0.js";

function boot() {
  resetState();
  S.started = true;
  S.act0 = true;
  S.clockStart = ACT0.clockStart;
  S.devices = structuredClone(ACT0.devices);
  bootAct0();
  return S;
}

test("(a) bootAct0 seeds 12 calm logs in order and 21 nodes", () => {
  boot();
  assert.equal(S.logs.length, 12);
  assert.deepEqual(S.logs.map(l => l.ts), ACT0.calmLogs.map(l => l.ts));
  assert.equal(S.logs[0].message, "battery self-test ok");
  assert.equal(S.logs[11].message, "log rotation complete");
  assert.equal(S.nodes.length, 21);
  const hidden = S.nodes.filter(n => n.visibleAtBoot === false);
  assert.equal(hidden.length, 10);
  assert.ok(hidden.every(n => n.layer === "L0"), "every hidden row is L0");
  assert.equal(S.nodes.filter(n => n.visibleAtBoot).length, 11);
});

test("(b) bootAct0 twice neither duplicates nor overwrites the seed", () => {
  boot();
  bootAct0();
  assert.equal(S.logs.length, 12);
  assert.equal(S.nodes.length, 21);
  S.logs.push({ ts:"02:14:00.000", device:"L1-WS-NOC01", message:"probe marker" });
  bootAct0();
  assert.equal(S.logs.length, 13, "a seeded log list is never re-seeded over");
});

test("(c) clockNow starts 02:13:52 and advances one narrative minute per real minute", () => {
  boot();
  S.stats.startTime = Date.now();
  assert.equal(clockNow(), "02:13:52");
  S.stats.startTime = Date.now() - 60000;
  assert.equal(clockNow(), "02:14:52");
  S.stats.startTime = Date.now() - 120000;
  assert.equal(clockNow(), "02:15:52");
});

test("(d) openSession without a console link reports no path and leaves sessions untouched", () => {
  boot();
  const r = openSession("sw-l0");
  assert.deepEqual(r.lines, ["no console path to sw-l0"]);
  assert.equal(r.state, "disconnected");
  assert.deepEqual(S.sessions, {});
});

test("(e) seatConsoleLink adds one link and exactly one log line", () => {
  boot();
  seatConsoleLink();
  assert.equal(S.consoleLinks["sw-l0"].from, "L1-CON-SRV01");
  assert.equal(S.consoleLinks["sw-l0"].to, "SW-L0");
  assert.ok(S.consoleLinks["sw-l0"].seatedAt > 0);
  assert.equal(S.logs.length, 13);
  assert.equal(S.logs[12].device, "L1-CON-SRV01");
  assert.equal(S.logs[12].message, "console lead seated to SW-L0");
  seatConsoleLink();
  assert.equal(S.logs.length, 13, "a second seat appends nothing");
});

test("(f) openSession after seating connects once and keeps openedAt", async () => {
  boot();
  seatConsoleLink();
  const r = openSession("sw-l0");
  assert.deepEqual(r.lines, ["opening console to sw-l0...", "connected to SW-L0"]);
  assert.equal(r.state, "connected");
  assert.equal(S.sessions["sw-l0"].state, "connected");
  const opened = S.sessions["sw-l0"].openedAt;
  assert.ok(opened > 0);
  assert.equal(S.logs.length, 13, "openSession writes no log line");
  await new Promise(done => setTimeout(done, 5));
  openSession("sw-l0");
  assert.equal(S.sessions["sw-l0"].openedAt, opened, "a repeat keeps openedAt");
  assert.equal(S.logs.length, 13);
});

test("(g) closeSession reports the close once, then no open session", () => {
  boot();
  seatConsoleLink();
  openSession("sw-l0");
  const r1 = closeSession("sw-l0");
  assert.deepEqual(r1.lines, ["closed console to SW-L0"]);
  assert.equal(r1.state, "disconnected");
  assert.equal(S.sessions["sw-l0"].state, "disconnected");
  assert.equal(S.sessions["sw-l0"].openedAt, null);
  assert.deepEqual(closeSession("sw-l0").lines, ["no open console session to sw-l0"]);
});

test("(h) pinLog copies a line without removing it", () => {
  boot();
  pinLog(3);
  assert.equal(S.pins.length, 1);
  assert.deepEqual(S.pins[0], S.logs[3]);
  assert.notEqual(S.pins[0], S.logs[3], "the pin is a copy");
  assert.equal(S.logs.length, 12, "pinning never removes the source line");
  removePin(0);
  assert.equal(S.pins.length, 0);
});

test("(i) the SOP ships one console-access page", () => {
  boot();
  assert.equal(S.sop.length, 1);
  assert.equal(S.sop[0].id, "console-access");
  assert.ok(S.sop[0].body.includes("Console sessions do not use the network"));
});
