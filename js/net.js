// ============================================================
// ECHO//LINK — deterministic network simulation
// The whole game runs on these state rules. No faking:
// cable connected ≠ link up ≠ reachable ≠ name resolvable.
// ============================================================
import { S, switchPortVlan } from "./state.js";
import { activeScenario } from "./scenario.js";

// ---------- physical layer: ports, cables, hidden runs ----------

// find the cable end parked in a given port address, if any
export function cableAt(portAddr) {
  if (!S.cabling) return null;
  for (const [id, c] of Object.entries(S.cabling.cables)) {
    if (c.a === portAddr) return { id, cable:c, end:"a" };
    if (c.b === portAddr) return { id, cable:c, end:"b" };
  }
  return null;
}

// continuity light: a panel jack lights when its hidden run reaches a PC
// whose cable is seated at BOTH ends (wall socket and NIC). The light is
// the observable truth that ties the office to the rack — the printed
// label is only a claim. Returns { outlet, pc } or null (dark).
export function runContinuity(jack) {
  if (!S.cabling) return null;
  const outlet = Object.keys(S.cabling.runs).find(o => S.cabling.runs[o] === jack);
  if (!outlet) return null;
  const conn = cableAt(outlet + ":sock");
  if (!conn || conn.cable.kind !== "long") return null;
  const pcEnd = conn.cable[conn.end === "a" ? "b" : "a"];
  const m = (pcEnd || "").match(/^([^:]+):nic$/);
  return m && activeScenario.isPC(m[1]) ? { outlet, pc: m[1] } : null;
}

// trace the full physical path from a PC to a switch port.
// Returns every hop plus where it breaks. No hop is assumed — each
// segment must be physically present: NIC → long cable → wall outlet →
// hidden run → patch-panel jack → patch lead → switch port.
export function tracePC(name) {
  const t = { pc:name, ok:false, failAt:null, outlet:null, panelJack:null,
              switchPort:null, vlan:null, cableId:activeScenario.pcCableId(name) };
  const c = S.cabling.cables[t.cableId];
  if (!c || !c.intact)                 { t.failAt = "cable";  return t; }
  if (c.a !== name+":nic")             { t.failAt = "nic";    return t; }
  const m = (c.b || "").match(/^(OF-\d+):sock$/);
  if (!m)                              { t.failAt = "outlet"; return t; }
  t.outlet = m[1];
  const jack = S.cabling.runs[t.outlet];
  if (!jack)                           { t.failAt = "run";    return t; }
  t.panelJack = jack;
  const lead = cableAt(jack + ":jack");
  if (!lead || lead.cable.kind !== "patch") { t.failAt = "panel"; return t; }
  const sw = lead.cable[lead.end === "a" ? "b" : "a"] || "";
  const prefix = activeScenario.switch + ":";
  const portPart = sw.startsWith(prefix) ? sw.slice(prefix.length) : null;
  if (!portPart || !/^p\d+$/.test(portPart)) { t.failAt = "switch"; return t; }
  t.switchPort = portPart;
  t.vlan = switchPortVlan(portPart);
  t.ok = true;
  return t;
}

// server's physical path: direct patch lead NIC → switch port
export function traceSRV(name) {
  const t = { srv:name, ok:false, switchPort:null, vlan:activeScenario.serverVlan,
              cableId: activeScenario.serverCableId(name) };
  const c = S.cabling.cables[t.cableId];
  if (c && c.intact && c.a === name+":nic") {
    const sw = c.b || "";
    const prefix = activeScenario.switch + ":";
    const portPart = sw.startsWith(prefix) ? sw.slice(prefix.length) : null;
    if (portPart && /^p\d+$/.test(portPart)) { t.switchPort = portPart; t.vlan = switchPortVlan(portPart); t.ok = true; }
  }
  return t;
}

// a PC's long cable is seated at both ends (desk side and wall side)
export function pcCableConnected(name) {
  const c = S.cabling?.cables[activeScenario.pcCableId(name)];
  return !!(c && c.a && c.b);
}

// link up = power + NIC + a complete physical path to a switch port
export function linkUp(name) {
  const d = S.devices[name];
  if (!d || !d.power || !d.nic) return false;
  if (name.startsWith("PC-"))  return tracePC(name).ok;
  if (name.startsWith("SRV-")) return traceSRV(name).ok;
  return true; // switch / router: link is a property of their ports, not the chassis
}

// the VLAN a device actually lands on, given where its cable path ends
export function effectiveVlan(name) {
  if (name.startsWith("PC-"))  return tracePC(name).vlan;
  if (name.startsWith("SRV-")) return traceSRV(name).vlan;
  return S.devices[name]?.vlan ?? null;
}

// an end device can talk when link is up and it has an address
export function deviceOnline(name) {
  const d = S.devices[name];
  if (!d) return false;
  return linkUp(name) && !!d.ip;
}

