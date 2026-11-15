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
  chat: [
    { id:"s1-01",  speaker:"rue", text:"you seeing this", delay:12000 },
    { id:"s1-02",  speaker:"sys", delay:0, choices:[
      { label:"Everything's red. Syslog is going crazy.", next:"s1-03a" },
      { label:"Yeah. Whole board.", next:"s1-03b" },
    ] },
    { id:"s1-03a", speaker:"rue", text:"ok\ndon't touch anything yet", delay:8000 },
    { id:"s1-03b", speaker:"rue", text:"ok\ndon't touch anything yet", delay:8000 },
    { id:"s1-04",  speaker:"rue", text:"what do you have", delay:9000 },
    { id:"s1-05",  speaker:"sys", delay:0, choices:[
      { label:"L0 gone. L1, L2, L3 all down. Ping fails everywhere.", next:"s1-06a" },
      { label:"I don't know. It all went at once.", next:"s1-06b" },
    ] },
    { id:"s1-06a", speaker:"rue", text:"ping the L1 gateway. if that fails it's not the network it's the room", delay:14000 },
    { id:"s1-06b", speaker:"rue", text:"ping the L1 gateway. if that fails it's not the network it's the room", delay:14000 },
    { id:"s1-07",  speaker:"sys", delay:0, choices:[
      { label:"Fails.", next:"s1-08" },
      { label:"Fails. I'm isolated.", next:"s1-08" },
    ] },
    { id:"s1-08",  speaker:"rue", text:"ok\nping anything. anything at all", delay:7000 },
    { id:"s1-09",  speaker:"sys", delay:0, choices:[
      { label:"No.", next:"s1-10" },
    ] },
    { id:"s1-10",  speaker:"rue", text:"storm didn't do that\na storm doesn't take L0 and L3 in the same second", delay:11000 },
    { id:"s1-11",  speaker:"rue", text:"sorry. something here\nI'm coming to you. sit tight. don't reboot anything", delay:52000, away:true },
    { id:"s1-12",  speaker:"rue", delay:0, away:true },
    { id:"s2-01",  speaker:"rue", text:"I'm not coming", delay:4000 },
    { id:"s2-02",  speaker:"sys", delay:0, choices:[
      { label:"What? Why?", next:"s2-03" },
      { label:"What happened?", next:"s2-03" },
    ] },
    { id:"s2-03",  speaker:"rue", text:"bridge is gone. the one on the access road\npolice. fire. everyone's out here in the rain\nI'm stuck on this side. not getting to you", delay:15000 },
    { id:"s2-04",  speaker:"sys", delay:0, choices:[
      { label:"Are you okay?", next:"s2-05" },
      { label:"How long?", next:"s2-05" },
    ] },
    { id:"s2-05",  speaker:"rue", text:"fine. not hurt. wet\ncould be hours. could be morning\nyou're on your own tonight. I'll be on the phone when I can. sometimes I won't. don't wait on me", delay:10000 },
    { id:"s2-06",  speaker:"rue", text:"start with L0. it went down first", delay:6000 },
    { id:"s2-07",  speaker:"rue", text:"you're in SW-L0?", delay:5000 },
    { id:"s2-08",  speaker:"sys", delay:0, choices:[
      { label:"I'm in.", next:"s2-09" },
      { label:"Console's up.", next:"s2-09" },
    ] },
    { id:"s2-09",  speaker:"rue", text:"good\nshow me interfaces", delay:8000 },
    { id:"s2-10",  speaker:"sys", delay:0, choices:[
      { label:"Most ports down. One up.", next:"s2-11" },
      { label:"One live port.", next:"s2-11" },
    ] },
    { id:"s2-11",  speaker:"rue", text:"that's your floor. one cable still working\nget L0 back. then we'll talk about the rest\nI'll check in. not every minute. don't wait on me", delay:6000 },
    { id:"s2-12",  speaker:"rue", text:"copy that L0 line into Notepad. the one with the time\nhabit. that's all", delay:4000 },
    { id:"s2-13",  speaker:"sys", delay:0, choices:[
      { label:"Done.", next:"s2-14" },
      { label:"Copied.", next:"s2-14" },
    ] },
    { id:"s2-14",  speaker:"rue", text:"good\ngo", delay:5000 },
    { id:"s2-15",  speaker:"rue", delay:0, away:true },
  ],
};

