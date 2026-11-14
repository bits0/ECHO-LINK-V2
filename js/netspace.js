// ============================================================
// ECHO//LINK — Network Space: full-view blueprint workspace
// VIRTUAL mode is a 2D logical topology map; PHYSICAL mode is a 2D
// floor-plan view of the physical plant. Both pan and zoom.
// The view informs, but only terminal ping verifies.
// ============================================================
import { S, getSettings } from "./state.js";
import { activeScenario, PREVIEW_FLOORS, FACILITY } from "./scenario.js";
import { netspaceView, tracePC, traceSRV, cableAt, runContinuity, switchUp, routerUp } from "./net.js";
import { openTerminal } from "./terminal.js";
import { openDevice, openOutlet, openPatchPanel } from "./device.js";
import { nodeIconImage } from "./icons.js";

let ctx = null;
let active = null;
let nsMode = "virtual";            // "virtual" | "physical" — persists across opens
let physView = "floor";            // "floor" | "building"
let previewFloor = null;           // a preview sheet: shell and racks, nothing wired
let selectedFacilityFloor = null;  // facility floor drawn amber in the building
let facZoom = 1;                   // building zoom: scales the iso projection only
let hoveredFacilityFloor = null;   // the slab under the pointer in the building

const el = id => document.getElementById(id);

// ---------------- virtual mode: 2D blueprint topology ----------------
// Logical hub-and-spoke: the switch is the center of the lesson.
// World units are schematic pixels at zoom 1; cam2 pans and zooms.
const T2 = {
  "RTR-01": { x: 0,    y:-195, type:"router" },
  "CSW-01": { x: 0,    y:   0, type:"switch" },
  "PC-A":   { x:-460,  y: 215, type:"pc" },
  "PC-B":   { x:-155,  y: 255, type:"pc" },
  "PC-C":   { x: 155,  y: 255, type:"pc" },
  "PC-D":   { x: 460,  y: 215, type:"pc" },
  "SRV-01": { x: 470,  y:-130, type:"server" },
  "SRV-02": { x: 470,  y:  30, type:"server" },
};
const T2_ZONE20 = { x: 378, y:-215, w: 196, h: 330 };  // dashed VLAN 20 container
const T2_ISP_TIP = { x: 0, y:-352 };                   // the WAN lead vanishes upward
let cam2 = null;   // virtual map camera {x, y, z} — persists across opens when the setting allows
let camP = null;   // floor-plan camera, same deal
const acam = () => nsMode === "physical" ? camP : cam2;

function fitCam(W, H) {
  return { x: 0, y: -10, z: Math.min(2.5, Math.max(.4, Math.min((W-170)/1150, (H-190)/760))) };
}
function fitCamPlan(W, H) {
  return { x: 20, y: 0, z: Math.min(2.5, Math.max(.35, Math.min((W-150)/1060, (H-200)/660))) };
}
function w2s(p, W, H) {
  const c = acam();
  return { x: (p.x - c.x)*c.z + W/2, y: (p.y - c.y)*c.z + H/2 };
}
function s2w(sx, sy, W, H) {
  const c = acam();
  return { x: c.x + (sx - W/2)/c.z, y: c.y + (sy - H/2)/c.z };
}
function zoomAt(sx, sy, factor, W, H) {
  const c = acam();
  const w = s2w(sx, sy, W, H);
  c.z = Math.min(2.5, Math.max(.35, c.z * factor));
  c.x = w.x - (sx - W/2)/c.z;
  c.y = w.y - (sy - H/2)/c.z;
}
function t2NodeAt(mx, my, W, H) {
  const z = acam().z;
  for (const name of Object.keys(T2)) {
    const p = w2s(T2[name], W, H);
    if ((mx-p.x)**2 + (my-p.y)**2 < (46*z)**2) return name;
  }
  return null;
}

// LINKS — the logical edges drawn in VIRTUAL mode
const LINKS = [
  ["RTR-01","CSW-01"], ["CSW-01","PC-A"], ["CSW-01","PC-B"],
  ["CSW-01","PC-C"], ["CSW-01","PC-D"], ["CSW-01","SRV-01"], ["CSW-01","SRV-02"],
];

function verified(name) {
  return (name==="PC-B" && S.pcbVerified) || (name==="PC-D" && S.pcdVerified) ||
         (name==="PC-A" && S.pcaIpPinged) || name==="PC-C";
}

function drawPolyline(g, points, color, width=1, dash=[]) {
  const valid = points.filter(Boolean);
  if (valid.length < 2) return;
  g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash);
  g.beginPath(); g.moveTo(valid[0].x,valid[0].y);
  for (const p of valid.slice(1)) g.lineTo(p.x,p.y);
  g.stroke(); g.setLineDash([]);
}
// ---- traffic mode 2D rendering ----
const T2_STATE_COL = { online:"#79c98d", nicdown:"#e0a13e", vlanmis:"#e0a13e", nolink:"#7a8392", off:"#3a4250", silent:"#5b6472" };
const T2_STATE_TXT = { online:"ONLINE — responding", nicdown:"NIC DISABLED — silent by configuration", vlanmis:"LINKED TO WRONG SEGMENT — VLAN mismatch", nolink:"NO CARRIER — path broken somewhere physical", off:"POWERED OFF", silent:"SILENT — not observed" };

function t2Grid(g, W, H) {
  g.fillStyle = "#07090c"; g.fillRect(0, 0, W, H);
  const halo = g.createRadialGradient(W*.5, H*.45, 20, W*.5, H*.45, Math.max(W,H)*.7);
  halo.addColorStop(0, "rgba(48,62,78,.30)"); halo.addColorStop(.5, "rgba(19,26,34,.16)"); halo.addColorStop(1, "rgba(5,7,10,0)");
  g.fillStyle = halo; g.fillRect(0, 0, W, H);
  // blueprint sheet: fine grid, brighter majors, dots at intersections — all in world space
  const tl = s2w(0, 0, W, H), br = s2w(W, H, W, H);
  const fine = 40, major = 200;
  g.lineWidth = 1;
  for (let x = Math.floor(tl.x/fine)*fine; x <= Math.ceil(br.x/fine)*fine; x += fine) {
    const isMaj = Math.abs(x % major) < .01;
    const a = w2s({x, y:0}, W, H).x;
    g.strokeStyle = `rgba(93,111,132,${isMaj ? .20 : .07})`;
    g.beginPath(); g.moveTo(a, 0); g.lineTo(a, H); g.stroke();
  }
  for (let y = Math.floor(tl.y/fine)*fine; y <= Math.ceil(br.y/fine)*fine; y += fine) {
    const isMaj = Math.abs(y % major) < .01;
    const b = w2s({x:0, y}, W, H).y;
    g.strokeStyle = `rgba(93,111,132,${isMaj ? .20 : .07})`;
    g.beginPath(); g.moveTo(0, b); g.lineTo(W, b); g.stroke();
  }
  for (let x = Math.floor(tl.x/major)*major; x <= br.x; x += major)
    for (let y = Math.floor(tl.y/major)*major; y <= br.y; y += major) {
      const p = w2s({x, y}, W, H);
      g.fillStyle = "rgba(126,145,165,.34)";
      g.beginPath(); g.arc(p.x, p.y, 1.3, 0, 7); g.fill();
    }
}

function t2Node(g, name, view, W, H, time, hovered) {
  const p = w2s(T2[name], W, H);
  const z = cam2.z, hs = 30*z;
  const col = T2_STATE_COL[view.state] || "#5b6472";
  const dim = view.state === "off";
  // authored SVG card, re-tinted to the theme; the badge carries the state color
  const img = nodeIconImage(T2[name].type, dim ? "#5b6472" : "#b2bcca", col);
  if (img.complete && img.naturalWidth) g.drawImage(img, p.x-hs, p.y-hs, hs*2, hs*2);
  if (view.vlan === 20) {
    g.strokeStyle = "rgba(224,161,62,.5)"; g.lineWidth = 1.1;
    g.beginPath(); g.roundRect(p.x-hs-3*z, p.y-hs-3*z, hs*2+6*z, hs*2+6*z, 10*z); g.stroke();
  }
  if (hovered) {
    g.strokeStyle = "#e8ebef"; g.lineWidth = 1.8;
    g.beginPath(); g.roundRect(p.x-hs-3*z, p.y-hs-3*z, hs*2+6*z, hs*2+6*z, 10*z); g.stroke();
  }
  // verified ring — a ping proved this node
  if (verified(name)) {
    g.strokeStyle = "rgba(121,201,141,.5)"; g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(p.x-hs-8*z, p.y-hs-8*z, hs*2+16*z, hs*2+16*z, 13*z); g.stroke();
  }
  // name + IP — below the card, except the switch: all four of its edges
  // carry traces, so its label floats at the quiet top-left corner
  const side = name === "CSW-01";
  g.textAlign = side ? "right" : "center";
  g.font = `${Math.max(9, 11*z)}px ui-monospace, monospace`;
  g.fillStyle = dim ? "rgba(90,100,112,.9)" : "rgba(232,235,239,.92)";
  g.fillText(name === "PC-C" ? name + "  ◈" : name, side ? p.x-hs-10*z : p.x, side ? p.y-hs+4*z : p.y+hs+16*z);
  g.font = `${Math.max(7.5, 8.5*z)}px ui-monospace, monospace`;
  g.fillStyle = "rgba(126,145,165,.75)";
  g.fillText(view.ip ? view.ip + " /24" : "no ip", side ? p.x-hs-10*z : p.x, side ? p.y-hs+17*z : p.y+hs+30*z);
}