// router infrastructure must be powered for office LAN to function at all
export function routerUp()   { return S.devices[activeScenario.router].power; }
export function switchUp()   { return S.devices[activeScenario.switch].power; }

// can the player's machine reach this device at IP level?
// (same-segment only unless the scenario enables inter-VLAN routing)
export function reachableFromPCC(name) {
  if (!routerUp() || !switchUp()) return false;      // no powered network gear, nothing moves
  if (!deviceOnline(activeScenario.player)) return false; // our own machine needs a live path too
  const d = S.devices[name];
  if (!d) return false;
  if (!activeScenario.reachesVlan(effectiveVlan(name))) return false; // other segment: unreachable
  return deviceOnline(name);
}

// name resolution: router DNS only knows DHCP clients that registered
export function resolvesName(name) {
  const d = S.devices[name];
  if (!d) return null;                 // no such host
  if (!routerUp()) return null;
  if (!d.nameRegistered) return null;  // e.g. static-IP PC-A was never registered
  return d.ip;
}

// what Network Space shows. provenance matters: inventory-known vs network-observed
export function netspaceView() {
  const infra = routerUp() && switchUp();
  return Object.values(S.devices).map(d => {
    const vlan = effectiveVlan(d.name);
    let observed = false;
    if (infra && activeScenario.reachesVlan(vlan) && deviceOnline(d.name)) observed = true;
    // state classification for the view — the network reports what it can
    // observe (carrier, traffic), never why a hidden segment fails.
    let state;
    if (!d.power)               state = "off";       // powered down
    else if (!linkUp(d.name))   state = d.nic ? "nolink" : "nicdown";
    else if (!activeScenario.reachesVlan(vlan) && activeScenario.isPC(d.name)) state = "vlanmis"; // linked, wrong segment
    else if (observed)          state = "online";
    else                        state = "silent";    // looks fine locally but not observable
    return { ...d, vlan, observed, state,
             provenance: observed ? "network-observed" : "inventory-known" };
  });
}

// ---------- infrastructure interfaces: what the gear reports about itself ----------
// Both the close-up inspector and the device CLIs read these. Everything here
// is live state, and it stops at the edge of what the device can observe.
function endpoint(name) { return S.devices[name]; }

function remotePCState(pc) {
  const t = endpoint(pc);
  if (!t.power) return { state:"fault", text:"REMOTE OFF", cls:"st-amber", speed:"—" };
  if (!t.nic)   return { state:"fault", text:"REMOTE NIC DISABLED", cls:"st-amber", speed:"—" };
  return { state:"active", text:"LINK UP", cls:"st-good", speed:"1G" };
}

// what is actually beyond a switch port, traced through panel + runs
function traceFromSwitchPort(pid) {
  const conn = cableAt("CSW-01:" + pid);
  if (!conn) return null;
  const c = conn.cable;
  const other = c[conn.end === "a" ? "b" : "a"];
  if (!other) return { kind:"dangling", cableId:conn.id };
  const [owner] = other.split(":");
  if (owner === "RTR-01") return { kind:"uplink", device:"RTR-01" };
  if (owner.startsWith("SRV-")) return { kind:"server", device:owner };
  if (owner.startsWith("PP-")) {
    const jack = owner;
    const printed = S.cabling.panel[jack]?.printed || "??";
    const live = runContinuity(jack);          // the panel light, right beside the switch
    const trueOutlet = live ? live.outlet : null;
    let pc = null, outletCable = null;
    if (trueOutlet) {
      outletCable = cableAt(trueOutlet + ":sock");
      if (outletCable && outletCable.cable.kind === "long") {
        const pcEnd = outletCable.cable[outletCable.end === "a" ? "b" : "a"];
        const m = (pcEnd || "").match(/^(PC-[A-D]):nic$/);
        if (m) pc = m[1];
      }
    }
    return { kind:"panel", jack, printed, trueOutlet, live, pc, outletCable };
  }
  return { kind:"unknown" };
}

