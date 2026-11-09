// ============================================================
// ECHO//LINK — device close-ups + the physical cabling system.
// Ports and cable segments, not animations: every connection is
// a real end seated in a real port, and every path can break.
// Cable tool: click a plug to pick the end up, click a free port
// to seat it. Amber = in hand / unverified. Green = verified.
// ============================================================
import { S, save } from "./state.js";
import { sfx } from "./audio.js";
import { cableAt, runContinuity, tracePC, traceSRV, pcCableConnected, linkUp, switchUp, switchInterfaces, routerInterfaces } from "./net.js";
import { openCli } from "./cli.js";

let ctx = null; // { changed(), story, toast(), openDesktop(), closeDesktop() }

export function initDevice(c) { ctx = c; }

const el = id => document.getElementById(id);

// ---------- cable tool: the end currently in hand ----------
let hand = null;                    // { cableId, end: "a" | "b" }
let currentView = null;             // { kind:"device"|"panel"|"outlet", name, selected }
let currentOrigin = null;           // "netspace-traffic" when opened from the topology map
const selectedPorts = {};

export function cableInHand() { return hand; }

function cable(id) { return S.cabling.cables[id]; }
function pcCableId(name) { return "C-PC" + name.slice(-1); }
function prettyCable(id) {
  const c = cable(id);
  if (c.kind === "long") return "ETHERNET CABLE";
  if (id.startsWith("C-SPARE")) return "SPARE PATCH LEAD";
  return "PATCH LEAD";
}
function endName(id, end) {
  if (id.startsWith("C-PC"))     return end === "a" ? "PC END" : "OUTLET END";
  if (id.startsWith("C-SRV"))    return end === "a" ? "SERVER END" : "SWITCH END";
  if (id === "C-UPLINK")         return end === "a" ? "ROUTER END" : "SWITCH END";
  if (id.startsWith("C-PATCH"))  return end === "a" ? "PANEL END" : "SWITCH END";
  return end === "a" ? "END A" : "END B";
}
function prettyPort(addr) {
  if (!addr) return "—";
  const [owner, port] = addr.split(":");
  if (owner.startsWith("PC-") || owner.startsWith("SRV-")) return `${owner} · NIC`;
  if (owner.startsWith("OF-")) return `${owner} · WALL SOCKET`;
  if (owner.startsWith("PP-")) return `${owner} · PANEL JACK`;
  if (owner === "CSW-01")      return `CSW-01 · ${port.toUpperCase()}`;
  if (owner === "RTR-01")      return `RTR-01 · ${port.toUpperCase()}`;
  return addr;
}
// short caption form for plug labels: "CSW-01:p04" → "SW-04"
function shortPort(addr) {
  if (!addr) return "—";
  const [owner, port] = addr.split(":");
  if (owner === "CSW-01") return "SW-" + port.slice(1);
  if (owner === "RTR-01") return "RTR-" + port.toUpperCase();
  return owner;
}

// a loose end rests where its cable's other end is; fully loose cables
// rest at home — the desk for long cables, the rack tray for patch leads.
function looseEndView(cableId, end) {
  const c = cable(cableId);
  // a long desk cable always rests at its own desk, whichever end is loose
  if (cableId.startsWith("C-PC")) return "device:PC-" + cableId.slice(-1);
  const other = c[end === "a" ? "b" : "a"];
  if (!other) return "panel";
  const owner = other.split(":")[0];
  if (owner.startsWith("PP-")) return "panel";
  if (owner.startsWith("OF-")) return "outlet:" + owner;
  return "device:" + owner;
}
// loose ends a view should render
function looseEndsFor(viewKey) {
  const out = [];
  for (const [id, c] of Object.entries(S.cabling.cables)) {
    for (const end of ["a", "b"]) {
      if (c[end]) continue;
      if (end === "b" && !c.a) continue;   // fully loose cable renders once, as end "a"
      if (hand && hand.cableId === id && hand.end === end) continue; // in hand, not resting
      if (looseEndView(id, end) === viewKey) out.push({ id, end });
    }
  }
  return out;
}

function syncHandChip() {
  let chip = el("hand-chip");
  if (!hand) { if (chip) chip.remove(); }
  else {
    if (!chip) {
      chip = document.createElement("div");
      chip.id = "hand-chip";
      el("game-screen").appendChild(chip);
    }
    chip.innerHTML = `<span class="hc-dot"></span><span>IN HAND — ${prettyCable(hand.cableId)} · ${endName(hand.cableId, hand.end)}</span><span class="hc-hint">click a glowing port to plug in · Esc to drop</span><button id="hc-drop">DROP</button>`;
    el("hc-drop").onclick = () => { dropHand(); };
  }
  syncGhost();
}

// the held cable end follows the cursor — you can always see what you carry
let ghostEl = null;
function syncGhost() {
  if (hand && !ghostEl) {
    ghostEl = document.createElement("div");
    ghostEl.id = "hand-ghost";
    document.body.appendChild(ghostEl);
  }
  if (!hand && ghostEl) { ghostEl.remove(); ghostEl = null; }
  if (ghostEl) ghostEl.innerHTML = `<span class="hg-plug"></span><span>${prettyCable(hand.cableId)} · ${endName(hand.cableId, hand.end)}</span>`;
}
document.addEventListener("mousemove", e => {
  if (!ghostEl) return;
  ghostEl.style.left = (e.clientX + 16) + "px";
  ghostEl.style.top = (e.clientY + 22) + "px";
});

function rerender() {
  syncHandChip();
  if (!currentView) return;
  if (currentView.kind === "panel") openPatchPanel(currentView.selected);
  else if (currentView.kind === "outlet") openOutlet(currentView.name);
  else openDevice(currentView.name, currentView.selected);
}

function pickUp(cableId, end) {
  const c = cable(cableId);
  if (hand && hand.cableId === cableId && hand.end === end) { dropHand(); return; }
  if (c[end] === undefined) return;
  c[end] = null;
  hand = { cableId, end };
  sfx.click();
  save(); ctx.changed("cable");
  rerender();
}

function placeAt(addr) {
  if (!hand) return false;
  if (cableAt(addr)) { ctx.toast("That port is occupied.", "amber"); sfx.error(); return false; }
  const id = hand.cableId, end = hand.end;
  const c = cable(id);
  c[end] = addr;
  if (id === "C-PCD" && end === "a" && addr === "PC-D:nic") {
    S.pcdFixed = true;
    ctx.toast("Cable connected. That alone doesn't mean the link works — verify it.", "amber");
  } else {
    sfx.fix();
  }
  const other = end === "a" ? "b" : "a";
  hand = c[other] ? null : { cableId: id, end: other };  // both ends seated → hand free
  save(); ctx.changed("cable");
  rerender();
  return true;
}

export function dropHand() {
  if (!hand) return;
  hand = null;
  sfx.click();
  save();
  rerender();
}

