// ============================================================
// ECHO//LINK — simulation tests (node --test, zero dependencies)
// Guards the deterministic rules in net.js so any refactor or a
// different coding model can be verified objectively.
//   run:  node --test        (from the app/ folder)
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";

import { S, resetState, setupCabling, switchPortVlan } from "../js/state.js";
import * as net from "../js/net.js";
import { CHAPTER1, CHAPTER1_LAB, SCENARIOS, setScenario, activeScenario } from "../js/scenario.js";

// Fresh state + a chosen scenario. The scenario is selected first because a
// fresh state seeds its roster and physical layer from the active scenario.
// The backbone (switch/router) is left off; tests power it when needed.
function boot(mode = "story") {
  setScenario(mode === "lab" ? CHAPTER1_LAB.id : CHAPTER1.id);
  resetState();
  S.started = true;
  S.mechanicsMode = mode === "lab";
  setupCabling();
  return S;
}
const powerBackbone = () => { S.devices["CSW-01"].power = true; S.devices["RTR-01"].power = true; };
const text = lines => lines.map(l => l.text).join("\n");

// ---------- scenario seam ----------
test("scenario seam exposes the active policy", () => {
  boot("story");
  assert.equal(activeScenario.player, "PC-C");
  assert.equal(activeScenario.switch, "CSW-01");
  assert.equal(activeScenario.router, "RTR-01");
  assert.equal(switchPortVlan("p09"), 20);
  assert.equal(switchPortVlan("p10"), 20);
  assert.equal(switchPortVlan("p01"), 10);
  assert.equal(SCENARIOS[CHAPTER1.id], CHAPTER1);
  assert.equal(SCENARIOS[CHAPTER1_LAB.id], CHAPTER1_LAB);
  assert.throws(() => setScenario("does-not-exist"));
});

test("scenario owns the roster and the cabling graph", () => {
  boot("story");
  assert.equal(S.scenarioId, CHAPTER1.id);
  assert.deepEqual(Object.keys(S.devices), Object.keys(CHAPTER1.devices()));
  // Factories hand out independent copies: mutating live state cannot
  // leak back into the authored scenario.
  S.devices["PC-A"].power = false;
  S.cabling.cables["C-PCA"].a = null;
  assert.equal(CHAPTER1.devices()["PC-A"].power, true);
  assert.equal(CHAPTER1.cabling().cables["C-PCA"].a, "PC-A:nic");
});

test("lab scenario derives from story and swaps the hidden runs", () => {
  boot("story");
  assert.equal(S.cabling.runs["OF-04"], "PP-04");
  assert.equal(S.cabling.cables["C-PCD"].a, null);

  boot("lab");
  assert.equal(S.scenarioId, CHAPTER1_LAB.id);
  assert.equal(S.cabling.runs["OF-04"], "PP-07");
  assert.equal(S.cabling.runs["OF-07"], "PP-04");
  assert.equal(S.cabling.cables["C-PCD"].a, "PC-D:nic");
  assert.deepEqual(Object.keys(S.devices), Object.keys(CHAPTER1.devices()));
});

// ---------- physical path tracing ----------
test("tracePC finds a complete path when every segment is present", () => {
  boot("story");
  const t = net.tracePC("PC-A");
  assert.equal(t.ok, true);
  assert.equal(t.failAt, null);
  assert.equal(t.outlet, "OF-01");
  assert.equal(t.panelJack, "PP-01");
  assert.equal(t.switchPort, "p01");
  assert.equal(t.vlan, 10);
});

test("tracePC reports the exact broken segment", () => {
  boot("story");
  S.cabling.cables["C-PCA"].intact = false;
  assert.equal(net.tracePC("PC-A").failAt, "cable");

  boot("story");
  S.cabling.cables["C-PCA"].b = null;              // wall end not in an outlet
  assert.equal(net.tracePC("PC-A").failAt, "outlet");

  boot("story");
  delete S.cabling.runs["OF-01"];                  // no hidden run
  assert.equal(net.tracePC("PC-A").failAt, "run");

  boot("story");
  S.cabling.cables["C-PATCH-1"].b = "RTR-01:lan2"; // lead does not reach the switch
  assert.equal(net.tracePC("PC-A").failAt, "switch");
});