export function switchInterfaces() {
  const sw = endpoint("CSW-01");
  return Array.from({length:24},(_,i)=>{
    const n=i+1, pid="p"+String(n).padStart(2,"0"), id="SW-"+String(n).padStart(2,"0");
    const vlan = switchPortVlan(pid);
    if (!sw.power) return { id, label:"P"+String(n).padStart(2,"0"), pid, target:null, vlan, medium:"vacant", state:"down", text:"PORT DOWN", cls:"st-off", speed:"—" };
    const t = traceFromSwitchPort(pid);
    if (!t) return { id, label:"P"+String(n).padStart(2,"0"), pid, target:null, vlan, medium:"vacant", state:"empty", text:"EMPTY", cls:"st-off", speed:"—" };
    if (t.kind === "dangling")
      return { id, label:"P"+String(n).padStart(2,"0"), pid, target:null, vlan, medium:"lead seated — far end loose", state:"fault", text:"NO CARRIER", cls:"st-amber", speed:"—" };
    if (t.kind === "uplink") {
      const st = endpoint("RTR-01").power
        ? { state:"active", text:"LINK UP", cls:"st-good", speed:"1G" }
        : { state:"fault", text:"REMOTE OFF", cls:"st-amber", speed:"—" };
      return { id, label:"P"+String(n).padStart(2,"0"), pid, target:"RTR-01", vlan, medium:"router uplink", ...st };
    }
    if (t.kind === "server") {
      const st = endpoint(t.device).power
        ? { state:"active", text:"LINK UP", cls:"st-good", speed:"1G" }
        : { state:"fault", text:"REMOTE OFF", cls:"st-amber", speed:"—" };
      return { id, label:"P"+String(n).padStart(2,"0"), pid, target:t.device, vlan, medium:"rack patch", ...st };
    }
    if (t.kind === "panel") {
      // the continuity light on the neighboring panel is the visible truth:
      // when lit it names the real outlet, when dark the printed label claims
      const medium = t.live
        ? `← ${t.jack} · light: ${t.live.outlet} (${t.live.pc})`
        : `← ${t.jack} · ${t.printed} (label)`;
      if (!t.live)
        return { id, label:"P"+String(n).padStart(2,"0"), pid, target:null, vlan, medium, state:"fault", text:"NO CARRIER", cls:"st-amber", speed:"—", why:"panel light dark — nothing reaches this jack" };
      if (!t.pc)
        return { id, label:"P"+String(n).padStart(2,"0"), pid, target:null, vlan, medium, state:"fault", text:"NO CARRIER", cls:"st-amber", speed:"—", why: t.outletCable ? "PC end of the desk cable is loose" : "outlet vacant" };
      return { id, label:"P"+String(n).padStart(2,"0"), pid, target:t.pc, vlan, medium, ...remotePCState(t.pc) };
    }
    return { id, label:"P"+String(n).padStart(2,"0"), pid, target:null, vlan, medium:"unknown lead", state:"fault", text:"NO CARRIER", cls:"st-amber", speed:"—" };
  });
}

export function routerInterfaces() {
  const powered = !!endpoint("RTR-01")?.power;
  const up = cableAt("RTR-01:lan1");
  const upFar = up ? up.cable[up.end === "a" ? "b" : "a"] : null;
  const upToSwitch = !!(upFar && upFar.startsWith("CSW-01:"));
  const lan1 = !powered
    ? { state:"down", text:"PORT DOWN", cls:"st-off", speed:"—" }
    : !up ? { state:"empty", text:"EMPTY", cls:"st-off", speed:"—" }
    : !upToSwitch ? { state:"fault", text:"NO CARRIER", cls:"st-amber", speed:"—" }
    : endpoint("CSW-01").power ? { state:"active", text:"LINK UP", cls:"st-good", speed:"1G" }
    : { state:"fault", text:"REMOTE OFF", cls:"st-amber", speed:"—" };
  return [
    powered
      ? { id:"WAN", label:"WAN", port:null, target:null, vlan:"—", medium:"building uplink", state:"fault", text:"NO LINE", cls:"st-amber", speed:"—" }
      : { id:"WAN", label:"WAN", port:null, target:null, vlan:"—", medium:"building uplink", state:"down", text:"PORT DOWN", cls:"st-off", speed:"—" },
    { id:"LAN1", label:"LAN1", port:"RTR-01:lan1", target:upToSwitch ? "CSW-01" : null, vlan:10, medium:"switch uplink", ...lan1 },
    ...[2,3,4].map(n => ({ id:"LAN"+n, label:"LAN"+n, port:"RTR-01:lan"+n, target:null, vlan:10, medium:"vacant",
        ...(!powered ? { state:"down", text:"PORT DOWN", cls:"st-off", speed:"—" }
          : cableAt("RTR-01:lan"+n) ? { state:"fault", text:"NO CARRIER", cls:"st-amber", speed:"—" }
          : { state:"empty", text:"EMPTY", cls:"st-off", speed:"—" }) })),
    { id:"MGMT", label:"MGMT", port:null, target:null, vlan:"—", medium:"local management", state:"down", text:"DISABLED", cls:"st-off", speed:"—" },
  ];
}