// click semantics shared by every port-bearing view:
// a plug picks its end up; a free port seats the end in hand.
function wireCabling(ov) {
  ov.querySelectorAll("[data-plug]").forEach(n => {
    n.addEventListener("click", e => {
      e.stopPropagation();
      const [id, end] = n.dataset.plug.split("|");
      pickUp(id, end);
    });
  });
  ov.querySelectorAll("[data-port]").forEach(n => {
    n.addEventListener("click", e => {
      if (hand) {
        e.stopPropagation();
        placeAt(n.dataset.port);
        return;
      }
      // NIC ports and wall sockets: clicking a seated connector picks it up
      const conn = cableAt(n.dataset.port);
      if (conn && n.classList.contains("nic-port")) {
        e.stopPropagation();
        pickUp(conn.id, conn.end);
      }
    });
  });
}
// a port node accepts the end in hand only when it is free
function portClass(addr) {
  if (hand && !cableAt(addr)) return " port-awaiting";
  return "";
}

// plug node: the physical connector, grabbable
function plugNode(cableId, end, x, y, label) {
  return `<g class="plug-node" data-plug="${cableId}|${end}" tabindex="0" role="button" aria-label="Pick up ${prettyCable(cableId)} ${endName(cableId, end)}">
    <circle cx="${x}" cy="${y}" r="22" fill="transparent"/>
    <rect x="${x-11}" y="${y-8}" width="22" height="16" rx="2" fill="#1a1f27" stroke="#9aa4b2" stroke-width="1.4"/>
    <line x1="${x-6}" y1="${y-8}" x2="${x-6}" y2="${y+8}" stroke="#9aa4b2" stroke-width=".8" opacity=".6"/>
    <line x1="${x}" y1="${y-8}" x2="${x}" y2="${y+8}" stroke="#9aa4b2" stroke-width=".8" opacity=".6"/>
    ${label ? `<text x="${x}" y="${y+30}" text-anchor="middle" font-size="9" fill="#9aa4b2">${label}</text>` : ""}
  </g>`;
}
function loosePlugNode(cableId, end, x, y, label) {
  return `<g class="plug-node loose" data-plug="${cableId}|${end}" tabindex="0" role="button" aria-label="Pick up loose ${prettyCable(cableId)}">
    <circle cx="${x}" cy="${y}" r="25" fill="transparent"/>
    <circle cx="${x}" cy="${y}" r="16" fill="#12151b" stroke="#9aa4b2" stroke-width="1.5"/>
    <rect x="${x-9}" y="${y-7}" width="18" height="14" rx="2" fill="#1a1f27" stroke="#9aa4b2"/>
    <text x="${x}" y="${y+36}" text-anchor="middle" font-size="10" fill="#9aa4b2">${label}</text>
  </g>`;
}

// tray glyph: an RJ45-style connector with its cable — looped for a spare lead, stub for a dangling end
function trayLeadNode(cableId, end, x, y, label) {
  const spare = !cable(cableId).a && !cable(cableId).b;
  const ribs = Array.from({length: 6}, (_,i) =>
    `<line x1="${x-7.5+i*3}" y1="${y-20}" x2="${x-7.5+i*3}" y2="${y-10}" stroke="#9aa4b2" stroke-width="1" opacity=".7"/>`).join("");
  const cablePath = spare
    // spare lead: the cable curls out of the plug and loops back beside it
    ? `<path d="M ${x} ${y+8} C ${x} ${y+16} ${x-20} ${y+18} ${x-23} ${y+27} C ${x-26} ${y+36} ${x-10} ${y+40} ${x-6} ${y+33}" fill="none" stroke="#9aa4b2" stroke-width="2.2" opacity=".85"/>
       <path d="M ${x} ${y+8} C ${x} ${y+15} ${x+14} ${y+17} ${x+16} ${y+25}" fill="none" stroke="#9aa4b2" stroke-width="2.2" opacity=".85"/>`
    // dangling end: a short tail hangs from the plug
    : `<path d="M ${x} ${y+8} C ${x} ${y+17} ${x-8} ${y+21} ${x-8} ${y+30}" fill="none" stroke="#9aa4b2" stroke-width="2.2" opacity=".85"/>`;
  return `<g class="plug-node tray-lead" data-plug="${cableId}|${end}" tabindex="0" role="button" aria-label="Pick up ${prettyCable(cableId)} ${endName(cableId, end)}">
    <circle cx="${x}" cy="${y}" r="30" fill="transparent"/>
    ${cablePath}
    <rect x="${x-12}" y="${y-24}" width="24" height="32" rx="4" fill="#1a1f27" stroke="#9aa4b2" stroke-width="1.5"/>
    <rect x="${x-6}" y="${y-30}" width="12" height="7" rx="1.5" fill="#1a1f27" stroke="#9aa4b2" stroke-width="1"/>
    ${ribs}
    <line x1="${x-12}" y1="${y-8}" x2="${x+12}" y2="${y-8}" stroke="#9aa4b2" stroke-width=".8" opacity=".5"/>
    <text x="${x}" y="${y+50}" text-anchor="middle" font-size="10" fill="#9aa4b2">${label}</text>
  </g>`;
}