// ---- orthogonal links with rounded bends (circuit-trace style) ----
// Each edge leaves its card on the dominant axis, rides one staggered
// trunk segment, and enters the far card square-on. Corners are rounded.
const T2_STUB = 46;    // clearance out of each card (cards are 30u half-size)
const T2_BEND = 16;    // corner radius

// Hub-lane routing: every spoke leaves the switch (or router) through an
// ordered "port" on the card edge, rides a lane in a shared channel near
// the hub, then branches squarely into its device — like the reference.
const T2_LANE_GAP = 16;    // spacing between parallel lanes in a channel
const T2_CHAN_OFF = 34;    // channel distance from the hub card edge
const T2_PORT_GAP = 12;    // spacing between exit points along the edge

function t2Lanes() {
  // group links by the side they leave their hub on; order lanes so the
  // branch order along the channel matches the device order — no crossings
  const groups = {};
  LINKS.forEach(([x, y], li) => {
    const hub = x === "CSW-01" ? x : (y === "CSW-01" ? y : x);
    const tgt = hub === x ? y : x;
    const dx = T2[tgt].x - T2[hub].x, dy = T2[tgt].y - T2[hub].y;
    const g = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "B" : "T");
    (groups[g] = groups[g] || []).push({ li, hub, tgt, key: (g === "R" || g === "L") ? T2[tgt].y : T2[tgt].x });
  });
  const lane = {};
  for (const g in groups) {
    groups[g].sort((p, q) => p.key - q.key);
    groups[g].forEach((r, i) => { lane[r.li] = { ...r, g, i, n: groups[g].length }; });
  }
  return lane;
}

function t2RouteFor(a, b, li) {
  const L = t2Lanes()[li];
  const hub = T2[L.hub], tgt = T2[L.tgt];
  const portOff = (L.i - (L.n-1)/2) * T2_PORT_GAP;
  const chan = T2_STUB + T2_CHAN_OFF + L.i * T2_LANE_GAP;
  let way;
  if (L.g === "R" || L.g === "L") {
    const sx = L.g === "R" ? 1 : -1;
    way = [
      { x: hub.x + sx*T2_STUB, y: hub.y + portOff },
      { x: hub.x + sx*chan,    y: hub.y + portOff },
      { x: hub.x + sx*chan,    y: tgt.y },
      { x: tgt.x - sx*T2_STUB, y: tgt.y },
    ];
  } else {
    const sy = L.g === "B" ? 1 : -1;
    way = [
      { x: hub.x + portOff, y: hub.y + sy*T2_STUB },
      { x: hub.x + portOff, y: hub.y + sy*chan },
      { x: tgt.x,           y: hub.y + sy*chan },
      { x: tgt.x,           y: tgt.y - sy*T2_STUB },
    ];
  }
  // drop degenerate segments (e.g. perfectly aligned runs stay straight)
  way = way.filter((p, i) => i === 0 || Math.hypot(p.x-way[i-1].x, p.y-way[i-1].y) > 2);
  if (L.hub !== a) way.reverse();   // keep the path's a→b direction
  return way;
}

// sample a waypoint path into a dense polyline, rounding interior corners
function t2BuildPath(a, b, li) {
  const way = t2RouteFor(a, b, li);
  const pts = [way[0]];
  for (let i = 1; i < way.length-1; i++) {
    const c = way[i], p = way[i-1], n = way[i+1];
    const u1 = Math.hypot(p.x-c.x, p.y-c.y) || 1, u2 = Math.hypot(n.x-c.x, n.y-c.y) || 1;
    const r = Math.min(T2_BEND, u1/2, u2/2);
    const ein = { x: c.x + (p.x-c.x)/u1*r, y: c.y + (p.y-c.y)/u1*r };
    const eout = { x: c.x + (n.x-c.x)/u2*r, y: c.y + (n.y-c.y)/u2*r };
    const prev = pts[pts.length-1];
    const seg = Math.hypot(ein.x-prev.x, ein.y-prev.y);
    const steps = Math.max(1, Math.round(seg/7));
    for (let s = 1; s <= steps; s++) pts.push({ x: prev.x+(ein.x-prev.x)*s/steps, y: prev.y+(ein.y-prev.y)*s/steps });
    for (let s = 1; s <= 5; s++) {   // quadratic corner arc
      const t = s/5, u = 1-t;
      pts.push({ x: u*u*ein.x + 2*u*t*c.x + t*t*eout.x, y: u*u*ein.y + 2*u*t*c.y + t*t*eout.y });
    }
  }
  const last = pts[pts.length-1], end = way[way.length-1];
  const seg = Math.hypot(end.x-last.x, end.y-last.y);
  const steps = Math.max(1, Math.round(seg/7));
  for (let s = 1; s <= steps; s++) pts.push({ x: last.x+(end.x-last.x)*s/steps, y: last.y+(end.y-last.y)*s/steps });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i-1] + Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y));
  return { pts, cum, len: cum[cum.length-1] || 1 };
}

// arc-length parametric point + unit tangent along a built path
function t2PathPoint(P, t) {
  const d = Math.max(0, Math.min(1, t)) * P.len;
  let i = 1;
  while (i < P.cum.length-1 && P.cum[i] < d) i++;
  const p0 = P.pts[i-1], p1 = P.pts[i];
  const seg = P.cum[i]-P.cum[i-1] || 1;
  const k = (d - P.cum[i-1]) / seg;
  return { x: p0.x+(p1.x-p0.x)*k, y: p0.y+(p1.y-p0.y)*k, tx: (p1.x-p0.x)/seg, ty: (p1.y-p0.y)/seg };
}
const smooth = k => k*k*(3-2*k);   // ease-in-out for the ambient pulses

// per-end interface state: a link is up only when BOTH ends are up
function t2EndInfo(dev, other) {
  if (dev.startsWith("PC-")) {
    const d = S.devices[dev];
    const t = tracePC(dev);
    const seated = t.failAt !== "cable" && t.failAt !== "nic";
    return { label:"NIC", up: !!(d.power && d.nic && seated) };
  }
  if (dev.startsWith("SRV")) {
    const d = S.devices[dev];
    return { label:"NIC", up: !!(d.power && d.nic && traceSRV(dev).ok) };
  }
  if (dev === "RTR-01") {
    const seated = S.cabling && S.cabling.cables["C-UPLINK"].a === "RTR-01:lan1";
    return { label:"LAN1", up: !!(routerUp() && seated) };
  }
  // CSW-01 — the port depends on the far device
  if (!switchUp()) return { label:"—", up:false };
  if (other.startsWith("PC-")) {
    const t = tracePC(other);
    return { label: t.switchPort ? t.switchPort.split(":").pop().toUpperCase() : "—", up: !!t.ok };
  }
  if (other.startsWith("SRV")) {
    const t = traceSRV(other);
    return { label: t.switchPort ? t.switchPort.split(":").pop().toUpperCase() : "—", up: !!t.ok };
  }
  const seated = S.cabling && S.cabling.cables["C-UPLINK"].b === "CSW-01:p24";
  return { label:"P24", up: !!seated };
}

function t2LinkState(a, b, byName) {
  const va = byName[a], vb = byName[b];
  if (!va.power || !vb.power) return "off";
  const pc = a.startsWith("PC-") ? a : (b.startsWith("PC-") ? b : null);
  if (pc && !S.devices[pc].nic) return "nicdown";
  const ea = t2EndInfo(a, b), eb = t2EndInfo(b, a);
  if (ea.up && eb.up) return (va.vlan === 20 || vb.vlan === 20) ? "vlan" : "up";
  return "nolink";
}

const T2_EDGE_STYLE = {
  up:      { col:"rgba(178,188,202,.55)", dash:[] },
  vlan:    { col:"rgba(224,161,62,.5)",   dash:[] },
  nicdown: { col:"rgba(224,161,62,.5)",   dash:[5,6] },
  nolink:  { col:"rgba(122,130,144,.4)",  dash:[5,6] },
  off:     { col:"rgba(92,100,112,.3)",   dash:[5,6] },
};

// Legend copy for the VIRTUAL edge styles. The samples are rendered from
// T2_EDGE_STYLE itself, so the legend can never drift from the canvas.
const T2_EDGE_LABEL = {
  up:      "BOTH ENDS UP",
  vlan:    "UP ACROSS SEGMENTS",
  nicdown: "NIC DISABLED",
  nolink:  "NO LINK · AN END IS DOWN",
  off:     "DEVICE OFF",
};

function t2LegendHTML() {
  const rows = Object.entries(T2_EDGE_STYLE).map(([st, s]) => `
    <div class="ns-legend-row">
      <svg class="ns-legend-line" viewBox="0 0 26 4" aria-hidden="true">
        <line x1="1" y1="2" x2="25" y2="2" stroke="${s.col}" stroke-width="1.4"${s.dash.length ? ` stroke-dasharray="${s.dash.join(" ")}"` : ""}/>
      </svg>
      <span>${T2_EDGE_LABEL[st]}</span>
    </div>`).join("");
  return `<div class="ns-legend-title">LINK STATE</div>${rows}`;
}

// screen-space samples of every edge this frame — reused by hover hit-testing
let t2Samples = [];