test("lab swapped-run fault: light tells the truth, path still breaks", () => {
  boot("lab");
  // OF-04's real run lands on PP-07, but the panel insists PP-07 is OF-07.
  assert.equal(S.cabling.panel["PP-07"].printed, "OF-07");
  assert.deepEqual(net.runContinuity("PP-07"), { outlet: "OF-04", pc: "PC-D" });
  // The light is on, but PP-07 has no patch lead, so the link is still broken.
  assert.equal(net.tracePC("PC-D").failAt, "panel");
  assert.equal(net.effectiveVlan("PC-D"), null);
});

test("runContinuity needs the desk cable seated at both ends", () => {
  boot("story");
  assert.deepEqual(net.runContinuity("PP-01"), { outlet: "OF-01", pc: "PC-A" });
  S.cabling.cables["C-PCA"].b = null;              // unseated at the wall
  assert.equal(net.runContinuity("PP-01"), null);
  assert.equal(net.runContinuity("PP-05"), null);  // no outlet maps to PP-05
});

test("traceSRV follows a direct patch lead to the server VLAN", () => {
  boot("story");
  const t = net.traceSRV("SRV-01");
  assert.equal(t.ok, true);
  assert.equal(t.switchPort, "p09");
  assert.equal(t.vlan, 20);
});

// ---------- link / online / reachability ----------
test("linkUp = power + NIC + complete path", () => {
  boot("story");
  assert.equal(net.linkUp("PC-A"), true);
  S.devices["PC-A"].power = false;
  assert.equal(net.linkUp("PC-A"), false);

  boot("story");
  assert.equal(net.linkUp("PC-B"), false);         // NIC disabled in the fiction
  assert.equal(net.linkUp("PC-D"), false);         // cable loose at the PC
});

test("effectiveVlan reflects where the cable actually lands", () => {
  boot("story");
  assert.equal(net.effectiveVlan("PC-A"), 10);
  assert.equal(net.effectiveVlan("SRV-01"), 20);
  S.cabling.cables["C-PCA"].b = null;
  assert.equal(net.effectiveVlan("PC-A"), null);
});

test("resolvesName: DNS only knows DHCP clients the router registered", () => {
  boot("story");
  powerBackbone();
  assert.equal(net.resolvesName("PC-B"), "192.168.1.11"); // DHCP + registered
  assert.equal(net.resolvesName("PC-A"), null);           // static IP, never registered
  assert.equal(net.resolvesName("NOPE"), null);           // no such host
  S.devices["RTR-01"].power = false;
  assert.equal(net.resolvesName("PC-B"), null);           // no DNS service
});

test("reachable: same segment only, and the player must be online", () => {
  boot("story");
  powerBackbone();
  assert.equal(net.reachableFromPCC("PC-A"), true);
  assert.equal(net.reachableFromPCC("SRV-01"), false);    // VLAN 20, no inter-VLAN routing
  assert.equal(net.reachableFromPCC("PC-B"), false);      // NIC down
  S.devices["RTR-01"].power = false;                      // no powered gear, nothing moves
  assert.equal(net.reachableFromPCC("PC-A"), false);
});

// ---------- ping (the only proof) ----------
test("ping: name resolution failure vs. reachable by number (PC-A lesson)", () => {
  boot("story");
  powerBackbone();
  const byName = text(net.ping("PC-A"));
  assert.match(byName, /could not find host PC-A/);

  const byIp = net.ping("192.168.1.10");
  assert.ok(byIp.some(l => l.cls === "t-green" && l.text.startsWith("Reply from 192.168.1.10")));
  assert.ok(text(byIp).includes("Received = 4"));
});

