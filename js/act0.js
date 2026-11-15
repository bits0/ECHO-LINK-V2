// TEMPORARY — Act 0 board seed. Not derived from the simulator. Must be
// replaced in Act 1 by topology-driven NetSpace. Do not copy this pattern.
import { S } from "./state.js";

const n = (id, layer, physical, boot, after) =>
  ({ id, layer, physical, boot, after, state: boot, visibleAtBoot: layer !== "L0" });

export const ACT0 = {
  id: "act0",
  title: "ACT 0 — THE CASCADE",
  clockStart: "02:13:52",
  devices: {
    "L1-WS-NOC01": { name:"L1-WS-NOC01", role:"NOC workstation", room:"noc",
      power:true, nic:true, cable:true, ip:null, vlan:null, dhcp:false, nameRegistered:false },
  },
  nodes: [
    n("L1-WS-NOC01",     "L1", "player workstation",        "green", "green"),
    n("L1-SRV-SYSLOG01", "L1", "syslog/AD server",          "green", "green"),
    n("L1-SW-DIST01",    "L1", "distribution switch",       "green", "red"),
    n("L1-RTR-LOC01",    "L1", "local gateway router",      "green", "red"),
    n("L1-CON-SRV01",    "L1", "console/out-of-band server","green", "green"),
    n("L1-UPS-PWR01",    "L1", "UPS controller",            "green", "green"),
    n("L2-SW-ACC01",     "L2", "lab access switch A",       "green", "red"),
    n("L2-SW-ACC02",     "L2", "lab access switch B",       "green", "red"),
    n("L3-SW-CORE01",    "L3", "data-center core switch",   "green", "red"),
    n("L3-SRV-ARCH01",   "L3", "archive server",            "green", "red"),
    n("L3-SAN-01",       "L3", "storage array",             "green", "red"),
    n("L0-SW-ACC01",     "L0", "L0 access switch",          "hidden","session"),
    n("L0-RTR-EDGE01",   "L0", "edge gateway router",       "hidden","session"),
    n("L0-NVR-01",       "L0", "NVR",                       "hidden","session"),
    n("L0-ACS-01",       "L0", "access control",            "hidden","session"),
    n("L0-WS-HR01",      "L0", "HR workstation",            "hidden","session"),
    n("L0-WS-FIN01",     "L0", "Finance workstation",       "hidden","session"),
    n("CAM-01",          "L0", "IP camera",                 "hidden","session"),
    n("CAM-02",          "L0", "IP camera",                 "hidden","session"),
    n("CAM-03",          "L0", "IP camera",                 "hidden","session"),
    n("CAM-04",          "L0", "IP camera",                 "hidden","session"),
  ],
  calmLogs: [
    { ts:"02:12:38.204", device:"L1-UPS-PWR01",    message:"battery self-test ok" },
    { ts:"02:12:44.517", device:"L1-SRV-SYSLOG01", message:"heartbeat ok" },
    { ts:"02:12:51.033", device:"L1-SW-DIST01",    message:"stp root unchanged" },
    { ts:"02:12:57.660", device:"L1-RTR-LOC01",    message:"bgp keepalive ok" },
    { ts:"02:13:03.128", device:"L2-SW-ACC01",     message:"port g1/12 link up 1G" },
    { ts:"02:13:08.775", device:"L2-SW-ACC02",     message:"port g1/07 link up 1G" },
    { ts:"02:13:14.402", device:"L3-SW-CORE01",    message:"port te1/49 link up 10G" },
    { ts:"02:13:19.960", device:"L3-SRV-ARCH01",   message:"iscsi session active" },
    { ts:"02:13:25.318", device:"L3-SAN-01",       message:"fabric login ok" },
    { ts:"02:13:31.870", device:"L1-CON-SRV01",    message:"serial port idle" },
    { ts:"02:13:37.442", device:"L1-WS-NOC01",     message:"dhcp lease ok" },
    { ts:"02:13:50.006", device:"L1-SRV-SYSLOG01", message:"log rotation complete" },
  ],
  sop: [{
    id: "console-access",
    title: "CONSOLE ACCESS — OUT-OF-BAND",
    body: `CONSOLE ACCESS — OUT-OF-BAND

When the primary network is down, facility devices can still be reached by serial console.

1. Open PHYSICAL view in NetSpace.
2. Locate L1-CON-SRV01 (console patch panel, NOC rack, unit 4).
3. Seat the maintenance lead from the console server to the device's console port.
4. Open a session in Terminal: session open sw-l0

Console sessions do not use the network. They do not require IP. They work when nothing else does.

If you can reach it with a cable, you can reach it.`,
  }],
};

export function bootAct0() {
  if (S.logs.length) return;
  S.nodes = structuredClone(ACT0.nodes);
  S.logs = structuredClone(ACT0.calmLogs);
  S.sop = structuredClone(ACT0.sop);
  S.sessions = {};
  S.consoleLinks = {};
  S.cascadeDone = false;
}

