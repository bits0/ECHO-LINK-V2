// ============================================================
// ECHO//LINK — Act 0 foundation probes (node only).
// Drives the pure session state machine and the boot seed directly.
//   run:  node --test tests/act0.test.js
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";
import { S, resetState } from "../js/state.js";
import {
  ACT0, CASCADE_LOG, bootAct0, clockNow, cascade, cascadeStream, visibleNodes, nodeState,
  openSession, closeSession, seatConsoleLink, pinLog, removePin,
  beginChat, revealDue, choose, maybeSequence2, notifySopOpened,
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

test("(j) cascade appends 24 lines in slot order", () => {
  boot();
  const r = cascade();
  assert.equal(r.appended, 24);
  assert.equal(S.logs.length, 36);
  assert.equal(S.logs[12].ts, "02:13:59.402");
  assert.equal(S.logs[35].message, "clock resync from ntp: +0.000s");
});

test("(k) the anomaly keeps its slot, not its time", () => {
  boot();
  cascade();
  const i = S.logs.findIndex(l => l.ts === "02:13:58.771");
  assert.equal(i, 23);
  assert.ok(S.logs[22].ts > S.logs[23].ts, "the entry before it has a later timestamp");
  assert.ok(S.logs[24].ts > S.logs[23].ts, "the entry after it has a later timestamp");
});

test("(l) cascade is idempotent", () => {
  boot();
  cascade();
  assert.deepEqual(cascade(), { appended: 0 });
  assert.equal(S.logs.length, 36);
});

test("(m) cascade reds seven nodes and leaves L0 hidden", () => {
  boot();
  cascade();
  const vis = visibleNodes();
  assert.equal(vis.length, 11);
  assert.equal(vis.filter(n => nodeState(n) === "red").length, 7);
  assert.equal(vis.filter(n => nodeState(n) === "green").length, 4);
  assert.equal(vis.some(n => n.layer === "L0"), false);
  assert.equal(S.nodes.filter(n => n.layer === "L0" && n.visibleAtBoot === false).length, 10);
});

test("(n) stability is awarded once, on the first connect", () => {
  boot();
  seatConsoleLink();
  const first = openSession("sw-l0");
  assert.equal(first.awarded, true);
  assert.equal(S.stability.perScenario.act0, 2);
  assert.equal(S.stability.total, 2);
  const second = openSession("sw-l0");
  assert.equal(second.awarded, false);
  assert.equal(S.stability.total, 2);
});

test("(o) L0 appears only with a connected session; one green", () => {
  boot();
  assert.equal(visibleNodes().filter(n => n.layer === "L0").length, 0);
  seatConsoleLink();
  openSession("sw-l0");
  const l0 = visibleNodes().filter(n => n.layer === "L0");
  assert.equal(l0.length, 10);
  assert.equal(l0.filter(n => nodeState(n) === "green").length, 1);
  assert.equal(nodeState(l0.find(n => n.id === "L0-SW-ACC01")), "green");
  closeSession("sw-l0");
  assert.equal(visibleNodes().filter(n => n.layer === "L0").length, 0);
});

test("(p) an unrelated log does not cancel the cascade", () => {
  boot();
  seatConsoleLink();                    // logs === 13 before the cascade
  const r = cascade();
  assert.equal(r.appended, 24);
  assert.equal(S.logs.length, 37);
  assert.equal(S.cascadeDone, true);
  assert.equal(cascade().appended, 0);  // still idempotent
});

test("(q) the Act 0 chat script is complete and in order", () => {
  const ids = ACT0.chat.map(b => b.id);
  assert.deepEqual(ids, [
    "s1-01", "s1-02", "s1-03a", "s1-03b", "s1-04", "s1-05", "s1-06a", "s1-06b",
    "s1-07", "s1-08", "s1-09", "s1-10", "s1-11", "s1-12",
    "s2-01", "s2-02", "s2-03", "s2-04", "s2-05", "s2-06", "s2-07", "s2-08",
    "s2-09", "s2-10", "s2-11", "s2-12", "s2-13", "s2-14", "s2-15",
  ]);
  // 03a/03b and 06a/06b are the two takes of beats 03 and 06
  const numbered1 = new Set(ACT0.chat.filter(b => b.id.startsWith("s1-")).map(b => b.id.replace(/[a-z]$/, "")));
  assert.equal(numbered1.size, 12);
  assert.equal(ACT0.chat.filter(b => b.id.startsWith("s2-")).length, 15);
  const pause = ACT0.chat.find(b => b.id === "s1-11");
  assert.equal(pause.delay, 52000);
  assert.equal(pause.away, true);
});

test("(r) only the s1-02 tap returns the cascade trigger", () => {
  boot();
  Object.assign(S.chat, { current: "s1-02", waiting: true });
  const r = choose(0);
  assert.deepEqual(r, { cascadeIn: 8000 });
  const last = S.chat.shown[S.chat.shown.length - 1];
  assert.equal(last.speaker, "player");
  assert.equal(last.text, "Everything's red. Syslog is going crazy.");
  assert.equal(S.chat.current, "s1-03a");
  Object.assign(S.chat, { current: "s1-05", waiting: true });
  const r2 = choose(0);
  assert.ok(!r2 || r2.cascadeIn == null);
});

test("(s) sequence 2 needs both the SOP and a live console session", () => {
  boot();
  seatConsoleLink();
  openSession("sw-l0");
  assert.equal(maybeSequence2(), false);
  assert.equal(S.chat.seq, 1);
  S.chat.current = "s1-12";            // the pause has landed
  notifySopOpened();
  assert.equal(S.chat.seq, 2);
  assert.equal(S.chat.current, "s2-01");
  boot();                              // the session was never opened
  notifySopOpened();
  assert.equal(S.chat.seq, 1);
  assert.equal(S.chat.current, "s1-01");
});

test("(t) the pause goes typing → away and schedules nothing else", () => {
  boot();
  Object.assign(S.chat, { current: "s1-10", waiting: false, typing: true, away: false, pendingAt: 1_000_000 });
  assert.equal(revealDue(1_000_000), "s1-10");
  assert.equal(S.chat.current, "s1-11");
  assert.equal(S.chat.typing, true);          // Rue is typing the 52s message
  const due = S.chat.pendingAt, delay = 52000;
  assert.equal(revealDue(due - (delay - 4999)), null);
  assert.equal(S.chat.away, false);
  assert.equal(S.chat.typing, true);
  assert.equal(revealDue(due - (delay - 5000)), null);
  assert.equal(S.chat.away, true);
  assert.equal(S.chat.typing, false);
  assert.equal(revealDue(due), "s1-11");
  assert.equal(S.chat.current, "s1-12");      // the away marker takes over
  assert.equal(S.chat.pendingAt, Infinity);
  assert.equal(revealDue(due + 90000), null); // nothing else in sequence 1
});

test("(u) bootAct0 seeds the chat at s1-01", () => {
  boot();
  assert.equal(S.chat.seq, 1);
  assert.equal(S.chat.current, "s1-01");
  assert.deepEqual(S.chat.shown, []);
  assert.equal(S.chat.waiting, false);
});

test("(v) sequence 2 waits for the pause to land", () => {
  boot();
  seatConsoleLink();
  openSession("sw-l0");
  Object.assign(S.chat, { current: "s1-05", waiting: true });
  notifySopOpened();                  // SOP seen, but the pause is still ahead
  assert.equal(S.chat.seq, 1);
  assert.equal(S.chat.seq2Pending, true);
  assert.equal(S.chat.current, "s1-05");
  assert.equal(maybeSequence2(), false);
  Object.assign(S.chat, { waiting: false, current: "s1-10", typing: true, pendingAt: 1_000_000 });
  assert.equal(revealDue(1_000_000), "s1-10");
  assert.equal(S.chat.current, "s1-11");
  assert.equal(revealDue(S.chat.pendingAt), "s1-11");
  assert.equal(S.chat.seq, 2);
  assert.equal(S.chat.current, "s2-01");
  assert.equal(S.chat.seq2Pending, false);
});

const delay = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (fn()) return true; await delay(15); }
  return false;
};

