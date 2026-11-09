// ============================================================
// ECHO//LINK — device CLI tests (node --test, zero dependencies)
// The console must derive everything from live state and stay
// inside what the device can observe.
//   run:  node --test        (from the app/ folder)
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";

import { S, resetState, setupCabling } from "../js/state.js";
import { setScenario, CHAPTER1 } from "../js/scenario.js";
import { cliCommand } from "../js/cli.js";

function boot() {
  setScenario(CHAPTER1.id);
  resetState();
  S.started = true;
  setupCabling();
}
const powerBackbone = () => { S.devices["CSW-01"].power = true; S.devices["RTR-01"].power = true; };
const text = res => res.lines.map(l => l.text).join("\n");

test("switch: a port follows its PC's cable live", () => {
  boot();
  powerBackbone();
  assert.match(text(cliCommand("CSW-01", "show interfaces status")), /^P04\s+notconnect/m);
  S.cabling.cables["C-PCD"].a = "PC-D:nic";     // the repair
  assert.match(text(cliCommand("CSW-01", "show interfaces status")), /^P04\s+connected/m);
});

test("router: brief reflects the live LAN1 / WAN state", () => {
  boot();
  powerBackbone();
  let out = text(cliCommand("RTR-01", "show ip interface brief"));
  assert.match(out, /^LAN1\s+192\.168\.1\.1\s+YES\s+manual\s+up\s+up$/m);
  assert.match(out, /^WAN\s+unassigned\s+NO\s+unset\s+down\s+down$/m);

  S.devices["CSW-01"].power = false;            // the uplink loses carrier
  out = text(cliCommand("RTR-01", "show ip interface brief"));
  assert.match(out, /^LAN1\s+192\.168\.1\.1\s+YES\s+manual\s+down\s+down$/m);
});

test("console output never exposes the hidden runs or the printed labels", () => {
  boot();
  powerBackbone();
  for (const [host, cmd] of [
    ["CSW-01", "show interfaces status"],
    ["RTR-01", "show ip interface brief"],
  ]) {
    const out = text(cliCommand(host, cmd));
    assert.doesNotMatch(out, /PP-\d|OF-\d|PC-[A-D]/);
    assert.doesNotMatch(out, /label|printed|light:|\bwall\b/i);
  }
});

test("a powered-off device cannot report its interfaces", () => {
  boot();                                        // backbone still dark
  assert.match(text(cliCommand("CSW-01", "show interfaces status")), /No response/);
  assert.match(text(cliCommand("RTR-01", "show ip interface brief")), /No response/);
});

test("help, exit, clear and invalid input", () => {
  boot();
  powerBackbone();
  assert.match(text(cliCommand("CSW-01", "help")), /show interfaces status/);
  assert.match(text(cliCommand("RTR-01", "help")), /show ip interface brief/);
  assert.equal(cliCommand("CSW-01", "exit").exit, true);
  assert.equal(cliCommand("CSW-01", "clear").clear, true);
  assert.match(text(cliCommand("CSW-01", "configure terminal")), /Invalid input/);
  // a command that belongs to the other device is refused
  assert.match(text(cliCommand("RTR-01", "show interfaces status")), /Invalid input/);
});