function t2Edges(g, byName, W, H, time, hoveredLink) {
  // VLAN 20 container behind the server links
  const z0 = w2s({x:T2_ZONE20.x, y:T2_ZONE20.y}, W, H);
  const zw = T2_ZONE20.w*cam2.z, zh = T2_ZONE20.h*cam2.z;
  g.fillStyle = "rgba(224,161,62,.05)"; g.strokeStyle = "rgba(224,161,62,.4)"; g.lineWidth = 1.1;
  g.setLineDash([6,6]); g.beginPath(); g.roundRect(z0.x, z0.y, zw, zh, 10*cam2.z); g.fill(); g.stroke(); g.setLineDash([]);
  g.font = `${Math.max(7.5, 8.5*cam2.z)}px ui-monospace, monospace`; g.textAlign = "left";
  g.fillStyle = "rgba(224,161,62,.65)";
  g.fillText("VLAN 20 · SERVERS", z0.x+10*cam2.z, z0.y+16*cam2.z);

  t2Samples = [];
  for (let li = 0; li < LINKS.length; li++) {
    const [a,b] = LINKS[li];
    const P = t2BuildPath(a, b, li);
    const pts = P.pts.map(p => w2s(p, W, H));
    t2Samples.push({ a, b, P, pts });
    const st = t2LinkState(a, b, byName);
    const style = T2_EDGE_STYLE[st];
    const isHov = hoveredLink === li;
    g.strokeStyle = isHov ? "rgba(232,235,239,.8)" : style.col;
    g.lineWidth = isHov ? 2 : 1.4;
    g.setLineDash(style.dash);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.stroke(); g.setLineDash([]);
    if (st === "up" || st === "vlan") {
      // ambient traffic pulse, eased in and out along the route
      const k = smooth((time/2600 + li*.23) % 1);
      const p = w2s(t2PathPoint(P, k), W, H);
      g.fillStyle = "rgba(178,188,202,.5)";
      g.beginPath(); g.arc(p.x, p.y, 1.8*cam2.z, 0, 7); g.fill();
    }
  }

  // the WAN lead: from the router upward, fading out of the sheet
  const r0 = w2s(T2["RTR-01"], W, H), tip = w2s(T2_ISP_TIP, W, H);
  const fade = g.createLinearGradient(r0.x, r0.y-30*cam2.z, tip.x, tip.y);
  fade.addColorStop(0, "rgba(154,164,178,.55)"); fade.addColorStop(1, "rgba(154,164,178,.02)");
  g.strokeStyle = fade; g.lineWidth = 1.4; g.setLineDash([6,6]);
  g.beginPath(); g.moveTo(r0.x, r0.y-30*cam2.z); g.lineTo(tip.x, tip.y); g.stroke(); g.setLineDash([]);
  g.font = `${Math.max(7.5, 8.5*cam2.z)}px ui-monospace, monospace`; g.textAlign = "center";
  g.fillStyle = "rgba(93,111,132,.6)";
  g.fillText("TO ISP — BEYOND THIS OFFICE →", tip.x, tip.y-8*cam2.z);
}

// hover a link: name the interface at each end, with its own status dot
function t2LinkChips(g, li, W, H) {
  const rec = t2Samples[li]; if (!rec) return;
  const { a, b, P } = rec;
  const z = cam2.z;
  const sgn = li % 2 ? 1 : -1;   // alternate which side of the trace the chips sit on
  const ends = [ { t: .20, dev: a, other: b }, { t: .80, dev: b, other: a } ];
  for (const e of ends) {
    const info = t2EndInfo(e.dev, e.other);
    const q = t2PathPoint(P, e.t);
    const pt = w2s(q, W, H);
    const cx = pt.x + -q.ty*sgn*26*z, cy = pt.y + q.tx*sgn*26*z;
    g.font = `${Math.max(7.5, 8.5*z)}px ui-monospace, monospace`;
    const w = g.measureText(info.label).width + 20*z, h = 15*z;
    g.fillStyle = "rgba(10,12,15,.94)"; g.strokeStyle = "rgba(154,164,178,.6)"; g.lineWidth = 1;
    g.beginPath(); g.roundRect(cx-w/2, cy-h/2, w, h, 4*z); g.fill(); g.stroke();
    g.fillStyle = info.up ? "#79c98d" : "#e0a13e";
    g.beginPath(); g.arc(cx-w/2+8*z, cy, 2.4*z, 0, 7); g.fill();
    g.fillStyle = "rgba(232,235,239,.9)"; g.textAlign = "left";
    g.fillText(info.label, cx-w/2+14*z, cy+3*z);
  }
}

function t2LinkAt(mx, my) {
  for (let li = 0; li < t2Samples.length; li++) {
    const pts = t2Samples[li].pts;
    for (const p of pts) {
      if ((mx-p.x)**2 + (my-p.y)**2 < 12**2) return li;
    }
  }
  return null;
}

// ---------------- cabling mode: the physical layer, made visible ----------------
function drawNodeDot(g, p, color, r=3) {
  g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
}
function breakMarker(g, p, time) {
  g.strokeStyle = `rgba(224,161,62,${.55+.35*Math.sin(time/300)})`; g.lineWidth = 1.4;
  g.beginPath(); g.arc(p.x, p.y, 6.5, 0, 7); g.stroke();
  g.beginPath();
  g.moveTo(p.x-3, p.y-3); g.lineTo(p.x+3, p.y+3);
  g.moveTo(p.x+3, p.y-3); g.lineTo(p.x-3, p.y+3);
  g.stroke();
}
function smallLabel(g, p, text, color) {
  g.font = "8px ui-monospace, monospace"; g.textAlign = "center";
  g.fillStyle = color; g.fillText(text, p.x, p.y);
}

// ---------------- cabling mode: 2D floor plan ----------------
// The building sheet: real walls and rooms per the office blueprint,
// devices where their desks and racks are. Visible plant is always
// drawn; hidden in-wall runs appear only while tracing (hover).
// Navigate + inspect — fixes happen in the close-up views.

function planJackX(outlet) {
  const F = activeScenario.floorplan;
  const jack = S.cabling && S.cabling.runs[outlet];
  if (!jack) return null;
  return F.jackX.start + (parseInt(jack.slice(3),10) - 1) * F.jackX.step;
}
// Leftmost jack exits the trunk lowest, so its drop can never pass through
// another run's horizontal fan-out.
function planFanY(outlet) {
  const F = activeScenario.floorplan;
  if (!S.cabling || !S.cabling.runs[outlet]) return null;
  const order = Object.keys(F.taps)
    .filter(o => S.cabling.runs[o])
    .sort((a, b) => planJackX(a) - planJackX(b));
  return F.fan.bottom - order.indexOf(outlet) * F.fan.step;
}
// vertical extent the trunk must cover: every tap and every fan-out
function planTrunkSpan() {
  const F = activeScenario.floorplan;
  if (!S.cabling) return null;
  let lo = Infinity, hi = -Infinity;
  for (const o of Object.keys(F.taps)) {
    if (!S.cabling.runs[o]) continue;
    lo = Math.min(lo, F.taps[o].y, planFanY(o));
    hi = Math.max(hi, F.taps[o].y, planFanY(o));
  }
  return lo <= hi ? { lo, hi } : null;
}

// Exported for tests: the drawn route is the contract that the TRUE jack
// from S.cabling.runs is honoured, not the printed panel label.
export function planRunPath(outlet) {
  const F = activeScenario.floorplan;
  const T = F.taps[outlet]; if (!T || !S.cabling) return null;
  const jx = planJackX(outlet); if (jx == null) return null;   // TRUE endpoint
  const fy = planFanY(outlet);
  return [T.from, [F.trunkX, T.y], [F.trunkX, fy], [jx, fy], [jx, 254]].map(([x,y]) => ({x,y}));
}

// ---------- plan hit-testing ----------
let planHot = [];   // rebuilt each frame: {kind,id,x,y,r} or {kind,id,seg:[pts]}
function distToSeg(px, py, a, b) {
  const dx=b.x-a.x, dy=b.y-a.y, l2=dx*dx+dy*dy||1;
  const t=Math.max(0, Math.min(1, ((px-a.x)*dx+(py-a.y)*dy)/l2));
  return Math.hypot(px-(a.x+t*dx), py-(a.y+t*dy));
}
function planHitAt(mx, my) {
  // point targets (devices, outlets, jacks) beat line targets (cords, runs, leads)
  for (let i=planHot.length-1; i>=0; i--) {
    const h = planHot[i];
    if (!h.seg && (mx-h.x)**2 + (my-h.y)**2 < h.r*h.r) return h;
  }
  for (let i=planHot.length-1; i>=0; i--) {
    const h = planHot[i];
    if (h.seg) { for (let s=0;s<h.seg.length-1;s++) if (distToSeg(mx,my,h.seg[s],h.seg[s+1]) < 9) return h; }
  }
  return null;
}
// resolve any hovered thing to the physical chain it belongs to
function planChainOf(kind, id) {
  let pc=null, outlet=null, jack=null;
  if ((kind==="dev" && id.startsWith("PC-")) || kind==="cord") pc=id;
  else if (kind==="outlet" || kind==="run") outlet=id;
  else if (kind==="jack") jack=id;
  else if (kind==="lead") {
    const c = S.cabling.cables[id];
    const m = ((c && c.a) || "").match(/^(PP-\d+):jack$/);
    if (m) jack = m[1];
  }
  if (pc) { const t = tracePC(pc); outlet = t.outlet; jack = t.panelJack; }
  if (outlet && !jack) jack = S.cabling.runs[outlet] || null;
  if (jack && !outlet) outlet = Object.keys(S.cabling.runs).find(o => S.cabling.runs[o] === jack) || null;
  if (outlet && !pc) {
    const conn = cableAt(outlet+":sock");
    const e = conn && conn.cable[conn.end === "a" ? "b" : "a"];
    const m = (e || "").match(/^(PC-[A-D]):nic$/);
    if (m) pc = m[1];
  }
  return { pc, outlet, jack };
}