test("(w) cascadeStream lands mid-way through the block", async () => {
  boot();
  assert.equal(cascadeStream({ minDelay: 40, maxDelay: 40 }).started, true);
  await delay(120);
  assert.ok(S.logs.length >= 13 && S.logs.length <= 35, `mid-stream length ${S.logs.length}`);
  assert.equal(S.cascadeDone, false);
  assert.equal(S.cascadeStreaming, true);
  // the devices fail as their lines land, not all at the end
  const at = id => S.nodes.find(n => n.id === id).state;
  assert.equal(at("L1-SW-DIST01"), "red", "the first failing line reds its device");
  assert.equal(at("L3-SAN-01"), "green", "a later device is still healthy");
  await waitFor(() => S.cascadeDone, 3000);
});

test("(x) the stream finishes the whole block and stops", async () => {
  boot();
  cascadeStream({ minDelay: 40, maxDelay: 40 });
  await delay(1300);
  assert.equal(S.logs.length, 36);
  assert.equal(S.cascadeDone, true);
  assert.equal(S.cascadeStreaming, false);
  assert.equal(S.logs[35].message, "clock resync from ntp: +0.000s");
  assert.equal(S.nodes.filter(n => n.after === "red").every(n => n.state === "red"), true);
});

test("(y) a second cascadeStream during the first is a no-op", async () => {
  boot();
  assert.equal(cascadeStream({ minDelay: 40, maxDelay: 40 }).started, true);
  assert.equal(cascadeStream({ minDelay: 40, maxDelay: 40 }).started, false, "the second call refuses");
  await delay(300);
  const mid = S.logs.length;
  assert.ok(mid < 12 + 12, `one stream, not two (length ${mid})`);
  await waitFor(() => S.cascadeDone, 3000);
  assert.equal(S.logs.length, 36, "the block landed exactly once");
});

test("(z) streamed entries are the cascade log in order, plus arrivedAt", async () => {
  boot();
  cascadeStream({ minDelay: 1, maxDelay: 1 });
  assert.equal(await waitFor(() => S.cascadeDone, 3000), true);
  const streamed = S.logs.slice(12);
  assert.equal(streamed.length, CASCADE_LOG.length);
  streamed.forEach((entry, i) => {
    assert.equal(typeof entry.arrivedAt, "number");
    const { arrivedAt, ...rest } = entry;
    assert.deepEqual(rest, CASCADE_LOG[i], `slot ${i + 12} is unchanged`);
  });
});