function visualDefs() {
  return `<defs>
    <linearGradient id="dvScreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#25303d"/><stop offset="1" stop-color="#111821"/>
    </linearGradient>
    <linearGradient id="dvDesk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171c24"/><stop offset="1" stop-color="#0b0e12"/>
    </linearGradient>
    <filter id="dvGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

// ---------------- PC workstation ----------------
function pcVisual(name) {
  const d = S.devices[name];
  const cid = pcCableId(name), c = cable(cid);
  const seatedA = c.a === name + ":nic";
  const seatedB = !!c.b;
  const path = tracePC(name);
  const link = path.ok && switchUp() && d.power && d.nic;
  const scr = d.power ? "url(#dvScreen)" : "#0b0e12";
  const screenMark = !d.power ? "NO SIGNAL" : name === "PC-C" ? "ASTER / DESKTOP" : "ASTER / SESSION IDLE";

  // resting cable ends at this desk
  const looseA = looseEndsFor("device:" + name).filter(l => l.id === cid);
  const looseNodes = looseA.map((l, i) => {
    const x = 160 + i * 150, y = 393;
    const label = l.end === "a" ? "LOOSE CABLE — PC END" : "LOOSE CABLE — OUTLET END";
    return loosePlugNode(l.id, l.end, x, y, label);
  }).join("");

  return `<svg viewBox="0 0 520 460" role="img" aria-label="${name} workstation close-up">
    ${visualDefs()}
    <rect x="10" y="10" width="500" height="440" rx="8" fill="#0b0e13"/>
    <path d="M 20 350 L 500 350 L 460 438 L 60 438 Z" fill="url(#dvDesk)" stroke="#262c36"/>
    <line x1="45" y1="372" x2="475" y2="372" stroke="#1a1f27"/>

    <!-- monitor, bezel, screen remnants -->
    <rect x="38" y="54" width="292" height="194" rx="9" fill="#080b0f" stroke="#3a4250" stroke-width="1.5"/>
    <rect x="49" y="65" width="270" height="164" rx="4" fill="${scr}" stroke="#202833" class="${d.power?"monitor-on":""}"/>
    ${d.power ? `<g opacity=".48">
      <rect x="64" y="82" width="92" height="4" fill="#6b7484"/>
      <rect x="64" y="96" width="220" height="2" fill="#3a4250"/>
      <rect x="64" y="106" width="180" height="2" fill="#3a4250"/>
      <rect x="64" y="116" width="202" height="2" fill="#3a4250"/>
      <rect x="64" y="183" width="238" height="24" rx="2" fill="#111821" stroke="#3a4250"/>
      <text x="76" y="199" font-size="9" fill="#9aa4b2">${name} · LOCAL SESSION</text>
    </g>` : ""}
    <text x="184" y="150" text-anchor="middle" font-size="11" fill="${d.power?"#7a8392":"#262c36"}">${screenMark}</text>
    <circle cx="307" cy="238" r="2.4" class="${d.power?"led led-on":"led"}"/>
    <path d="M 166 248 L 202 248 L 208 310 L 160 310 Z" fill="#0e1218" stroke="#2c3440"/>
    <rect x="122" y="309" width="124" height="12" rx="3" fill="#12171e" stroke="#3a4250"/>
    <rect x="88" y="329" width="202" height="19" rx="3" fill="#10141a" stroke="#262c36"/>
    ${Array.from({length:12},(_,i)=>`<line x1="${100+i*15}" y1="334" x2="${100+i*15}" y2="343" stroke="#262c36"/>`).join("")}
    <ellipse cx="310" cy="338" rx="12" ry="9" fill="#10141a" stroke="#3a4250"/>

    <!-- tower: vents, power and NIC -->
    <rect x="366" y="86" width="112" height="264" rx="7" fill="#0b0e12" stroke="#3a4250" stroke-width="1.5"/>
    <rect x="376" y="98" width="92" height="42" rx="3" fill="#10141a" stroke="#202833"/>
    <text x="422" y="123" text-anchor="middle" font-size="12" fill="#7a8392">${name}</text>
    <circle cx="394" cy="163" r="7" fill="#10141a" stroke="#3a4250"/>
    <circle cx="394" cy="163" r="2.6" class="${d.power?"led led-on":"led"}" ${d.power?'filter="url(#dvGlow)"':""}/>
    ${Array.from({length:7},(_,i)=>`<rect x="414" y="${153+i*8}" width="40" height="2" fill="#232a35"/>`).join("")}
    <rect x="380" y="222" width="84" height="1" fill="#262c36"/>
    <text x="386" y="246" font-size="8" fill="#5b6472">NETWORK</text>
    <rect id="nic-port" data-port="${name}:nic" class="nic-port${portClass(name+":nic")}" x="386" y="254" width="58" height="34" rx="3" fill="#07090c" stroke="${link?"#79c98d":seatedA?"#7a8392":"#5b6472"}" stroke-width="1.5"/>
    <rect x="394" y="261" width="42" height="18" fill="#11161d" stroke="#262c36" style="pointer-events:none"/>
    <text x="415" y="301" text-anchor="middle" font-size="9" fill="#5b6472">ETH</text>
    <circle cx="454" cy="261" r="2.4" class="${link?"led led-on":"led"}"/>
    <circle cx="454" cy="274" r="2.4" class="${seatedA&&seatedB?"led led-on":"led"}" style="animation-delay:.7s"/>

    <!-- cable path / resting ends -->
    ${seatedA
      ? `<path d="M 415 288 C 415 350 342 372 278 406 S 164 420 92 408" stroke="${link?"#79c98d":"#6b7484"}" stroke-width="3" fill="none" opacity=".82" ${seatedB?"":'stroke-dasharray="6 5"'}/>
         <path d="M 415 288 C 415 350 342 372 278 406" stroke="#e8ebef" stroke-width=".7" fill="none" opacity=".2"/>
         <text x="168" y="431" text-anchor="middle" font-size="9" fill="#5b6472">${seatedB ? "ETHERNET · WALL OUTLET " + c.b.split(":")[0] : "ETHERNET · WALL END NOT IN AN OUTLET"}</text>`
      : `<path d="M 415 288 C 415 310 406 320 394 329" stroke="#3a4250" stroke-width="2" fill="none" stroke-dasharray="4 5"/>`}
    ${looseNodes}
    ${seatedA && c.b ? plugNode(cid, "b", 92, 408, "") : ""}
  </svg>`;
}

// ---------------- server (rack unit with a real NIC) ----------------
function rackVisual(name) {
  const d = S.devices[name];
  const cid = name === "SRV-01" ? "C-SRV1" : "C-SRV2";
  const c = cable(cid);
  const seatedA = c.a === name + ":nic";
  const t = traceSRV(name);
  const link = t.ok && switchUp() && d.power;
  const leds = Array.from({length:10}, (_,i)=>`<circle cx="${116+i*24}" cy="172" r="3.4" class="${d.power && i%3!==2 ? "led led-on":"led"}" style="animation-delay:${i*.27}s"/>`).join("");
  const loose = looseEndsFor("device:"+name).map((l,i) =>
    loosePlugNode(l.id, l.end, 116+i*130, 396, "LOOSE — " + endName(l.id, l.end))).join("");
  return `<svg viewBox="0 0 520 460" role="img" aria-label="${name} rack unit close-up">
    ${visualDefs()}
    <rect x="10" y="10" width="500" height="440" rx="8" fill="#0b0e13"/>
    <rect x="62" y="38" width="396" height="382" rx="6" fill="#080a0d" stroke="#262c36"/>
    ${Array.from({length:13},(_,i)=>`<line x1="72" y1="${58+i*27}" x2="448" y2="${58+i*27}" stroke="#141922"/>`).join("")}
    <rect x="86" y="94" width="348" height="220" rx="5" fill="#0e1116" stroke="#3a4250" stroke-width="1.5"/>
    <rect x="98" y="108" width="324" height="38" rx="2" fill="#10141a" stroke="#202833"/>
    <text x="116" y="133" font-size="16" fill="${d.power?"#9aa4b2":"#3d434e"}" letter-spacing="5">${name}</text>
    <circle cx="398" cy="127" r="5" class="${d.power?"led led-on":"led"}" ${d.power?'filter="url(#dvGlow)"':""}/>
    ${leds}
    ${Array.from({length:6},(_,i)=>`<rect x="108" y="${202+i*13}" width="202" height="4" fill="#1a1f27"/>`).join("")}
    ${Array.from({length:4},(_,i)=>`<rect x="${330+i*18}" y="202" width="10" height="58" rx="2" fill="#0a0d11" stroke="#262c36"/>`).join("")}
    <rect x="104" y="282" width="312" height="14" fill="#090c10" stroke="#202833"/>
    <!-- NIC: a real port on the backplane -->
    <text x="330" y="340" font-size="8" fill="#5b6472">NIC</text>
    <rect data-port="${name}:nic" class="nic-port${portClass(name+":nic")}" x="356" y="326" width="52" height="30" rx="3" fill="#07090c" stroke="${link?"#79c98d":seatedA?"#7a8392":"#5b6472"}" stroke-width="1.5"/>
    <circle cx="420" cy="334" r="2.4" class="${link?"led led-on":"led"}"/>
    <circle cx="420" cy="347" r="2.4" class="${seatedA?"led led-on":"led"}" style="animation-delay:.6s"/>
    ${seatedA ? `<path d="M 408 341 C 440 345 446 380 430 396" stroke="${link?"#79c98d":"#6b7484"}" stroke-width="2.5" fill="none" opacity=".8"/>${plugNode(cid,"a",430,396,"")}` : ""}
    <text x="260" y="357" text-anchor="middle" font-size="11" fill="#5b6472">${d.power ? "RUNNING · FAN ARRAY ACTIVE" : "DARK · NO FAN MOVEMENT"}</text>
    ${loose}
  </svg>`;
}

// ---------------- switch / router interface truth ----------------
// switchInterfaces() / routerInterfaces() live in net.js so the close-up
// inspector and the device CLIs share one live source of truth.
function interfacesFor(name) { return name === "CSW-01" ? switchInterfaces() : name === "RTR-01" ? routerInterfaces() : []; }

// ---------------- switch front panel ----------------
function switchVisual(name, selected) {
  const d=S.devices[name], ifs=switchInterfaces();
  const ports=ifs.map((p,i)=>{
    const rowY=i<12?168:252, colX=66+(i%12)*33;
    const sel=p.id===selected;
    const addr="CSW-01:"+p.pid;
    const conn=cableAt(addr);
    return `<g class="switch-port port-${p.state} ${sel?"port-selected":""}${portClass(addr)}" data-port="${addr}" data-port-id="${p.id}" tabindex="0" role="button" aria-label="Inspect switch port ${p.label}">
      <rect x="${colX}" y="${rowY}" width="26" height="36" rx="2"/>
      <rect x="${colX+5}" y="${rowY+9}" width="16" height="14" rx="1"/>
      <circle cx="${colX+13}" cy="${rowY-12}" r="2.3"/>
      <text x="${colX+13}" y="${rowY+51}" text-anchor="middle" font-size="8">${p.label}</text>
    </g>
    ${conn ? plugNode(conn.id, conn.end, colX+13, rowY+66, "") : ""}`;
  }).join("");
  const loose = looseEndsFor("device:"+name).map((l,i) =>
    loosePlugNode(l.id, l.end, 100+i*120, 418, "LOOSE — " + endName(l.id, l.end))).join("");
  return `<svg viewBox="0 0 520 460" role="img" aria-label="${name} switch front panel">
    ${visualDefs()}
    <rect x="10" y="10" width="500" height="440" rx="8" fill="#0b0e13"/>
    <!-- rack ears and chassis -->
    <rect x="22" y="112" width="22" height="92" rx="2" fill="#090c10" stroke="#262c36"/>
    <rect x="476" y="112" width="22" height="92" rx="2" fill="#090c10" stroke="#262c36"/>
    <circle cx="33" cy="128" r="3" fill="#171c24"/><circle cx="33" cy="188" r="3" fill="#171c24"/>
    <circle cx="487" cy="128" r="3" fill="#171c24"/><circle cx="487" cy="188" r="3" fill="#171c24"/>
    <rect x="34" y="74" width="452" height="300" rx="8" fill="#0d1015" stroke="#3a4250" stroke-width="1.5"/>
    <rect x="48" y="90" width="424" height="52" rx="4" fill="#10141a" stroke="#202833"/>
    <text x="66" y="113" font-size="14" fill="${d.power?"#9aa4b2":"#3d434e"}" letter-spacing="4">${name}</text>
    <text x="456" y="113" text-anchor="end" font-size="9" fill="#5b6472">24-PORT MANAGED SWITCH</text>
    ${Array.from({length:12},(_,i)=>`<rect x="${68+i*17}" y="126" width="10" height="2" fill="#202833"/>`).join("")}
    <circle cx="66" cy="154" r="4.2" class="${d.power?"led led-on":"led"}"/>
    <text x="80" y="158" font-size="8" fill="#5b6472">PWR</text>
    <text x="390" y="132" text-anchor="end" font-size="8" fill="#3d434e">LINK / ACT</text>
    ${ports}
    <rect x="58" y="350" width="404" height="1" fill="#262c36"/>
    <circle cx="72" cy="368" r="3" fill="#79c98d" opacity=".75"/><text x="82" y="372" font-size="8" fill="#5b6472">LINK</text>
    <circle cx="132" cy="368" r="3" fill="#e0a13e" opacity=".8"/><text x="142" y="372" font-size="8" fill="#5b6472">ATTENTION</text>
    <circle cx="222" cy="368" r="3" fill="#232833"/><text x="232" y="372" font-size="8" fill="#5b6472">EMPTY</text>
    <text x="260" y="404" text-anchor="middle" font-size="11" fill="#5b6472">${d.power?"FORWARDING PLANE ACTIVE":"SWITCH DARK — POWER REQUIRED"}</text>
    ${loose}
    <text x="260" y="446" text-anchor="middle" font-size="9" fill="#3d434e">RACK B · OFFICE DISTRIBUTION · P09–P10 SERVER VLAN</text>
  </svg>`;
}

// ---------------- router front panel ----------------
function routerVisual(name, selected) {
  const d=S.devices[name], ifs=routerInterfaces();
  const ports=ifs.map((p,i)=>{
    const x=i===0?100:182+(i-1)*57, y=204, w=50;
    const sel=p.id===selected;
    const conn = p.port ? cableAt(p.port) : null;
    const interactive = p.port ? `data-port="${p.port}"${portClass(p.port)}` : "";
    return `<g class="switch-port router-port port-${p.state} ${sel?"port-selected":""}" ${interactive} data-port-id="${p.id}" tabindex="0" role="button" aria-label="Inspect router interface ${p.label}">
      <rect x="${x}" y="${y}" width="${w}" height="46" rx="3"/>
      <rect x="${x+9}" y="${y+11}" width="${w-18}" height="20" rx="1"/>
      <circle cx="${x+w/2}" cy="${y-13}" r="2.5"/>
      <text x="${x+w/2}" y="${y+65}" text-anchor="middle" font-size="8">${p.label}</text>
    </g>
    ${conn ? plugNode(conn.id, conn.end, x+w/2, y+84, "") : ""}`;
  }).join("");
  const loose = looseEndsFor("device:"+name).map((l,i) =>
    loosePlugNode(l.id, l.end, 150+i*130, 396, "LOOSE — " + endName(l.id, l.end))).join("");
  return `<svg viewBox="0 0 520 460" role="img" aria-label="${name} router front panel">
    ${visualDefs()}
    <rect x="10" y="10" width="500" height="440" rx="8" fill="#0b0e13"/>
    <!-- antennas -->
    <path d="M 132 126 L 92 54" stroke="#262c36" stroke-width="8" stroke-linecap="round"/>
    <path d="M 388 126 L 428 54" stroke="#262c36" stroke-width="8" stroke-linecap="round"/>
    <circle cx="92" cy="54" r="6" fill="#10141a" stroke="#3a4250"/>
    <circle cx="428" cy="54" r="6" fill="#10141a" stroke="#3a4250"/>
    <!-- low edge-router body -->
    <path d="M 70 122 L 450 122 L 492 330 L 28 330 Z" fill="#0d1015" stroke="#3a4250" stroke-width="1.5"/>
    <path d="M 86 140 L 434 140 L 464 306 L 56 306 Z" fill="#10141a" stroke="#202833"/>
    <text x="96" y="114" font-size="15" fill="${d.power?"#9aa4b2":"#3d434e"}" letter-spacing="4">${name}</text>
    <text x="424" y="114" text-anchor="end" font-size="9" fill="#5b6472">EDGE ROUTER · DHCP / DNS</text>
    <circle cx="98" cy="168" r="4.2" class="${d.power?"led led-on":"led"}"/>
    <text x="112" y="172" font-size="8" fill="#5b6472">PWR</text>
    <text x="338" y="172" font-size="8" fill="#5b6472">WAN · LAN · MGMT</text>
    ${Array.from({length:8},(_,i)=>`<rect x="${180+i*26}" y="160" width="15" height="2" fill="#202833"/>`).join("")}
    ${ports}
    <text x="260" y="356" text-anchor="middle" font-size="11" fill="#5b6472">${d.power?"LOCAL DHCP + DNS SERVICE ACTIVE":"ROUTER DARK — NAME SERVICE UNAVAILABLE"}</text>
    ${loose}
    <text x="260" y="420" text-anchor="middle" font-size="9" fill="#3d434e">RACK B · OFFICE EDGE</text>
  </svg>`;
}

// ---------------- patch panel ----------------
// continuity light: a jack lights when its hidden run reaches a PC whose
// cable is seated at BOTH ends (wall socket and NIC). The light is the
// sign that ties the office to the rack — trust it over the printed label.
// (runContinuity itself lives in net.js, the physical layer.)
function panelJacks() {
  return Object.keys(S.cabling.panel).sort().map(jack => {
    const printed = S.cabling.panel[jack].printed;
    const live = runContinuity(jack);               // { outlet, pc } | null
    const conn = cableAt(jack + ":jack");
    const leadTo = conn ? conn.cable[conn.end === "a" ? "b" : "a"] : null;
    const disagreement = !!(live && live.outlet !== printed);
    const resolved = !!(live && conn);                 // continuity found AND patched — link complete
    const warn = disagreement && !conn;                // amber only while the mismatch is unpatched
    return { jack, printed, live, conn, leadTo, disagreement, resolved, warn };
  });
}

function panelVisual(selected) {
  const jacks = panelJacks();
  const nodes = jacks.map((j,i) => {
    const x = 70 + i*52, y = 198;
    const sel = j.jack === selected;
    // a patched lead: stub out of the jack, connector below, caption naming the far end
    let lead = "";
    if (j.conn) {
      lead = `<line x1="${x+20}" y1="${y+73}" x2="${x+20}" y2="${y+93}" stroke="#6b7484" stroke-width="2"/>
        ${plugNode(j.conn.id, j.conn.end, x+20, y+101, "")}
        ${j.leadTo
          ? `<text x="${x+20}" y="${y+128}" text-anchor="middle" font-size="7.5" class="plug-cap">→ ${shortPort(j.leadTo)}</text>`
          : `<text x="${x+20}" y="${y+128}" text-anchor="middle" font-size="7.5" class="plug-cap warn">→ LOOSE END</text>`}`;
    }
    return `<g class="panel-jack ${sel?"port-selected":""}${j.resolved?" pj-ok":""}${j.conn?"":" pj-empty"}${portClass(j.jack+":jack")}" data-port="${j.jack}:jack" data-jack="${j.jack}" tabindex="0" role="button" aria-label="Patch panel jack ${j.jack}, labeled ${j.printed}${j.live ? ", continuity light on" : ""}">
      <circle class="pj-led-ring" cx="${x+20}" cy="${y-14}" r="6.5"/>
      <circle class="pj-led ${j.live ? (j.warn ? "pj-led-warn" : "pj-led-on") : ""}" cx="${x+20}" cy="${y-14}" r="3.4"/>
      <rect x="${x}" y="${y}" width="40" height="52" rx="3"/>
      <rect x="${x+8}" y="${y+10}" width="24" height="18" rx="1"/>
      <text x="${x+20}" y="${y+43}" text-anchor="middle" font-size="8" class="pj-id">${j.jack.replace("PP-","")}</text>
      <rect x="${x+1}" y="${y+58}" width="38" height="15" rx="2" class="pj-tape ${j.disagreement?"pj-warn":""}"/>
      <text x="${x+20}" y="${y+68.5}" text-anchor="middle" font-size="7.5" class="pj-label ${j.disagreement?"pj-warn":""}">${j.printed}</text>
    </g>
    ${lead}`;
  }).join("");
  // tray: spare leads and patch-lead ends resting at the panel
  const tray = looseEndsFor("panel").map((l,i) =>
    trayLeadNode(l.id, l.end, 92+i*112, 470, cable(l.id).a || cable(l.id).b ? "DANGLING — " + endName(l.id,l.end) : "SPARE LEAD")).join("");
  return `<svg viewBox="0 0 520 560" role="img" aria-label="Patch panel close-up">
    ${visualDefs()}
    <rect x="10" y="10" width="500" height="540" rx="8" fill="#0b0e13"/>
    <rect x="22" y="150" width="22" height="200" rx="2" fill="#090c10" stroke="#262c36"/>
    <rect x="476" y="150" width="22" height="200" rx="2" fill="#090c10" stroke="#262c36"/>
    <rect x="34" y="104" width="452" height="290" rx="8" fill="#0d1015" stroke="#3a4250" stroke-width="1.5"/>
    <rect x="48" y="120" width="424" height="40" rx="4" fill="#10141a" stroke="#202833"/>
    <text x="66" y="145" font-size="13" fill="#9aa4b2" letter-spacing="4">PATCH PANEL</text>
    <text x="456" y="145" text-anchor="end" font-size="9" fill="#5b6472">CONTINUITY LIGHTS</text>
    ${nodes}
    <rect x="58" y="404" width="404" height="1" fill="#262c36"/>
    <text x="70" y="428" font-size="9" fill="#5b6472">LEAD TRAY — SPARE PATCH LEADS · CLICK ONE TO TAKE IT</text>
    ${tray}
    <text x="260" y="544" text-anchor="middle" font-size="9" fill="#3d434e">RACK B · A PRINTED LABEL CAN LIE — A LIGHT CANNOT</text>
  </svg>`;
}

// ---------------- wall outlet ----------------
function outletVisual(outlet) {
  const conn = cableAt(outlet + ":sock");
  const jack = S.cabling.runs[outlet];
  const lit = jack && runContinuity(jack)?.outlet === outlet;
  return `<svg viewBox="0 0 520 460" role="img" aria-label="Wall outlet ${outlet} close-up">
    ${visualDefs()}
    <rect x="10" y="10" width="500" height="440" rx="8" fill="#0b0e13"/>
    ${Array.from({length:9},(_,i)=>`<line x1="${60+i*50}" y1="30" x2="${60+i*50}" y2="430" stroke="#141922"/>`).join("")}
    <line x1="30" y1="392" x2="490" y2="392" stroke="#262c36"/>
    <text x="260" y="420" text-anchor="middle" font-size="9" fill="#3d434e">BASEBOARD · STAFF OFFICES</text>
    <rect x="170" y="130" width="180" height="230" rx="8" fill="#10141a" stroke="#3a4250" stroke-width="1.5"/>
    <rect x="186" y="150" width="148" height="34" rx="3" fill="#0c0f13" stroke="#262c36"/>
    <text x="260" y="172" text-anchor="middle" font-size="15" letter-spacing="4" fill="#9aa4b2">${outlet}</text>
    <text x="260" y="206" text-anchor="middle" font-size="8" fill="#5b6472">ASTER FACILITIES · CAT6</text>
    <rect data-port="${outlet}:sock" class="nic-port${portClass(outlet+":sock")}" x="216" y="226" width="88" height="62" rx="4" fill="#07090c" stroke="${conn?"#7a8392":"#5b6472"}" stroke-width="1.5"/>
    <rect x="232" y="240" width="56" height="34" fill="#11161d" stroke="#262c36" style="pointer-events:none"/>
    ${conn ? plugNode(conn.id, conn.end, 260, 330, "→ " + shortPort(conn.cable[conn.end === "a" ? "b" : "a"])) : ""}
    <!-- the wire vanishes into the wall, toward the panel -->
    <path d="M 350 292 C 400 300 420 340 424 380" stroke="${lit?"#9aa4b2":"#3a4250"}" stroke-width="2" fill="none" stroke-dasharray="5 6" opacity=".7"/>
    <text x="438" y="388" text-anchor="middle" font-size="8" fill="${lit?"#9aa4b2":"#3d434e"}">${lit ? "→ LIGHTS " + jack : "→ IN THE WALLS"}</text>
  </svg>`;
}

// ---------------- shared inspector chrome ----------------
function interfacePanel(name, selected) {
  const ifs=interfacesFor(name);
  if (!ifs.length) return "";
  const current=ifs.find(p=>p.id===selected) || ifs.find(p=>p.target) || ifs[0];
  const addr = name === "CSW-01" ? (current.pid ? "CSW-01:"+current.pid : null) : current.port;
  const conn = addr ? cableAt(addr) : null;
  const cableBtn = addr ? (conn
    ? `<button class="btn" id="if-pickup">⇅ PICK UP LEAD — ${endName(conn.id, conn.end)}</button>`
    : hand ? `<button class="btn btn-primary" id="if-place">⭳ SEAT ${endName(hand.cableId, hand.end)} HERE</button>` : "") : "";
  return `<div class="iface-panel">
    <div class="iface-title">PHYSICAL INTERFACES — ${ifs.length} PORTS</div>
    <div class="iface-strip">${ifs.map(p=>`<button class="iface-chip iface-${p.state} ${p.id===current.id?"active":""}" data-iface="${p.id}"><span>${p.label}</span><i></i></button>`).join("")}</div>
    <div class="iface-detail">
      <div><b>${current.id}</b><span class="${current.cls}">${current.text}</span></div>
      <dl>
        <dt>ENDPOINT</dt><dd>${current.target || "—"}</dd>
        <dt>PATH</dt><dd>${current.medium}</dd>
        <dt>VLAN</dt><dd>${current.vlan}</dd>
        <dt>NEGOTIATED</dt><dd>${current.speed}</dd>
        ${current.why ? `<dt>DIAGNOSIS</dt><dd class="st-amber">${current.why}</dd>` : ""}
      </dl>
      ${cableBtn}
    </div>
  </div>`;
}

function row(k, v, cls="") {
  return `<div class="dp-row"><span class="dp-k">${k}</span><span class="dp-v ${cls}">${v}</span></div>`;
}

function observation(name, d) {
  if (!d.power) return "The casing is cold. No vibration reaches your fingertips.";
  if (name === "PC-B" && !d.nic) return "The cable is seated, but the interface indicator stays dark.";
  if (name === "PC-D") return pcCableConnected(name)
    ? "Cable seated at both ends, NIC enabled — yet the link LED stays dark."
    : "A loose patch lead lies within reach. The wall outlet is intact.";
  if (name === "PC-A") return "A handwritten address card is taped beneath the desk edge.";
  if (name === "PC-C") return "A text editor is open. The previous user logged out properly.";
  if (name.startsWith("SRV")) return "Fan vibration travels faintly through the rack frame.";
  if (name === "CSW-01") return "Port indicators wake in sequence, then settle into a slow rhythm.";
  if (name === "RTR-01") return "A faded label reads: OFFICE DHCP / LOCAL DNS.";
  return "Dust on the desk, except where someone recently moved the mouse.";
}

function deviceRows(name, d) {
  if (name === "CSW-01") {
    const ifs=switchInterfaces(), active=ifs.filter(p=>p.state==="active").length;
    const uplink=ifs.find(p=>p.id==="SW-24");
    return `${row("POWER", d.power?"ON":"OFF", d.power?"st-on":"st-off")}
      ${row("FORWARDING", d.power?"ACTIVE":"DARK", d.power?"st-good":"st-off")}
      ${row("USED PORTS", `${active}/24 LINKED`, active?"":"st-off")}
      ${row("ROUTER UPLINK", uplink.text, uplink.cls)}`;
  }
  if (name === "RTR-01") {
    const ifs=routerInterfaces(), lan1=ifs.find(p=>p.id==="LAN1"), wan=ifs.find(p=>p.id==="WAN");
    return `${row("POWER", d.power?"ON":"OFF", d.power?"st-on":"st-off")}
      ${row("DHCP / DNS", d.power?"ACTIVE":"UNAVAILABLE", d.power?"st-good":"st-off")}
      ${row("LAN1 UPLINK", lan1.text, lan1.cls)}
      ${row("WAN", wan.text, wan.cls)}`;
  }
  if (name.startsWith("SRV")) {
    const t = traceSRV(name);
    return `${row("POWER", d.power ? "ON" : "OFF", d.power ? "st-on" : "st-off")}
      ${row("NIC", t.ok ? "PATCHED — SW-" + t.switchPort.slice(1) : "LINK DOWN", t.ok ? "st-on" : "st-amber")}
      ${row("IP ADDRESS", d.ip || "—", d.ip ? "" : "st-off")}
      ${row("VLAN", String(t.vlan), "st-off")}`;
  }
  // workstations: the honest path summary
  const c = cable(pcCableId(name));
  const path = tracePC(name);
  const seatedA = c.a === name + ":nic", seatedB = !!c.b;
  let pathText, pathCls;
  if (!seatedA)         { pathText = "CABLE LOOSE AT THIS PC"; pathCls = "st-amber"; }
  else if (!seatedB)    { pathText = "WALL END NOT IN AN OUTLET"; pathCls = "st-amber"; }
  else if (!path.ok)    { pathText = "NO LINK BEYOND THE OUTLET"; pathCls = "st-amber"; }
  else                  { pathText = "LINK — SWITCH PORT " + path.switchPort.toUpperCase(); pathCls = "st-good"; }
  let panelText = "—", panelCls = "st-off";
  if (path.outlet) {
    // printed label = claim, continuity light = observed truth
    const claim = Object.keys(S.cabling.panel).find(j => S.cabling.panel[j].printed === path.outlet);
    const trueJack = S.cabling.runs[path.outlet];
    const lit = trueJack && runContinuity(trueJack);
    panelText = claim ? claim + " (label)" : "";
    if (lit) panelText += (panelText ? " · " : "") + trueJack + " lit";
    if (!panelText) panelText = "—";
    panelCls = lit ? (claim && trueJack !== claim ? "st-amber" : "") : "st-off";
  }
  return `${row("POWER", d.power ? "ON" : "OFF", d.power ? "st-on" : "st-off")}
    ${row("NIC", d.nic ? "ENABLED" : "DISABLED", d.nic ? "st-on" : "st-amber")}
    ${row("LINK PATH", pathText, pathCls)}
    ${row("WALL OUTLET", path.outlet || (seatedB ? c.b.split(":")[0] : "—"), path.outlet ? "" : "st-off")}
    ${row("PATCH PANEL", panelText, panelCls)}
    ${row("IP ADDRESS", d.ip || "—", d.ip ? "" : "st-off")}
    ${row("CONFIG", d.dhcp ? "DHCP (automatic)" : (d.ip ? "STATIC (manual)" : "—"), "st-off")}`;
}

// ---------------- device overlay ----------------
// opts: { from } — "netspace-traffic" unlocks console access. The old
// string second argument (a selected port id) still works unchanged.
export function openDevice(name, opts) {
  let selectedPort = null;
  let from = currentOrigin;
  if (typeof opts === "string") selectedPort = opts;
  else if (opts && typeof opts === "object") {
    selectedPort = opts.selectedPort || null;
    from = opts.from || currentOrigin;
  }
  currentOrigin = from;
  const d = S.devices[name];
  const ov = el("device-overlay");
  const isPC = name.startsWith("PC-");
  const isNetworkDevice = name === "CSW-01" || name === "RTR-01";
  const selected = selectedPort || selectedPorts[name];
  if (selected) selectedPorts[name] = selected;
  currentView = { kind:"device", name, selected: selected || null };
  const recorded = S.inventoried.includes(name);
  const on = d.power;
  const canConsole = from === "netspace-traffic";

  ov.innerHTML = `
  <div class="device-stage">
    <div class="device-visual">
      <div class="dv-visual-label">OPTICAL INSPECTION / ${name}</div>
      ${isPC ? pcVisual(name) : name === "CSW-01" ? switchVisual(name, selected) : name === "RTR-01" ? routerVisual(name, selected) : rackVisual(name)}
    </div>
    <div class="device-panel">
      <div class="dp-name">${name}</div>
      <div class="dp-role">${d.role}</div>
      <div class="dp-rows">
        ${deviceRows(name, d)}
      </div>
      <div class="dp-observation"><span>FIELD OBSERVATION</span>${observation(name, d)}</div>
      ${isNetworkDevice ? interfacePanel(name, selected) : ""}
      ${d.note ? `<div class="dp-note">◈ ${d.note}</div>` : ""}
      ${isPC ? `
      <div class="cable-area">
        <div class="cable-title">CONNECTION PANEL — ONE CABLE PER PORT</div>
        <div class="cable-hint">${pcCableConnected(name)
          ? "Ethernet cable is seated. The link LED only lights when the whole path — outlet, building run, patch lead — reaches a live switch port."
          : "A cable end lies loose. Click the connector to take it in hand, then click a free port to seat it."}</div>
      </div>` : ""}
      <div class="dp-actions">
        <button class="btn ${on ? "" : "btn-primary"}" id="dv-power">⏻ POWER ${on ? "OFF" : "ON"}</button>
        ${isPC && on ? `<button class="btn" id="dv-nic">${d.nic ? "DISABLE NIC" : "ENABLE NIC"}</button>` : ""}
        ${isPC && cable(pcCableId(name)).a ? `<button class="btn" id="dv-unplug">UNPLUG CABLE</button>` : ""}
        ${isPC && (name === "PC-C" ? on : canConsole) ? `<button class="btn btn-primary" id="dv-use">🖥 USE THIS COMPUTER</button>` : ""}
        ${isNetworkDevice && canConsole ? `<button class="btn btn-primary" id="dv-console">⌨ OPEN CONSOLE</button>` : ""}
        ${name === "PC-A" && !S.mechanicsMode ? `<button class="btn" id="dv-screen">👁 CHECK THE SCREEN</button>` : ""}
        ${!S.mechanicsMode ? (!recorded
          ? `<button class="btn" id="dv-record">✚ RECORD IN BFREE</button>`
          : `<div class="dp-record-ok">✓ RECORDED IN BFREE JOB BF-1042</div>`) : ""}
        <button class="btn" id="dv-close">STEP BACK</button>
      </div>
    </div>
  </div>`;
  ov.classList.remove("hidden");
  syncHandChip();
  wireCabling(ov);

  el("dv-close").onclick = () => closeDevice();

  // Switch/router port inspection: SVG port and inspector chip select the same interface.
  if (isNetworkDevice) {
    const choosePort = id => {
      if (!id) return;
      selectedPorts[name] = id;
      sfx.hover();
      openDevice(name, id);
    };
    ov.querySelectorAll("[data-port-id]").forEach(p => {
      p.addEventListener("click", () => { if (!hand) choosePort(p.dataset.portId); });
      p.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choosePort(p.dataset.portId); }
      });
    });
    ov.querySelectorAll("[data-iface]").forEach(p => p.addEventListener("click", () => choosePort(p.dataset.iface)));

    // dense grids: cable ops run through the inspector buttons
    const pk = el("if-pickup");
    if (pk) pk.onclick = () => {
      const ifs = interfacesFor(name);
      const cur = ifs.find(p => p.id === selectedPorts[name]) || ifs[0];
      const addr = name === "CSW-01" ? "CSW-01:"+cur.pid : cur.port;
      const conn = addr ? cableAt(addr) : null;
      if (conn) pickUp(conn.id, conn.end);
    };
    const pl = el("if-place");
    if (pl) pl.onclick = () => {
      const ifs = interfacesFor(name);
      const cur = ifs.find(p => p.id === selectedPorts[name]) || ifs[0];
      const addr = name === "CSW-01" ? "CSW-01:"+cur.pid : cur.port;
      if (addr) placeAt(addr);
    };
  }

  const pwr = el("dv-power");
  if (pwr) pwr.onclick = () => {
    d.power = !d.power;
    if (d.power) {
      if (!S.poweredOn.includes(name)) S.poweredOn.push(name);
      sfx.power();
    } else {
      S.poweredOn = S.poweredOn.filter(n => n !== name);
      sfx.click();
    }
    ctx.changed("power");
    openDevice(name);
  };

  const nic = el("dv-nic");
  if (nic) nic.onclick = () => {
    d.nic = !d.nic;
    if (d.nic) { sfx.fix(); if (name==="PC-B"){ S.pcbFixed = true; } }
    else sfx.click();
    ctx.changed("nic");
    openDevice(name);
  };

  const unp = el("dv-unplug");
  if (unp) unp.onclick = () => {
    cable(pcCableId(name)).a = null;
    sfx.click(); save(); ctx.changed("cable"); openDevice(name);
  };

  const rec = el("dv-record");
  if (rec) rec.onclick = () => {
    S.inventoried.push(name);
    sfx.notify(); ctx.changed("record", name);
    openDevice(name);
  };

  const use = el("dv-use");
  if (use) use.onclick = () => { sfx.click(); closeDevice(); ctx.openDesktop({ host:name, from }); };

  const con = el("dv-console");
  if (con) con.onclick = () => { sfx.click(); openDeviceConsole(name, from); };

  const scr = el("dv-screen");
  if (scr) scr.onclick = () => { sfx.click(); ctx.story.checkPCAScreen(); };
}

// The CLI takes over the close-up overlay; exit returns to this inspector.
function openDeviceConsole(name, from) {
  currentView = { kind:"cli", name, selected:null };
  const ov = el("device-overlay");
  ov.classList.remove("hidden");
  openCli(ov, name, { onExit: () => openDevice(name, { from }) });
}

// ---------------- patch panel overlay ----------------
export function openPatchPanel(selected) {
  const ov = el("device-overlay");
  if (selected) selectedPorts["panel"] = selected;
  const sel = selected || selectedPorts["panel"];
  currentView = { kind:"panel", name:"panel", selected: sel || null };
  const jacks = panelJacks();
  const current = jacks.find(j => j.jack === sel) || jacks[0];
  const litCount = jacks.filter(j => j.live).length;

  ov.innerHTML = `
  <div class="device-stage">
    <div class="device-visual">
      <div class="dv-visual-label">OPTICAL INSPECTION / PATCH PANEL</div>
      ${panelVisual(sel)}
    </div>
    <div class="device-panel">
      <div class="dp-name">PATCH PANEL</div>
      <div class="dp-role">Office wall runs terminate here — Rack B</div>
      <div class="dp-rows">
        ${row("TYPE", "PASSIVE — CONTINUITY LIGHTS", "st-off")}
        ${row("JACKS", "8 · OFFICE RUNS", "")}
        ${row("PATCHED", jacks.filter(j=>j.conn).length + "/8", "")}
        ${row("LIGHTS ON", litCount + "/8", litCount ? "" : "st-off")}
      </div>
      <div class="dp-observation"><span>FIELD OBSERVATION</span>Plug a PC into a wall outlet and a light answers here — that jack is where the outlet's hidden run truly ends, whatever the printed label claims. The connector hanging under a jack is its patch lead; the caption shows where the lead's other end goes. Click a connector to take it, click a glowing jack to plug it in.</div>
      <div class="iface-panel">
        <div class="iface-title">PANEL JACKS — LIGHT vs LABEL</div>
        <div class="iface-strip pj-strip">${jacks.map(j=>`<button class="iface-chip ${j.warn?"iface-fault":(j.live||j.conn?"iface-active":"iface-empty")} ${j.jack===current.jack?"active":""}" data-jack="${j.jack}"><span>${j.jack}</span><i></i></button>`).join("")}</div>
        <div class="iface-detail">
          <div><b>${current.jack}</b><span class="${current.live ? (current.warn ? "st-amber" : "st-good") : "st-off"}">${current.live ? "LIGHT ON — REACHES " + current.live.outlet + " (" + current.live.pc + ")" : "DARK — " + current.printed}</span></div>
          <dl>
            <dt>PRINTED</dt><dd>${current.printed}</dd>
            <dt>LIGHT SAYS</dt><dd class="${current.live ? (current.warn ? "st-amber" : "") : "st-off"}">${current.live ? current.live.outlet + " · " + current.live.pc : "nothing connected"}</dd>
            <dt>PATCH LEAD</dt><dd>${current.leadTo ? prettyPort(current.leadTo) : "none"}</dd>
          </dl>
          ${current.warn ? `<div class="pp-warn">⚠ LABEL DISAGREES — TRUST THE LIGHT, NOT THE INK</div>` : ""}
          ${current.resolved && current.disagreement ? `<div class="pp-hint">Patched. The printed label is wrong, but the light told the truth — this lead now carries ${current.live.pc}.</div>` : ""}
          ${current.live && !current.conn ? `<div class="pp-hint">This jack is live but has no patch lead — connect one to a free switch port.</div>` : ""}
        </div>
      </div>
      <div class="dp-actions">
        <button class="btn" id="dv-close">STEP BACK</button>
      </div>
    </div>
  </div>`;
  ov.classList.remove("hidden");
  syncHandChip();
  wireCabling(ov);

  el("dv-close").onclick = () => closeDevice();

  const chooseJack = j => { selectedPorts["panel"] = j; sfx.hover(); openPatchPanel(j); };
  ov.querySelectorAll("[data-jack]").forEach(n => {
    n.addEventListener("click", () => { if (!hand) chooseJack(n.dataset.jack); });
    n.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseJack(n.dataset.jack); }
    });
  });
}

// ---------------- wall outlet overlay ----------------
export function openOutlet(outlet) {
  const ov = el("device-overlay");
  currentView = { kind:"outlet", name:outlet, selected:null };
  const conn = cableAt(outlet + ":sock");
  const pcCable = conn && conn.cable.kind === "long" ? conn : null;
  const pcName = pcCable ? "PC-" + pcCable.id.slice(-1) : null;
  const jack = S.cabling.runs[outlet];
  const lit = !!(jack && runContinuity(jack) && runContinuity(jack).outlet === outlet);

  ov.innerHTML = `
  <div class="device-stage">
    <div class="device-visual">
      <div class="dv-visual-label">OPTICAL INSPECTION / WALL OUTLET ${outlet}</div>
      ${outletVisual(outlet)}
    </div>
    <div class="device-panel">
      <div class="dp-name">${outlet}</div>
      <div class="dp-role">Wall outlet — staff offices. The plate label is honest.</div>
      <div class="dp-rows">
        ${row("SOCKET", conn ? "IN USE — " + (pcName || "PATCH LEAD") : "VACANT", conn ? "" : "st-off")}
        ${row("PANEL LIGHT", lit ? jack + " IS LIT" : "—", lit ? "st-good" : "st-off")}
      </div>
      <div class="dp-observation"><span>FIELD OBSERVATION</span>${lit
        ? "With a PC connected at both ends, a continuity light answers at the patch panel: " + jack + ". That light is where this outlet truly goes."
        : "Behind the plate, a twisted pair disappears into the wall. Seat a connected PC here and watch which panel jack lights up."}</div>
      <div class="dp-actions">
        <button class="btn" id="dv-close">STEP BACK</button>
      </div>
    </div>
  </div>`;
  ov.classList.remove("hidden");
  syncHandChip();
  wireCabling(ov);

  el("dv-close").onclick = () => closeDevice();
}

export function closeDevice() {
  el("device-overlay").classList.add("hidden");
  el("device-overlay").innerHTML = "";
  currentView = null;
  currentOrigin = null;
  syncHandChip();
  save();
}