test("ping: a connected-but-silent device times out honestly", () => {
  boot("story");
  powerBackbone();
  const out = text(net.ping("PC-B"));   // name resolves, NIC disabled
  assert.match(out, /Destination host unreachable/);
});

test("ping: other-segment server has no route (times out)", () => {
  boot("story");
  powerBackbone();
  // Servers are not DNS-registered, so reach it by IP; it is still VLAN 20.
  const out = text(net.ping("10.20.0.11"));
  assert.match(out, /Request timed out/);
});

test("ping: lab PC-D (seated cable, broken run) times out", () => {
  boot("lab");
  powerBackbone();
  const out = text(net.ping("PC-D"));
  assert.match(out, /Request timed out/);
  assert.match(out, /100% loss/);
});

test("ping: general failure when the player's own link is down", () => {
  boot("story");
  powerBackbone();
  S.devices["PC-C"].nic = false;
  const out = text(net.ping("PC-A"));
  assert.match(out, /General failure/);
});

test("ping: destination unreachable when the router is off", () => {
  boot("story");
  S.devices["CSW-01"].power = true;
  S.devices["RTR-01"].power = false;
  const out = text(net.ping("PC-A"));
  assert.match(out, /Destination host unreachable/);
});

// ---------- netspace view (observation, not proof) ----------
test("netspaceView classifies devices by what the network can observe", () => {
  boot("story");
  powerBackbone();
  S.devices["SRV-01"].power = true;
  const view = Object.fromEntries(net.netspaceView().map(d => [d.name, d]));
  assert.equal(view["PC-A"].state, "online");
  assert.equal(view["PC-B"].state, "nicdown");
  assert.equal(view["PC-D"].state, "nolink");
  assert.equal(view["SRV-01"].state, "silent");     // on VLAN 20: known, not observed
  assert.equal(view["PC-A"].provenance, "network-observed");
  assert.equal(view["SRV-01"].provenance, "inventory-known");
});

test("powered-down device reports off, not a fault", () => {
  boot("story");
  powerBackbone();
  S.devices["PC-A"].power = false;
  const pcA = net.netspaceView().find(d => d.name === "PC-A");
  assert.equal(pcA.state, "off");
});

// ---------- terminal helpers ----------
test("ipconfig reports the active player's addressing", () => {
  boot("story");
  powerBackbone();
  const out = text(net.ipconfig());
  assert.match(out, /192\.168\.1\.12/);      // PC-C
  assert.match(out, /255\.255\.255\.0/);
  assert.match(out, /192\.168\.1\.1/);       // gateway
  assert.match(out, /aster\.local/);
  assert.match(out, /DHCP Enabled\. .*: Yes/);
});

test("ipconfig reports the requested host's addressing", () => {
  boot("story");
  powerBackbone();
  const out = text(net.ipconfig("PC-A"));
  assert.match(out, /192\.168\.1\.10/);      // PC-A, not the player
  assert.match(out, /DHCP Enabled\. .*: No/); // static address
});

test("ping is bound to its source host, not the player", () => {
  boot("story");
  powerBackbone();
  S.devices["PC-B"].nic = true;                 // the repaired workstation
  S.cabling.cables["C-PCA"].a = null;           // PC-A's desk end is loose
  assert.match(text(net.ping("PC-B", "PC-A")), /General failure/);
  S.cabling.cables["C-PCA"].a = "PC-A:nic";     // reseated
  const out = text(net.ping("PC-B", "PC-A"));
  assert.match(out, /Reply from 192\.168\.1\.11/);
  assert.match(out, /Received = 4/);
});

test("help lists every device in the roster", () => {
  boot("story");
  const out = text(net.helpText());
  for (const name of Object.keys(S.devices)) assert.ok(out.includes(name), `missing ${name}`);
});