// ---- ping: returns an array of {text, cls, delay} lines, honest about why ----
// `source` is the machine running the command; it defaults to the player's.
export function ping(target, source = activeScenario.player) {
  const lines = [];
  S.stats.pings++;
  const src = S.devices[source];
  const selfIp = (src && src.ip) || S.devices[activeScenario.player].ip;
  const srcVlan = src ? effectiveVlan(source) : null;
  const canReach = vlan => srcVlan != null && (vlan === srcVlan || activeScenario.interVlanRouting);

  if (!deviceOnline(source)) {
    lines.push({ text:`Pinging ${target} with 32 bytes of data:`, cls:"" });
    for (let i=0;i<2;i++) lines.push({ text:`General failure.`, cls:"t-amber", delay: 500 });
    lines.push({ text:`Ping statistics for ${target}:`, cls:"" });
    lines.push({ text:`    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, cls:"t-dim" });
    return lines;
  }

  if (!routerUp() || !switchUp()) {
    lines.push({ text:`Pinging ${target} with 32 bytes of data:`, cls:"" });
    for (let i=0;i<4;i++) lines.push({ text:`Reply from ${selfIp}: Destination host unreachable.`, cls:"t-dim", delay: 900 });
    lines.push({ text:`Ping statistics for ${target}:`, cls:"" });
    lines.push({ text:`    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, cls:"t-dim" });
    return lines;
  }

  // numeric IP?
  const ipMatch = target.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  let ip = null, host = null;
  if (ipMatch) {
    ip = target;
    host = Object.values(S.devices).find(d => d.ip === ip) || null;
  } else {
    const name = target.toUpperCase();
    host = S.devices[name] || null;
    ip = host ? resolvesName(name) : null;
    if (!host || !ip) {
      // hostname resolution failure — the PC-A lesson
      lines.push({ text:`Ping request could not find host ${target}. Please check the name and try again.`, cls:"t-amber" });
      return lines;
    }
  }

  lines.push({ text:`Pinging ${host ? host.name : ip} [${ip}] with 32 bytes of data:`, cls:"" });

  const hostVlan = host ? effectiveVlan(host.name) : null;
  const ok = host && canReach(hostVlan) && deviceOnline(host.name);
  const noRoute = host && hostVlan !== null && !canReach(hostVlan);

  if (ok) {
    let reply = 0;
    const t = () => String((S.stats.pings + reply++) % 3);
    for (let i=0;i<4;i++) lines.push({ text:`Reply from ${ip}: bytes=32 time=${t()}ms TTL=128`, cls:"t-green", delay: 700 });
    lines.push({ text:`Ping statistics for ${ip}:`, cls:"" });
    lines.push({ text:`    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),`, cls:"t-green" });
    lines.push({ text:`Approximate round trip times in milli-seconds:`, cls:"t-dim" });
    lines.push({ text:`    Minimum = 0ms, Maximum = 2ms, Average = 1ms`, cls:"t-dim" });
  } else if (noRoute) {
    for (let i=0;i<4;i++) lines.push({ text:`Request timed out.`, cls:"t-dim", delay: 1000 });
    lines.push({ text:`Ping statistics for ${ip}:`, cls:"" });
    lines.push({ text:`    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, cls:"t-dim" });
  } else {
    // same segment and silent (NIC down / cable out / off), or no path to the target's segment at all
    for (let i=0;i<4;i++) lines.push({ text:`Reply from ${selfIp}: Destination host unreachable.`, cls:"t-dim", delay: 900 });
    lines.push({ text:`Ping statistics for ${ip}:`, cls:"" });
    lines.push({ text:`    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, cls:"t-dim" });
  }
  return lines;
}

export function ipconfig(source = activeScenario.player) {
  const c = S.devices[source] || S.devices[activeScenario.player];
  return [
    { text:"", cls:"" },
    { text:"Windows IP Configuration", cls:"t-white" },
    { text:"", cls:"" },
    { text:"Ethernet adapter Ethernet0:", cls:"t-white" },
    { text:"", cls:"" },
    { text:`   Connection-specific DNS Suffix  . : ${activeScenario.dnsSuffix}`, cls:"t-dim" },
    { text:`   IPv4 Address. . . . . . . . . . . : ${c.ip}`, cls:"" },
    { text:`   Subnet Mask . . . . . . . . . . . : ${activeScenario.subnetMask}`, cls:"" },
    { text:`   Default Gateway . . . . . . . . . : ${routerUp() ? activeScenario.gatewayIp : "unavailable"}`, cls:"" },
    { text:`   DHCP Enabled. . . . . . . . . . . : ${c.dhcp ? "Yes" : "No"}`, cls:"t-dim" },
    { text:"", cls:"" },
  ];
}

export function helpText() {
  return [
    { text:"Available commands:", cls:"t-white" },
    { text:"  help              Show this list", cls:"" },
    { text:"  ipconfig          Show this machine's network configuration", cls:"" },
    { text:"  ping <host>       Test connectivity to a device, by name or IP", cls:"" },
    { text:"  clear             Clear the screen", cls:"" },
    { text:"  exit              Step away from the terminal", cls:"" },
    { text:"", cls:"" },
    { text:`Devices you know about: ${Object.keys(S.devices).join("  ")}`, cls:"t-dim" },
  ];
}