export function bootAct0() {
  if (S.logs.length) return;
  S.nodes = structuredClone(ACT0.nodes);
  S.logs = structuredClone(ACT0.calmLogs);
  S.sop = structuredClone(ACT0.sop);
  S.sessions = {};
  S.consoleLinks = {};
  S.cascadeDone = false;
  beginChat();
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

// ---------------- Act 0 chat: Rue's two sequences ----------------
const CHAT_SEED = () => ({
  seq: 1, current: "s1-01", shown: [], pendingAt: 0,
  typing: false, away: false, waiting: false, sopSeen: false, seq2Pending: false,
});

const beat = id => ACT0.chat.find(b => b.id === id) || null;

function schedule(c, id) {
  const b = beat(id);
  c.current = id;
  c.pendingAt = Date.now() + (b ? b.delay : 0);
  // Rue types before any line lands, including the long pause message.
  c.typing = !!b && b.speaker === "rue" && !!b.text;
}

export function beginChat() {
  S.chat = CHAT_SEED();
  schedule(S.chat, "s1-01");
  return S.chat;
}

function nextBeat(id) {
  const seq = id.slice(0, 2), num = parseInt(id.slice(3), 10);
  let best = null, bestNum = Infinity;
  for (const b of ACT0.chat) {
    if (!b.id.startsWith(seq + "-")) continue;
    const bn = parseInt(b.id.slice(3), 10);
    if (bn > num && bn < bestNum) { best = b; bestNum = bn; }
  }
  return best ? best.id : null;
}

export function revealDue(now = Date.now()) {
  const c = S.chat;
  if (!c || c.waiting || !c.pendingAt) return null;
  const b = beat(c.current);
  if (!b) return null;
  // the pause: five seconds of typing, then Rue is gone
  if (b.id === "s1-11" && c.typing && now - (c.pendingAt - b.delay) >= 5000) {
    c.typing = false;
    c.away = true;
  }
  if (now < c.pendingAt) return null;
  c.typing = false;
  if (b.text) c.shown.push({ speaker: b.speaker, text: b.text });
  if (b.choices) { c.waiting = true; return b.id; }
  if (b.away) {
    c.away = true;
    if (b.id === "s1-11") c.current = "s1-12";   // the away marker takes over
    c.pendingAt = Infinity;
    if (b.id === "s1-11" && c.seq2Pending) maybeSequence2();
    return b.id;
  }
  const nx = nextBeat(b.id);
  if (nx) schedule(c, nx); else c.pendingAt = Infinity;
  return b.id;
}

export function choose(index) {
  const c = S.chat;
  if (!c || !c.waiting) return null;
  const b = beat(c.current);
  const pick = b && b.choices && b.choices[index];
  if (!pick) return null;
  c.shown.push({ speaker: "player", text: pick.label });
  const from = c.current;
  c.waiting = false;
  c.away = false;
  schedule(c, pick.next);
  return from === "s1-02" ? { cascadeIn: 8000 } : null;
}

export function maybeSequence2() {
  const c = S.chat, sess = S.sessions["sw-l0"];
  if (!c || c.seq !== 1 || !c.sopSeen || !sess || sess.state !== "connected") return false;
  if (c.current !== "s1-12") { c.seq2Pending = true; return false; }
  c.seq2Pending = false;
  c.seq = 2;
  c.waiting = false;
  c.away = false;
  schedule(c, "s2-01");
  return true;
}

export function notifySopOpened() {
  const c = S.chat;
  if (!c) return false;
  const first = !c.sopSeen;
  c.sopSeen = true;
  return maybeSequence2() || first;
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
  maybeSequence2();
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
