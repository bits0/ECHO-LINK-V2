// ============================================================
// ECHO//LINK — CABLING floor-plan routing tests
// Pins the shared-trunk run geometry: one corridor trunk, each run
// leaving at its own fan-out height, and every run ending at the
// TRUE jack from S.cabling.runs (never the printed label).
//   run:  node --test        (from the app/ folder)
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";
import { S, resetState, setupCabling } from "../js/state.js";
import { setScenario, CHAPTER1, CHAPTER1_LAB } from "../js/scenario.js";

// netspace.js imports modules that touch the DOM at load time; this
// stub is all it needs to be importable outside a browser.
globalThis.document = { addEventListener() {}, getElementById() { return null; } };
const { planRunPath } = await import("../js/netspace.js");

function boot(mode = "story") {
  setScenario(mode === "lab" ? CHAPTER1_LAB.id : CHAPTER1.id);
  resetState();
  S.started = true;
  S.mechanicsMode = mode === "lab";
  setupCabling();
  return S;
}
const OUTLETS = ["OF-01", "OF-02", "OF-03", "OF-04", "OF-07"];
// panel jacks sit at P2_JACK_X(i) = 312 + i*15
const jackX = jack => 312 + (parseInt(jack.slice(3), 10) - 1) * 15;

test("every run taps one shared trunk at its own outlet height", () => {
  boot("story");
  const paths = OUTLETS.map(o => ({ o, p: planRunPath(o) }));
  for (const { o, p } of paths) {
    assert.ok(p, `${o} has a route`);
    // wall plate → trunk → fan-out → jack column → drop
    assert.equal(p.length, 5);
    assert.equal(p[1].x, p[2].x, `${o} rides the trunk vertically`);
    assert.ok(p.slice(1).every(pt => pt.x >= p[1].x), `${o} never doubles back past the trunk`);
  }
  const trunkXs = new Set(paths.map(({ p }) => p[1].x));
  assert.equal(trunkXs.size, 1, "exactly one trunk column");
});

test("runs are orthogonal, with the tap at the outlet's own height", () => {
  boot("story");
  for (const o of OUTLETS) {
    const p = planRunPath(o);
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      assert.ok(a.x === b.x || a.y === b.y, `${o} segment ${i} is axis-aligned`);
    }
    // the tap onto the trunk is at the wall-plate stub's own y
    assert.equal(p[0].y, p[1].y, `${o} approaches the trunk horizontally`);
    // the drop lands just above the jack row
    assert.equal(p[p.length - 1].y, 254);
    assert.equal(p[p.length - 2].x, p[p.length - 1].x, `${o} drops straight into its jack`);
  }
});

test("story: each run ends at its printed jack", () => {
  boot("story");
  for (const o of OUTLETS) {
    const p = planRunPath(o);
    assert.equal(p[p.length - 1].x, jackX(S.cabling.runs[o]), `${o} → ${S.cabling.runs[o]}`);
  }
});

test("lab: the trapped outlet ends at its TRUE jack, not the printed one", () => {
  boot("lab");
  // the panel prints OF-04 on PP-04 and OF-07 on PP-07 …
  assert.equal(S.cabling.panel["PP-04"].printed, "OF-04");
  assert.equal(S.cabling.panel["PP-07"].printed, "OF-07");
  // … while the hidden runs say otherwise
  assert.equal(S.cabling.runs["OF-04"], "PP-07");
  assert.equal(S.cabling.runs["OF-07"], "PP-04");

  const of04 = planRunPath("OF-04"), of07 = planRunPath("OF-07");
  assert.equal(of04[of04.length - 1].x, jackX("PP-07"), "OF-04 traces to PP-07");
  assert.equal(of07[of07.length - 1].x, jackX("PP-04"), "OF-07 traces to PP-04");
  assert.notEqual(of04[of04.length - 1].x, jackX("PP-04"));
});

test("fan-out heights are staggered and never collide", () => {
  for (const mode of ["story", "lab"]) {
    boot(mode);
    const ys = OUTLETS.map(o => planRunPath(o)[2].y);
    assert.equal(new Set(ys).size, ys.length, `${mode}: every run has its own fan-out height`);
  }
});

test("no drop crosses another run's fan-out horizontal", () => {
  // leftmost jack exits lowest, so a drop (y → 254 at its own x) can never
  // pass through a horizontal that starts further left of that x.
  for (const mode of ["story", "lab"]) {
    boot(mode);
    const runs = OUTLETS.map(o => {
      const p = planRunPath(o);
      return { outlet: o, x: p[p.length - 1].x, fy: p[2].y };
    });
    for (const a of runs) {
      for (const b of runs) {
        if (a === b) continue;
        const bCrossesA = a.x < b.x && a.fy <= b.fy && b.fy <= 254;
        assert.ok(!bCrossesA, `${mode}: drop of ${a.outlet} would cross ${b.outlet}`);
      }
    }
  }
});

test("an outlet with no hidden run has no route", () => {
  boot("story");
  delete S.cabling.runs["OF-01"];
  assert.equal(planRunPath("OF-01"), null);
});