function planTipFor(h) {
  const C = S.cabling;
  if (h.kind === "dev") {
    const v = netspaceView().find(n => n.name === h.id);
    if (!v) return null;
    return `<b>${v.name}</b> · ${v.ip || "no ip"}<br/>${T2_STATE_TXT[v.state] || v.state}<br/><span class="tip-tag">physical layer · click to open</span>`;
  }
  if (h.kind === "laptop")
    return `<b>DIRECTOR'S LAPTOP</b><br/>No outlet. No run. Administration was never wired.<br/><span class="tip-tag">a future lesson</span>`;
  if (h.kind === "outlet") {
    const conn = cableAt(h.id + ":sock");
    let deskTxt = "socket vacant";
    if (conn && conn.cable.kind === "long") {
      const pcEnd = conn.cable[conn.end === "a" ? "b" : "a"];
      const pm = (pcEnd || "").match(/^(PC-[A-D]):nic$/);
      deskTxt = pm ? `desk cable → ${pm[1]}` : "desk cable — far end loose";
    }
    return `<b>${h.id}</b> · wall outlet<br/>${deskTxt}<br/>hidden run → ${C.runs[h.id] || "?"} (traced on the sheet)<br/><span class="tip-tag">click to open</span>`;
  }
  if (h.kind === "jack") {
    const printed = C.panel[h.id].printed;
    const live = runContinuity(h.id);
    const conn = cableAt(h.id + ":jack");
    const other = conn ? conn.cable[conn.end === "a" ? "b" : "a"] : null;
    const sm = (other || "").match(/^CSW-01:(p\d+)$/);
    const leadTxt = conn ? (sm ? "patch lead → SW-" + sm[1].slice(1) : "patch lead dangling") : "no patch lead";
    const warn = live && live.outlet !== printed && !conn;
    const lightTxt = live
      ? `<span style="color:${warn ? "#e0a13e" : "#79c98d"}">● LIGHT ON — reaches ${live.outlet} (${live.pc})</span>`
      : `<span style="color:#5b6472">○ DARK — nothing reaches this jack</span>`;
    return `<b>${h.id}</b> · printed label: ${printed}<br/>${lightTxt}<br/>${leadTxt}<br/><span class="tip-tag">click to open</span>`;
  }
  if (h.kind === "cord") {
    const c = C.cables["C-PC"+h.id.slice(-1)];
    const seatedA = c.a === h.id+":nic";
    const m = (c.b || "").match(/^(OF-\d+):sock$/);
    const st = seatedA && m ? "seated both ends" : `<span style="color:#e0a13e">LOOSE AT THE PC</span>`;
    return `<b>C-PC${h.id.slice(-1)}</b> · desk cable<br/>${h.id} NIC → ${m ? m[1] : "(loose)"} · ${st}`;
  }
  if (h.kind === "lead") {
    const c = C.cables[h.id];
    return `<b>${h.id}</b> · patch lead<br/>${c.a || "(loose)"} → ${c.b || "(loose)"}`;
  }
  return null;
}

// ---- the sheet itself: walls, doors, room labels (never dimmed) ----
function drawPlanSheet(g, P, z, F) {
  g.globalAlpha = 1;
  g.strokeStyle = "rgba(154,164,178,.75)"; g.lineWidth = 2.6; g.lineCap = "round";
  for (const [x1,y1,x2,y2] of F.walls) {
    const p0 = P(x1,y1), p1 = P(x2,y2);
    g.beginPath(); g.moveTo(p0.x,p0.y); g.lineTo(p1.x,p1.y); g.stroke();
  }
  g.strokeStyle = "rgba(154,164,178,.45)"; g.lineWidth = 1.1;
  for (const d of F.doors) {
    const hp = P(d.hx, d.hy), tp = P(d.hx + Math.cos(d.a0)*d.r, d.hy + Math.sin(d.a0)*d.r);
    g.beginPath(); g.moveTo(hp.x,hp.y); g.lineTo(tp.x,tp.y); g.stroke();
    g.beginPath(); g.arc(hp.x, hp.y, d.r*z, d.a0, d.a1); g.stroke();
  }
  g.font = `${Math.max(9, 12*z)}px ui-monospace, monospace`;
  for (const lab of F.labels) {
    const lp = P(lab.x, lab.y);
    g.save(); g.translate(lp.x, lp.y);
    if (lab.rot) g.rotate(lab.rot);
    g.textAlign = lab.align || "left";
    g.fillStyle = `rgba(154,164,178,${lab.alpha == null ? .5 : lab.alpha})`;
    g.fillText(lab.text, 0, 0);
    g.restore();
  }
  g.textAlign = "left";
}

// the riser bracket: where this sheet meets the vertical backbone
function drawPlanRiser(g, P, z, F) {
  const rs = F.riser; if (!rs) return;
  const p = P(rs.x, rs.y);
  g.globalAlpha = 1;
  g.strokeStyle = "rgba(154,164,178,.55)"; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(p.x, p.y-10*z); g.lineTo(p.x, p.y+10*z); g.stroke();
  for (const yy of [p.y-10*z, p.y+10*z]) {
    g.beginPath(); g.moveTo(p.x-4*z, yy); g.lineTo(p.x+4*z, yy); g.stroke();
  }
  g.font = `${Math.max(7, 8*z)}px ui-monospace, monospace`; g.textAlign = "left";
  g.fillStyle = "rgba(93,111,132,.7)";
  g.fillText(rs.label, p.x+10*z, p.y+3*z);
}

function drawPlanRack(g, P, z, rack) {
  const r = P(rack.x, rack.y);
  g.fillStyle = "rgba(24,30,38,.75)"; g.strokeStyle = "rgba(96,104,117,.8)"; g.lineWidth = 1.2;
  g.beginPath(); g.roundRect(r.x, r.y, rack.w*z, rack.h*z, 4); g.fill(); g.stroke();
  g.font = `${Math.max(7, 8*z)}px ui-monospace, monospace`; g.textAlign = "left";
  g.fillStyle = "rgba(126,145,165,.75)"; g.fillText(rack.label, r.x, r.y-6*z);
}

function sheetLabel(floorplan) {
  const sheet = PREVIEW_FLOORS.find(s => s.floorplan === floorplan);
  return sheet ? sheet.label : "SHEET";
}

function facilityCardsHTML() {
  return FACILITY.floors.map(f => `
    <button class="fac-card${f.sheet ? "" : " is-void"}" id="fac-${f.id.toLowerCase()}" data-floor="${f.id}"${f.sheet ? "" : " disabled"}>
      <span class="fac-id">${f.id}</span><span class="fac-name">${f.name}</span>
      <span class="fac-sub">${f.sub}</span>
      <span class="fac-state">${f.sheet ? "SHEET ON FILE" : "NO SHEET — NOT SURVEYED"}</span>
    </button>`).join("");
}

// interiors live at sheet coordinates; the plate is the frame they are mapped into
function drawSheetInterior(g, sheet, z, iso, HW, HD) {
  const walls = sheet.walls || [];
  if (!walls.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x1, y1, x2, y2] of walls) {
    minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
  }
  if (!(maxX > minX) || !(maxY > minY)) return;
  const U = x => -HW + ((x - minX) / (maxX - minX)) * 2 * HW;
  const V = y => -HD + ((y - minY) / (maxY - minY)) * 2 * HD;

  g.setLineDash([]);
  g.strokeStyle = "rgba(136,155,175,.55)"; g.lineWidth = 1;
  g.fillStyle = "rgba(14,19,25,.72)";             // dimmer than the plate: rooms, not lines
  for (const [x1, y1, x2, y2] of walls) {
    const a = iso(U(x1), V(y1), z), b = iso(U(x2), V(y2), z);
    const at = iso(U(x1), V(y1), z + FAC.WALL), bt = iso(U(x2), V(y2), z + FAC.WALL);
    g.beginPath();
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(bt.x, bt.y); g.lineTo(at.x, at.y);
    g.closePath(); g.fill(); g.stroke();
  }

  g.fillStyle = "rgba(154,164,178,.40)"; g.strokeStyle = "rgba(154,164,178,.60)";
  for (const rack of sheet.racks || []) {
    const quad = [[rack.x,rack.y],[rack.x+rack.w,rack.y],[rack.x+rack.w,rack.y+rack.h],[rack.x,rack.y+rack.h]]
      .map(([x,y]) => iso(U(x), V(y), z));
    g.beginPath();
    quad.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
    g.closePath(); g.fill(); g.stroke();
  }
}

// the slab frame — shared by the drawing and the pointer, so they cannot drift
const FAC = { HW: 14, HD: 4, TH: 1.2, GAP: 6.2, TILT: 0.58, WALL: 0.9 };

// fit the whole stack (measured at s = 1) into the canvas with a 60px margin;
// GAP, TILT and floor count all feed the fit, so nothing is clipped at zoom 1
function facilityProjection(W, H) {
  const { HW, HD, TH, GAP, TILT } = FAC;
  const zBot = -(FACILITY.floors.length - 1) * GAP - TH;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const z of [0, zBot]) for (const [x, y] of [[-HW,-HD],[HW,-HD],[HW,HD],[-HW,HD]]) {
    const px = x - y, py = (x + y) * TILT - z;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const pad = 60;
  const s = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY)) * facZoom;
  const ox = W / 2 - ((minX + maxX) / 2) * s;
  const oy = H / 2 - ((minY + maxY) / 2) * s;
  return { s, ox, iso: (x, y, z) => ({ x: ox + (x - y) * s, y: oy + ((x + y) * TILT - z) * s }) };
}