// Slot order is the story: slot 12 is an anomaly whose timestamp predates
// the eleven slots before it. Never sort this by ts.
export const CASCADE_LOG = [
  { ts:"02:13:59.402", device:"L1-SRV-SYSLOG01", message:"heartbeat interval drift +40ms" },
  { ts:"02:13:59.887", device:"L1-SW-DIST01",    message:"mgmt link to L1-RTR-LOC01: no carrier" },
  { ts:"02:14:00.001", device:"L1-RTR-LOC01",    message:"interface gi0/1 admin up, line protocol down" },
  { ts:"02:14:00.002", device:"L1-SW-DIST01",    message:"uplink to L1-RTR-LOC01 down" },
  { ts:"02:14:00.004", device:"L1-SRV-SYSLOG01", message:"heartbeat lost" },
  { ts:"02:14:00.007", device:"L2-SW-ACC01",     message:"trunk to L1-SW-DIST01 down" },
  { ts:"02:14:00.009", device:"L2-SW-ACC02",     message:"trunk to L1-SW-DIST01 down" },
  { ts:"02:14:00.011", device:"L3-SW-CORE01",    message:"trunk to L2-SW-ACC01 down" },
  { ts:"02:14:00.014", device:"L3-SW-CORE01",    message:"trunk to L2-SW-ACC02 down" },
  { ts:"02:14:00.016", device:"L3-SRV-ARCH01",   message:"iscsi session to L3-SAN-01 reset" },
  { ts:"02:14:00.018", device:"L3-SAN-01",       message:"fabric login lost" },
  { ts:"02:13:58.771", device:"L0-SW-ACC01",     message:"link down" },
  { ts:"02:14:00.019", device:"L0-RTR-EDGE01",   message:"unreachable" },
  { ts:"02:14:00.021", device:"L0-SW-ACC01",     message:"link up" },
  { ts:"02:14:00.023", device:"L0-NVR-01",       message:"camera feed lost: CAM-01 CAM-02 CAM-03 CAM-04" },
  { ts:"02:14:00.026", device:"L0-ACS-01",       message:"door bus offline" },
  { ts:"02:14:00.028", device:"L0-WS-HR01",      message:"dhcp lease renewal failed" },
  { ts:"02:14:00.031", device:"L0-WS-FIN01",     message:"dhcp lease renewal failed" },
  { ts:"02:14:00.033", device:"L1-SW-DIST01",    message:"stp topology change" },
  { ts:"02:14:00.036", device:"L2-SW-ACC01",     message:"stp topology change" },
  { ts:"02:14:00.038", device:"L3-SW-CORE01",    message:"stp topology change" },
  { ts:"02:14:00.041", device:"L1-SRV-SYSLOG01", message:"log ingest backlog 312 events" },
  { ts:"02:14:00.044", device:"L1-SRV-SYSLOG01", message:"log ingest backlog 1184 events" },
  { ts:"02:14:00.047", device:"L1-SRV-SYSLOG01", message:"clock resync from ntp: +0.000s" },
];

export function cascade() {
  if (!S.act0 || S.cascadeDone) return { appended: 0 };
  S.logs.push(...structuredClone(CASCADE_LOG));
  for (const node of S.nodes) if (node.after === "red") node.state = "red";
  S.cascadeDone = true;
  return { appended: 24 };
}

const consulting = () => S.sessions["sw-l0"] && S.sessions["sw-l0"].state === "connected";

export function visibleNodes() {
  const live = consulting();
  return S.nodes.filter(node => node.visibleAtBoot || (node.layer === "L0" && live));
}

// The console lead is the live run: SW-L0 answers green, the rest of L0 is dead.
export function nodeState(node) {
  if (node.layer === "L0" && consulting()) return node.id === "L0-SW-ACC01" ? "green" : "red";
  return node.state;
}

export function clockNow() {
  const elapsed = Math.max(0, Date.now() - (S.stats.startTime || Date.now()));
  const [h, m, s] = (S.clockStart || "21:47:00").split(":").map(Number);
  const total = (h*3600 + m*60 + (s || 0) + Math.floor(elapsed/60000)*60) % (24*3600);
  const pad = v => String(v).padStart(2, "0");
  return `${pad(Math.floor(total/3600))}:${pad(Math.floor(total/60)%60)}:${pad(total%60)}`;
}

export function openSession(target) {
  const link = S.consoleLinks[target];
  if (!link) return { lines: [`no console path to ${target}`], state: "disconnected", awarded: false };
  const cur = S.sessions[target];
  let awarded = false;
  if (!cur || cur.state !== "connected") {
    S.sessions[target] = { state:"connected", openedAt: Date.now() };
    if (S.stability.perScenario.act0 == null) {
      S.stability.perScenario.act0 = 2;
      S.stability.total += 2;
      awarded = true;
    }
  }
  return { lines: [`opening console to ${target}...`, `connected to ${link.to}`], state: "connected", awarded };
}

export function closeSession(target) {
  const link = S.consoleLinks[target];
  if (!link) return { lines: [`no console path to ${target}`], state: "disconnected" };
  const cur = S.sessions[target];
  if (cur && cur.state === "connected") {
    S.sessions[target] = { state:"disconnected", openedAt:null };
    return { lines: [`closed console to ${link.to}`], state: "disconnected" };
  }
  return { lines: [`no open console session to ${target}`], state: "disconnected" };
}

export function seatConsoleLink() {
  if (S.consoleLinks["sw-l0"]) return;
  S.consoleLinks["sw-l0"] = { from:"L1-CON-SRV01", to:"SW-L0", seatedAt: Date.now() };
  S.logs.push({ ts: clockNow(), device:"L1-CON-SRV01", message:"console lead seated to SW-L0" });
}

export function pinLog(index) {
  if (S.logs[index]) S.pins.push({ ...S.logs[index] });
}

export function removePin(index) { S.pins.splice(index, 1); }