// point-in-polygon over the projected top faces; later-drawn plates sit in front
function buildingHitAt(mx, my, W, H) {
  const { iso } = facilityProjection(W, H);
  const floors = FACILITY.floors;
  for (let i = floors.length - 1; i >= 0; i--) {
    const z = -FAC.GAP * i;
    const pts = [[-FAC.HW,-FAC.HD],[FAC.HW,-FAC.HD],[FAC.HW,FAC.HD],[-FAC.HW,FAC.HD]].map(([x,y]) => iso(x, y, z));
    let inside = false;
    for (let k = 0, j = 3; k < 4; j = k++) {
      const { x: xi, y: yi } = pts[k], { x: xj, y: yj } = pts[j];
      if ((yi > my) !== (yj > my) && mx < (xj - xi) * (my - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return floors[i];
  }
  return null;
}

// ---- the facility map: iso slabs, interiors only where a sheet exists ----
function drawFacilityBuilding(g, W, H, canvas) {
  planHot = [];
  const floors = FACILITY.floors, { GAP, HW, HD, TH } = FAC, { iso } = facilityProjection(W, H);
  const quad = (pts, fill) => {
    g.beginPath();
    pts.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    g.stroke();
  };
  g.globalAlpha = 1;

  // ground plane line, one gap below the lowest slab
  const ga = iso(-21, 0, -GAP * floors.length), gb = iso(21, 0, -GAP * floors.length);
  g.strokeStyle = "rgba(154,164,178,.16)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(ga.x, ga.y); g.lineTo(gb.x, gb.y); g.stroke();

  // plates, top of the stack first: L0 at the top, L3 at the bottom
  floors.forEach((f, i) => {
    const z = -GAP * i, sheet = !!f.sheet, selected = f.id === selectedFacilityFloor;
    const hovered = hoveredFacilityFloor && hoveredFacilityFloor.id === f.id;
    const topPts = [[-HW,-HD],[HW,-HD],[HW,HD],[-HW,HD]].map(([x,y]) => iso(x, y, z));
    const botPts = [[-HW,-HD],[HW,-HD],[HW,HD],[-HW,HD]].map(([x,y]) => iso(x, y, z - TH));
    const sideX = [topPts[1], topPts[2], botPts[2], botPts[1]];   // +x face
    const sideY = [topPts[2], topPts[3], botPts[3], botPts[2]];   // +y face
    g.setLineDash(sheet ? [] : [5, 5]);
    g.lineWidth = selected ? 1.8 : hovered ? 1.6 : sheet ? 1.5 : 1;
    g.strokeStyle = selected ? "rgba(224,161,62,.9)"
      : hovered ? (sheet ? "rgba(224,161,62,.62)" : "rgba(196,206,220,.55)")
      : sheet ? "rgba(154,164,178,.75)" : "rgba(154,164,178,.28)";
    const sideFill = selected ? "rgba(120,86,24,.30)" : sheet ? "rgba(12,16,22,.62)" : "rgba(9,12,16,.55)";
    quad(sideX, sideFill); quad(sideY, sideFill);   // thickness, same stroke as the top
    quad(topPts, selected ? "rgba(224,161,62,.10)" : sheet ? "rgba(32,40,51,.55)" : "rgba(20,25,32,.38)");
    g.setLineDash([]);
  });

  // the sheets' own interiors, over the stack so they stay legible —
  // never the office's plan, never invented for a void floor
  floors.forEach((f, i) => {
    if (f.sheet) drawSheetInterior(g, f.sheet, -GAP * i, iso, HW, HD);
  });

  // slim core prism through every board, one node per level
  const zBot = -GAP * (floors.length - 1) - TH, c = 1.2;
  const coreX = [iso(c,-c,0), iso(c,c,0), iso(c,c,zBot), iso(c,-c,zBot)];
  const coreY = [iso(c,c,0), iso(-c,c,0), iso(-c,c,zBot), iso(c,c,zBot)];
  g.setLineDash([]); g.lineWidth = 1; g.strokeStyle = "rgba(154,164,178,.34)";
  quad(coreX, "rgba(154,164,178,.06)");
  quad(coreY, "rgba(154,164,178,.06)");
  quad([iso(-c,-c,0), iso(c,-c,0), iso(c,c,0), iso(-c,c,0)], "rgba(30,38,48,.55)");
  for (let i = 0; i < floors.length; i++) {
    const r = 1.05, node = [[r,0],[0,r],[-r,0],[0,-r]].map(([x,y]) => iso(x, y, -GAP * i));
    g.strokeStyle = "rgba(224,232,242,.85)";
    quad(node, "rgba(210,220,232,.60)");
  }

  // slab centres, canvas-relative, for pointer probes
  for (let i = 0; i < floors.length; i++) {
    const ctr = iso(0, 0, -GAP * i);
    canvas.dataset["slab" + floors[i].id] = `${Math.round(ctr.x)},${Math.round(ctr.y)}`;
  }
}

function drawCablingPlan(g, W, H, time, byName, hoveredPlan) {
  const C = S.cabling; if (!C) return;
  const F = previewFloor || activeScenario.floorplan;
  const z = acam().z;
  planHot = [];
  const chain = hoveredPlan ? planChainOf(hoveredPlan.kind, hoveredPlan.id) : null;
  const dim = member => { g.globalAlpha = chain && !member ? .3 : 1; };
  const P = (x, y) => w2s({x, y}, W, H);

  drawPlanSheet(g, P, z, F);
  drawPlanRiser(g, P, z, F);

  // ---- a preview sheet: the printed plan, before anything is wired ----
  if (previewFloor) {
    for (const rack of F.racks) drawPlanRack(g, P, z, rack);
    g.globalAlpha = 1;
    return;
  }

  // ---- the shared trunk: one conduit in the tray, always visible ----
  // Runs themselves stay hidden; this is only the tray they share.
  const trunk = planTrunkSpan();
  if (trunk) {
    const a = P(F.trunkX, trunk.lo - 6), b = P(F.trunkX, trunk.hi + 6);
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(154,164,178,.09)"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = "rgba(154,164,178,.28)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }

  // ---- desks + workstations ----
  for (const pc of ["PC-A","PC-B","PC-C","PC-D"]) {
    const L = F.devices[pc], p = P(L.x, L.y);
    const member = !chain || chain.pc === pc;
    dim(member);
    g.fillStyle = "rgba(32,40,51,.5)"; g.strokeStyle = "rgba(96,104,117,.7)"; g.lineWidth = 1.1;
    g.beginPath(); g.roundRect(p.x-34*z, p.y+10*z, 68*z, 20*z, 3*z); g.fill(); g.stroke();
    const v = byName[pc];
    const col = T2_STATE_COL[v ? v.state : "silent"] || "#5b6472";
    const img = nodeIconImage("pc", v && v.state === "off" ? "#5b6472" : "#b2bcca", col);
    const hs = 15*z;
    if (img.complete && img.naturalWidth) g.drawImage(img, p.x-hs, p.y-hs, hs*2, hs*2);
    if (chain && chain.pc === pc) {
      g.strokeStyle = "rgba(232,235,239,.9)"; g.lineWidth = 1.4;
      g.beginPath(); g.roundRect(p.x-hs-4, p.y-hs-4, hs*2+8, hs*2+8, 8*z); g.stroke();
    }
    g.font = `${Math.max(7.5, 8.5*z)}px ui-monospace, monospace`; g.textAlign = "center";
    g.fillStyle = "rgba(232,235,239,.8)"; g.fillText(pc, p.x, p.y+42*z);
    planHot.push({ kind:"dev", id:pc, x:p.x, y:p.y, r:Math.max(16, 22*z) });
  }

  // ---- desk cords: PC → wall outlet (visible plant) ----
  for (const pc of ["PC-A","PC-B","PC-C","PC-D"]) {
    const c = C.cables["C-PC"+pc.slice(-1)];
    const m = (c.b || "").match(/^(OF-\d+):sock$/);
    const seatedNic = c.a === pc+":nic";
    const member = !chain || chain.pc === pc;
    dim(member);
    const p0 = P(F.devices[pc].x, F.devices[pc].y);
    const onChain = chain && chain.pc === pc;
    if (m) {
      const p1 = P(F.outlets[m[1]].x, F.outlets[m[1]].y);
      if (seatedNic) drawPolyline(g, [p0,p1], onChain ? "rgba(121,201,141,.95)" : "rgba(178,188,202,.6)", onChain ? 2.2 : 1.3);
      else { drawPolyline(g, [p0,p1], "rgba(224,161,62,.5)", 1.2, [3,4]); breakMarker(g, {x:p0.x, y:p0.y-24*z}, time); }
      planHot.push({ kind:"cord", id:pc, seg:[p0,p1] });
    } else {
      const p1 = { x:p0.x+22*z, y:p0.y+22*z };
      drawPolyline(g, [p0,p1], "rgba(224,161,62,.55)", 1.2, [3,4]);
      breakMarker(g, {x:p0.x, y:p0.y-24*z}, time);
    }
  }

  // ---- wall outlets ----
  for (const [id, o] of Object.entries(F.outlets)) {
    const p = P(o.x, o.y);
    const member = !chain || chain.outlet === id;
    dim(member);
    g.strokeStyle = chain && chain.outlet === id ? "rgba(232,235,239,.95)" : "rgba(154,164,178,.6)";
    g.lineWidth = 1.2; g.strokeRect(p.x-5, p.y-5, 10, 10);
    if (cableAt(id+":sock")) drawNodeDot(g, {x:p.x+7, y:p.y-7}, "rgba(154,164,178,.9)", 2);
    g.font = `${Math.max(7, 8*z)}px ui-monospace, monospace`; g.textAlign = o.la;
    g.fillStyle = "rgba(126,145,165,.8)"; g.fillText(id, p.x + o.lx, p.y + o.ly);
    planHot.push({ kind:"outlet", id, x:p.x, y:p.y, r:14 });
  }

  // ---- the traced hidden run (hover-only): wall plate → shared trunk → TRUE jack ----
  if (chain && chain.outlet) {
    const pts = planRunPath(chain.outlet);
    if (pts) {
      const sp = pts.map(p => P(p.x, p.y));
      const live = chain.jack && runContinuity(chain.jack);
      g.globalAlpha = 1;
      drawPolyline(g, sp, live ? "rgba(121,201,141,.9)" : "rgba(224,161,62,.85)", 1.7, [6,5]);
      planHot.push({ kind:"run", id:chain.outlet, seg:sp });
      g.font = `${Math.max(7.5, 8.5*z)}px ui-monospace, monospace`; g.textAlign = "left";
      g.fillStyle = live ? "rgba(121,201,141,.85)" : "rgba(224,161,62,.85)";
      const st = F.taps[chain.outlet].from;
      const rl = P(st[0]+10, st[1]-12);
      g.fillText(`HIDDEN RUN · ${chain.outlet} → ${chain.jack}`, rl.x, rl.y);
    }
  }

  // ---- server room: racks, panel, switch, router, WAN ----
  // Rack A (servers)
  dim(!chain || !chain.pc);   // servers never belong to a PC chain
  {
    drawPlanRack(g, P, z, F.racks.find(r => r.id === "A"));
    for (const srv of ["SRV-01","SRV-02"]) {
      const L = F.devices[srv], p = P(L.x, L.y);
      const v = byName[srv];
      const col = T2_STATE_COL[v ? v.state : "silent"] || "#5b6472";
      const img = nodeIconImage("server", v && v.state === "off" ? "#5b6472" : "#b2bcca", col);
      const hs = 13*z;
      if (img.complete && img.naturalWidth) g.drawImage(img, p.x-hs, p.y-hs, hs*2, hs*2);
      g.textAlign = "center"; g.fillStyle = "rgba(232,235,239,.7)";
      g.fillText(srv, p.x, p.y+24*z);
      planHot.push({ kind:"dev", id:srv, x:p.x, y:p.y, r:Math.max(14, 18*z) });
    }
  }
  // Rack B (patch panel + switch)
  dim(true);
  drawPlanRack(g, P, z, F.racks.find(r => r.id === "B"));
  // panel jacks with continuity LEDs + patch leads to switch ports
  Object.keys(C.panel).sort().forEach((jack, i) => {
    const jx = F.jackX.start + i*F.jackX.step, p = P(jx, 260);
    const live = runContinuity(jack);
    const printed = C.panel[jack].printed;
    const conn = cableAt(jack + ":jack");
    const disagree = live && live.outlet !== printed && !conn;   // amber only while the mismatch is unpatched
    const member = !chain || chain.jack === jack;
    dim(member);
    g.strokeStyle = chain && chain.jack === jack ? "rgba(232,235,239,.95)"
                  : disagree ? "rgba(224,161,62,.9)" : "rgba(154,164,178,.55)";
    g.lineWidth = 1.1; g.strokeRect(p.x-4.5, p.y-4.5, 9, 9);
    drawNodeDot(g, {x:p.x, y:p.y-9},
      live ? (disagree ? "rgba(224,161,62,.95)" : "rgba(121,201,141,.95)") : "rgba(42,48,58,.9)", 2.2);
    g.font = "7px ui-monospace, monospace"; g.textAlign = "center";
    g.fillStyle = disagree ? "rgba(224,161,62,.85)" : "rgba(126,145,165,.8)";
    g.fillText(jack.slice(3), p.x, p.y+14);
    planHot.push({ kind:"jack", id:jack, x:p.x, y:p.y, r:13 });
    if (conn) {
      const other = conn.cable[conn.end === "a" ? "b" : "a"];
      const sm = (other || "").match(/^CSW-01:(p\d+)$/);
      if (sm) {
        const px = F.portX.start + (parseInt(sm[1],10) - 1)*(F.portX.span/F.portX.count);
        const pts = [P(jx,265), P(jx,271), P(px,271), P(px,276)];
        drawPolyline(g, pts, chain && chain.jack === jack ? "rgba(121,201,141,.95)" : "rgba(178,188,202,.65)", 1.3);
        planHot.push({ kind:"lead", id:conn.id, seg:pts });
      } else {
        drawPolyline(g, [P(jx,265), P(jx,272)], "rgba(224,161,62,.55)", 1.2, [3,4]);  // dangling
      }
    } else if (live) {
      breakMarker(g, p, time);   // lit but unpatched — the teachable gap
    }
  });
  // switch chassis with port ticks
  dim(true);
  {
    const sw = P(310, 274);
    g.fillStyle = "rgba(17,21,27,.9)"; g.strokeStyle = "rgba(96,104,117,.8)"; g.lineWidth = 1.1;
    g.beginPath(); g.roundRect(sw.x, sw.y, 116*z, 14*z, 2); g.fill(); g.stroke();
    for (let n = 1; n <= 24; n++) {
      const pp = P(F.portX.start + (n-1)*(F.portX.span/F.portX.count), 277);
      g.fillStyle = cableAt(`CSW-01:p${String(n).padStart(2,"0")}`) ? "rgba(126,145,165,.9)" : "rgba(60,66,78,.9)";
      g.fillRect(pp.x-1.5, pp.y-2, 3, 4.5);
    }
    g.font = "7px ui-monospace, monospace"; g.textAlign = "left";
    g.fillStyle = "rgba(126,145,165,.8)"; g.fillText("CSW-01", sw.x+4, sw.y+9.5);
    planHot.push({ kind:"dev", id:"CSW-01", x:sw.x+58*z, y:sw.y+7*z, r:Math.max(14, 16*z) });
  }
  // server leads (Rack A → switch)
  for (const [cid, srv] of [["C-SRV1","SRV-01"],["C-SRV2","SRV-02"]]) {
    const c = C.cables[cid], L = F.devices[srv];
    const sm = (c.b || "").match(/^CSW-01:(p\d+)$/);
    if (c.a === srv+":nic" && sm) {
      const px = F.portX.start + (parseInt(sm[1],10) - 1)*(F.portX.span/F.portX.count);
      drawPolyline(g, [P(L.x,255), P(L.x,238), P(px,238), P(px,276)], "rgba(178,188,202,.45)", 1.2);
    }
  }
  // router + uplink + the WAN lead out the server-room wall
  {
    const rp = P(F.devices["RTR-01"].x, F.devices["RTR-01"].y);
    const v = byName["RTR-01"];
    const img = nodeIconImage("router", "#b2bcca", T2_STATE_COL[v ? v.state : "silent"] || "#5b6472");
    const hs = 14*z;
    if (img.complete && img.naturalWidth) g.drawImage(img, rp.x-hs, rp.y-hs, hs*2, hs*2);
    g.font = `${Math.max(7, 8*z)}px ui-monospace, monospace`; g.textAlign = "center";
    g.fillStyle = "rgba(232,235,239,.7)"; g.fillText("RTR-01", rp.x, rp.y+26*z);
    planHot.push({ kind:"dev", id:"RTR-01", x:rp.x, y:rp.y, r:Math.max(14, 18*z) });
    const up = C.cables["C-UPLINK"];
    if (up && up.a && up.b)
      drawPolyline(g, [P(430,166), P(430,232), P(420,232), P(420,276)], "rgba(178,188,202,.5)", 1.2);
    const w0 = P(F.wan.x0, F.wan.y), w1 = P(F.wan.tip, F.wan.y);
    const fade = g.createLinearGradient(w0.x, w0.y, w1.x, w1.y);
    fade.addColorStop(0, "rgba(154,164,178,.55)"); fade.addColorStop(1, "rgba(154,164,178,.02)");
    g.strokeStyle = fade; g.lineWidth = 1.3; g.setLineDash([6,6]);
    g.beginPath(); g.moveTo(w0.x, w0.y); g.lineTo(w1.x, w1.y); g.stroke(); g.setLineDash([]);
    g.font = `${Math.max(7, 8*z)}px ui-monospace, monospace`; g.textAlign = "left";
    g.fillStyle = "rgba(93,111,132,.6)"; g.fillText("TO ISP — BEYOND THIS OFFICE →", w0.x+8, w0.y-8);
  }

  // ---- the director's laptop: a room the network never reached ----
  {
    g.globalAlpha = chain ? .3 : 1;
    const p = P(F.laptop.x, F.laptop.y);
    g.fillStyle = "rgba(32,40,51,.5)"; g.strokeStyle = "rgba(96,104,117,.5)"; g.lineWidth = 1.1;
    g.beginPath(); g.roundRect(p.x-30*z, p.y+10*z, 60*z, 20*z, 3*z); g.fill(); g.stroke();
    const img = nodeIconImage("pc", "#5b6472", "#3a4250");
    const hs = 13*z;
    if (img.complete && img.naturalWidth) g.drawImage(img, p.x-hs, p.y-hs, hs*2, hs*2);
    g.font = `${Math.max(7, 8*z)}px ui-monospace, monospace`; g.textAlign = "center";
    g.fillStyle = "rgba(154,164,178,.6)"; g.fillText("DIRECTOR'S LAPTOP", p.x, p.y+40*z);
    g.fillStyle = "rgba(224,161,62,.55)"; g.fillText("NO DROP IN THIS ROOM", p.x, p.y+50*z);
    planHot.push({ kind:"laptop", id:"LAPTOP", x:p.x, y:p.y, r:Math.max(16, 20*z) });
  }

  // ---- where the hovered chain breaks ----
  if (chain && chain.pc) {
    const t = tracePC(chain.pc);
    if (!t.ok) {
      let fp = null;
      if (t.failAt === "cable" || t.failAt === "nic") fp = F.devices[chain.pc];
      else if (t.failAt === "outlet" && t.outlet) fp = F.outlets[t.outlet];
      else if (t.failAt === "run") { const pts = planRunPath(t.outlet); fp = pts && pts[Math.floor(pts.length/2)]; }
      else if (t.panelJack) fp = { x: F.jackX.start + (parseInt(t.panelJack.slice(3),10)-1)*F.jackX.step, y: 260 };
      if (fp) { g.globalAlpha = 1; breakMarker(g, P(fp.x, fp.y), time); }
    }
  }
  g.globalAlpha = 1;
}

export function openNetspace(c) {
  ctx = c;
  closeNetspace(false);
  previewFloor = null;   // every visit starts on the wired office floor
  physView = "floor";
  selectedFacilityFloor = null;
  facZoom = 1;
  hoveredFacilityFloor = null;
  const ov = el("netspace-overlay");
  ov.classList.remove("hidden");
  ov.innerHTML = `
    <div class="ns3d-shell">
      <canvas id="netspace-canvas"></canvas>
      <div class="ns3d-vignette"></div>
      <div id="ns-fade" class="ns3d-fade"></div>
      <div class="ns3d-head">
        <div id="ns-head-ctx"><span>NETWORK SPACE</span> / <b id="ns-head-seg">F1 — OFFICE</b></div>
        <div class="ns3d-modes">
          <button class="ns-mode" id="ns-mode-virtual">VIRTUAL</button>
          <button class="ns-mode" id="ns-mode-physical">PHYSICAL</button>
        </div>
        <div class="ns3d-live">LIVE OBSERVATION <i></i></div>
      </div>
      <div class="ns3d-crumb hidden" id="ns-crumb">
        <span id="ns-crumb-text">F1 — OFFICE</span>
        <button class="ns-mode" id="ns-view-toggle">FACILITY MAP</button>
      </div>
      <aside class="ns3d-fac hidden" id="ns-fac">
        <div class="ns-fac-head"><b>${FACILITY.title}</b><span>${FACILITY.subtitle}</span></div>
        <div id="ns-fac-list">${facilityCardsHTML()}</div>
      </aside>
      <div class="ns3d-note" id="ns-note">A VIEW, NOT THE WHOLE TRUTH · VERIFY BY PING</div>
      <div class="ns3d-readout" id="ns-readout"></div>
      <div class="ns3d-legend" id="ns-legend">${t2LegendHTML()}</div>
      <div class="ns3d-zoom" id="ns-zoom">
        <button id="ns-zoom-in" title="Zoom in">+</button>
        <button id="ns-zoom-out" title="Zoom out">−</button>
        <button id="ns-zoom-reset" title="Reset view">⟲</button>
      </div>
      <div class="ns-node-tip hidden" id="ns-tip"></div>
      <div class="ns-terminal hidden" id="ns-terminal">
        <div class="ns-terminal-bar"><span>FIELD TERMINAL</span><button id="ns-terminal-close">✕</button></div>
        <div class="ns-terminal-body" id="ns-terminal-body"></div>
      </div>
      <div class="ns3d-dock">
        <button class="dock-item" id="ns-open-terminal"><span>&gt;_</span>TERMINAL</button>
        <button class="dock-item dock-primary"><span>◇</span>NETWORK SPACE</button>
        <button class="dock-item" id="ns-back-desktop"><span>⌂</span>PC-C</button>
        <button class="dock-item" id="ns-step-away"><span>⏏</span>STEP AWAY</button>
      </div>
    </div>`;

  const canvas = ov.querySelector("#netspace-canvas");
  canvas.dataset.nsBusy = "0";
  const tip = ov.querySelector("#ns-tip");
  const readout = ov.querySelector("#ns-readout");
  const zoomBar = ov.querySelector("#ns-zoom");
  const shell = ov.querySelector(".ns3d-shell");
  const g = canvas.getContext("2d");
  const pointer = {x:0,y:0};
  let hovered = null;
  let hoveredLink = null;
  let hoveredPlan = null;
  let lastTime = performance.now();
  let lastReadout = "";

  // no packet animation on ping — the map shows states, not traffic replay
  ctx.netspaceAnimate = () => {};

  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }
  resize();
  if (!cam2 || !getSettings().nsRememberView) cam2 = fitCam(canvas.clientWidth, canvas.clientHeight);
  if (!camP || !getSettings().nsRememberView) camP = fitCamPlan(canvas.clientWidth, canvas.clientHeight);
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  function draw(time) {
    const W=canvas.clientWidth,H=canvas.clientHeight;
    const dt=Math.min(.05,Math.max(0,(time-lastTime)/1000)); lastTime=time;
    g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,canvas.width,canvas.height);
    g.save(); g.scale(devicePixelRatio,devicePixelRatio);

    const view=netspaceView();
    const byName=Object.fromEntries(view.map(v=>[v.name,v]));

    if (nsMode === "physical") {
      // the physical layer — the building sheet, or the whole building
      t2Grid(g, W, H);
      if (physView === "building") drawFacilityBuilding(g, W, H, canvas);
      else drawCablingPlan(g, W, H, time, byName, hoveredPlan);
    } else {
      // the logical layer — 2D blueprint topology
      t2Grid(g, W, H);
      t2Edges(g, byName, W, H, time, hoveredLink);
      for (const v of view) if (T2[v.name]) t2Node(g, v.name, v, W, H, time, hovered===v.name);
      if (hoveredLink != null) t2LinkChips(g, hoveredLink, W, H);
    }

    let text;
    if (nsMode === "physical") {
      if (physView === "building") {
        const sheets = FACILITY.floors.filter(f => f.sheet).length;
        text = `${FACILITY.title} — ${FACILITY.floors.length} FLOORS · ${sheets} SHEET ON FILE · SELECT A FLOOR`;
      } else if (previewFloor) {
        text = `PREVIEW — ${previewFloor.title} · SHEET ONLY · NO DEVICES LOADED`;
      } else {
        const lit = S.cabling ? Object.keys(S.cabling.panel).filter(j=>runContinuity(j)).length : 0;
        text = `PHYSICAL — ${lit}/8 PANEL LIGHTS ON · HOVER TO TRACE A RUN · CLICK TO INSPECT`;
      }
    } else {
      const observed=view.filter(v=>v.provenance==="network-observed").length;
      const verifiedCount=[S.pcbVerified,S.pcdVerified,S.pcaIpPinged].filter(Boolean).length;
      text = `OBSERVED ${observed}/5 OFFICE NODES · VERIFIED ${verifiedCount}/3 · DRAG TO PAN · SCROLL TO ZOOM · CLICK A DEVICE TO OPEN IT`;
    }
    if (text!==lastReadout) { readout.textContent=text; lastReadout=text; }

    g.restore();
    active.raf=requestAnimationFrame(draw);
  }

  function moveTip(e) {
    const r=canvas.getBoundingClientRect();
    pointer.x=(e.clientX-r.left)/r.width-.5; pointer.y=(e.clientY-r.top)/r.height-.5;
    const mx=e.clientX-r.left,my=e.clientY-r.top,W=canvas.clientWidth,H=canvas.clientHeight;
    hovered=null;
    if (nsMode === "physical") {
      const h = planHitAt(mx, my);
      hoveredPlan = h;
      if (h) {
        const html = planTipFor(h);
        if (html) {
          tip.innerHTML = html;
          tip.classList.remove("hidden");
          tip.style.left=Math.min(mx+18,W-260)+"px"; tip.style.top=Math.max(18,my-16)+"px";
        } else tip.classList.add("hidden");
        canvas.style.cursor = (h.kind==="dev"||h.kind==="outlet"||h.kind==="jack") ? "pointer" : "";
        return;
      }
      canvas.style.cursor = "";
      tip.classList.add("hidden");
      return;
    } else {
      const name = t2NodeAt(mx, my, W, H);
      if (name) {
        const v = netspaceView().find(n => n.name === name);
        hovered = name;
        hoveredLink = null;
        const st={online:"ONLINE — responding",nicdown:"NIC DISABLED — silent by configuration",vlanmis:"LINKED TO WRONG SEGMENT — VLAN mismatch",nolink:"NO CARRIER — path broken somewhere physical",off:"POWERED OFF",silent:"SILENT — not observed"}[v.state];
        tip.innerHTML=`<b>${v.name}</b> · ${v.ip||"no ip"}<br/>${st}<br/><span class="tip-tag">${v.provenance} · click to open</span>`;
        tip.classList.remove("hidden");
        tip.style.left=Math.min(mx+18,W-230)+"px"; tip.style.top=Math.max(18,my-16)+"px";
        canvas.style.cursor = "pointer";
        return;
      }
      // links: hover reveals the interface at each end
      hoveredLink = t2LinkAt(mx, my);
      if (hoveredLink != null) {
        canvas.style.cursor = "pointer";
        tip.classList.add("hidden");
        return;
      }
      canvas.style.cursor = "";
    }
    if(!hovered) tip.classList.add("hidden");
  }

  // the building: the slab under the pointer answers for itself
  function hoverBuilding(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const floor = buildingHitAt(mx, my, W, H);
    hoveredFacilityFloor = floor;
    canvas.dataset.facHover = floor ? floor.id : "";
    canvas.style.cursor = floor && floor.sheet ? "pointer" : "default";
    if (!floor) { tip.classList.add("hidden"); return; }
    tip.innerHTML = `<b>${floor.id} — ${floor.name}</b><br/>${floor.sheet ? "SHEET ON FILE" : "NO SHEET — NOT SURVEYED"}<br/><span class="tip-tag">${floor.sheet ? "click to open" : "not surveyed"}</span>`;
    tip.classList.remove("hidden");
    tip.style.left = Math.min(mx + 18, W - 260) + "px";
    tip.style.top = Math.max(18, my - 16) + "px";
  }

  // both modes: drag to pan, wheel to zoom, click to inspect
  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    drag = { x:e.clientX, y:e.clientY, moved:0 };
    canvas.setPointerCapture(e.pointerId);
    shell.classList.add("ns-panning");
  });
  canvas.addEventListener("pointermove", e => {
    if (drag) {
      if (nsMode === "physical" && physView === "building") return;   // fixed projection
      const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
      drag.moved += Math.abs(dx)+Math.abs(dy);
      const c = acam();
      c.x -= dx/c.z; c.y -= dy/c.z;
      drag.x=e.clientX; drag.y=e.clientY;
      hovered=null; hoveredLink=null; hoveredPlan=null; tip.classList.add("hidden");
      return;
    }
    if (nsMode === "physical" && physView === "building") return hoverBuilding(e);
    moveTip(e);
  });
  canvas.addEventListener("pointerup", e => {
    if (!drag) return;
    shell.classList.remove("ns-panning");
    if (drag.moved < 6) {
      const r=canvas.getBoundingClientRect();
      const mx=e.clientX-r.left, my=e.clientY-r.top;
      if (nsMode === "physical" && physView === "building") {
        const floor = hoveredFacilityFloor;
        if (floor && floor.sheet) switchView(() => showFacilityFloor(floor));   // same path as the cards
      } else if (nsMode === "virtual") {
        const name = t2NodeAt(mx, my, canvas.clientWidth, canvas.clientHeight);
        if (name) { tip.classList.add("hidden"); openDevice(name, { from:"netspace", view:"virtual" }); }
      } else {
        const h = planHitAt(mx, my);
        if (h) {
          tip.classList.add("hidden");
          if (h.kind === "dev") openDevice(h.id, { from:"netspace", view:"physical" });
          else if (h.kind === "outlet") openOutlet(h.id);
          else if (h.kind === "jack") openPatchPanel(h.id);
        }
      }
    }
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => { drag=null; shell.classList.remove("ns-panning"); });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (nsMode === "physical" && physView === "building") {
      setFacZoom(facZoom * (e.deltaY < 0 ? 1.15 : 1/1.15));
      return;
    }
    const r=canvas.getBoundingClientRect();
    zoomAt(e.clientX-r.left, e.clientY-r.top, e.deltaY < 0 ? 1.15 : 1/1.15, canvas.clientWidth, canvas.clientHeight);
  }, { passive:false });
  canvas.addEventListener("mouseleave",()=>{
    hovered=null;hoveredPlan=null;tip.classList.add("hidden");
    hoveredFacilityFloor=null; canvas.dataset.facHover=""; canvas.style.cursor="";
  });

  const inBuilding = () => nsMode === "physical" && physView === "building";
  function setFacZoom(z) {
    facZoom = Math.max(0.6, Math.min(2.2, z));
    canvas.dataset.faczoom = facZoom.toFixed(2);
  }
  ov.querySelector("#ns-zoom-in").onclick = () => {
    if (inBuilding()) return setFacZoom(facZoom * 1.2);
    zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, 1.3, canvas.clientWidth, canvas.clientHeight);
  };
  ov.querySelector("#ns-zoom-out").onclick = () => {
    if (inBuilding()) return setFacZoom(facZoom / 1.2);
    zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, 1/1.3, canvas.clientWidth, canvas.clientHeight);
  };
  ov.querySelector("#ns-zoom-reset").onclick = () => {
    if (inBuilding()) return setFacZoom(1);
    const W=canvas.clientWidth, H=canvas.clientHeight;
    Object.assign(acam(), nsMode === "physical" ? fitCamPlan(W,H) : fitCam(W,H));
  };

  const terminalPanel=ov.querySelector("#ns-terminal");
  const terminalBody=ov.querySelector("#ns-terminal-body");
  let terminalOpen=false;
  function setTerminal(open) {
    terminalOpen=open;
    terminalPanel.classList.toggle("hidden",!open);
    if(open && !terminalBody.dataset.ready) { terminalBody.dataset.ready="1"; openTerminal(terminalBody,ctx); }
  }
  const note = ov.querySelector("#ns-note");
  const legend = ov.querySelector("#ns-legend");
  const crumb = ov.querySelector("#ns-crumb"), crumbText = ov.querySelector("#ns-crumb-text");
  const headSeg = ov.querySelector("#ns-head-seg");
  const facPanel = ov.querySelector("#ns-fac"), facList = ov.querySelector("#ns-fac-list");
  const viewToggle = ov.querySelector("#ns-view-toggle");
  const fadeEl = ov.querySelector("#ns-fade");
  const mVirtual = ov.querySelector("#ns-mode-virtual"), mPhysical = ov.querySelector("#ns-mode-physical");

  function renderChrome() {
    const building = physView === "building";
    const ctx = building ? `${FACILITY.title} · FACILITY MAP`
                         : previewFloor ? sheetLabel(previewFloor) : "F1 — OFFICE";
    crumbText.textContent = ctx;
    headSeg.textContent = nsMode === "physical" ? ctx : "OFFICE SEGMENT";
    viewToggle.textContent = building ? "BACK" : "FACILITY MAP";
    crumb.classList.toggle("hidden", nsMode !== "physical");
    facPanel.classList.toggle("hidden", !(nsMode === "physical" && building));
    zoomBar.style.display = "flex";
    for (const card of facList.querySelectorAll(".fac-card"))
      card.classList.toggle("active", card.dataset.floor === selectedFacilityFloor);
  }
  const clearHover = () => {
    hovered = null; hoveredPlan = null; tip.classList.add("hidden"); planHot = [];
    hoveredFacilityFloor = null; canvas.dataset.facHover = ""; canvas.style.cursor = "";
  };
  function showBuilding() { physView = "building"; setFacZoom(1); clearHover(); renderChrome(); }
  function showOffice() {
    physView = "floor"; previewFloor = null; selectedFacilityFloor = null;
    clearHover();
    Object.assign(camP, fitCamPlan(canvas.clientWidth, canvas.clientHeight));
    renderChrome();
  }
  function showFacilityFloor(floor) {
    physView = "floor"; previewFloor = floor.sheet; selectedFacilityFloor = floor.id;
    clearHover();
    Object.assign(camP, fitCamPlan(canvas.clientWidth, canvas.clientHeight));
    renderChrome();
  }
  // one veil owns every swap: out to black, swap while dark, then settle back
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let transitionBusy = false;
  function switchView(swap) {
    if (transitionBusy) return;                       // navigation is locked while the veil moves
    canvas.dataset.nsBusy = "1";
    if (reducedMotion) { swap(); canvas.dataset.nsBusy = "0"; return; }
    transitionBusy = true;

    let swapped = false, timer = 0;
    const doneOut = () => {                           // after this the veil is fully opaque
      if (swapped) return;
      swapped = true;
      clearTimeout(timer);
      fadeEl.removeEventListener("transitionend", onOut);
      fadeEl.classList.remove("ns-in");
      swap();                                         // crumb, header and readout change in the dark
      requestAnimationFrame(() => {
        let settled = false;
        const doneIn = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fadeEl.removeEventListener("transitionend", onIn);
          transitionBusy = false;
          canvas.dataset.nsBusy = "0";
        };
        const onIn = e => { if (e.target === fadeEl && e.propertyName === "opacity") doneIn(); };
        fadeEl.addEventListener("transitionend", onIn);
        timer = setTimeout(doneIn, 280);              // in 240ms + fallback
        fadeEl.classList.add("ns-in");
        void fadeEl.offsetWidth;                      // commit the settle easing
        fadeEl.style.opacity = "0";
      });
    };
    const onOut = e => { if (e.target === fadeEl && e.propertyName === "opacity") doneOut(); };
    fadeEl.addEventListener("transitionend", onOut);
    timer = setTimeout(doneOut, 200);                 // out 160ms + fallback
    fadeEl.classList.remove("ns-in");
    void fadeEl.offsetWidth;                          // commit the out easing
    fadeEl.style.opacity = "1";
  }
  viewToggle.onclick = () => switchView(() => (physView === "building" ? showOffice() : showBuilding()));
  facList.addEventListener("click", e => {
    const card = e.target.closest(".fac-card");
    const floor = card && FACILITY.floors.find(f => f.id === card.dataset.floor);
    if (!floor || !floor.sheet) return;   // no sheet, no journey
    switchView(() => showFacilityFloor(floor));
  });
  function setMode(m) {
    nsMode = m;
    hoveredLink = null;
    hoveredPlan = null;
    mVirtual.classList.toggle("on", m === "virtual");
    mPhysical.classList.toggle("on", m === "physical");
    legend.classList.toggle("hidden", m !== "virtual");
    canvas.classList.add("ns-can-pan");
    note.textContent = m === "physical"
      ? "PHYSICAL MODE — THE PHYSICAL PLANT · DASHED = IN THE WALLS · HOVER TO TRACE A RUN"
      : "A VIEW, NOT THE WHOLE TRUTH · VERIFY BY PING";
    renderChrome();
  }
  mVirtual.onclick = () => setMode("virtual");
  mPhysical.onclick = () => setMode("physical");
  setFacZoom(1);
  setMode(nsMode);

  ov.querySelector("#ns-open-terminal").onclick=()=>setTerminal(terminalPanel.classList.contains("hidden"));
  ov.querySelector("#ns-terminal-close").onclick=()=>setTerminal(false);
  ov.querySelector("#ns-back-desktop").onclick=()=>closeNetspace();
  ov.querySelector("#ns-step-away").onclick=()=>{ closeNetspace(); ctx.closeDesktop({ reopen:false }); };

  active={raf:requestAnimationFrame(draw),ro,canvas};
}

export function closeNetspace(resetHook=true) {
  const ov=el("netspace-overlay");
  if (active) {
    cancelAnimationFrame(active.raf); active.ro.disconnect(); active=null;
  }
  if (ctx && resetHook) ctx.netspaceAnimate=null;
  if (ov) { ov.classList.add("hidden"); ov.innerHTML=""; }
}
