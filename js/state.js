// ============================================================
// ECHO//LINK — game state, objectives, save/load
// ============================================================
import { activeScenario, CHAPTER1 } from "./scenario.js";

const SAVE_KEY = "echolink-ch1-save-v1";

export function freshState() {
  return {
    started:false,
    mechanicsMode:false,           // story-free sandbox for mechanism testing
    scenarioId: activeScenario.id, // which authored night this state belongs to
    scene:"hallway",               // hallway | server | office | home
    devices: activeScenario.devices(),
    inventoried: [],               // device names recorded in BFree
    poweredOn: [],                 // server-room devices powered on
    jobAccepted:false,
    scopeUpdate:false,             // BFree bonus scope arrived
    metUnknown:false,              // first contact happened
    pcaPingTried:false,            // player tried `ping PC-A` by name
    pcaIpPinged:false,             // player pinged 192.168.1.10 successfully
    pcaDialogueDone:false,
    netspaceSeen:false,            // player opened Network Space before repairs
    pcbFixed:false, pcbVerified:false,
    pcdFixed:false, pcdVerified:false,
    finalChatDone:false,
    reportSubmitted:false,
    emailRead:false, kbRead:false, asterRead:false,
    ended:false,
    chatProgress:{},               // per-conversation step memory
    unread:{ chat:0, mail:0 },
    mail:[],                       // received mail ids
    hintLevel:{},                  // per-objective hint progression
    stats:{ pings:0, fixes:0, startTime:Date.now() },
    muted:false,
  };
}

export let S = freshState();

export function resetState() { S = freshState(); }

// ============================================================
// Cabling model — the active scenario authors the physical layer
// (see scenario.js). state.js only owns the live copy and the
// save/load lifecycle.
// ============================================================

// switch port VLAN plan is defined by the active scenario (see scenario.js)
export function switchPortVlan(portId) {
  return activeScenario.portVlan(portId);
}

// Seed the live physical layer from the active scenario.
export function setupCabling() {
  S.cabling = activeScenario.cabling();
}

// old saves carry no cabling model — rebuild the story-true physical layer
// and honor the legacy PC cable flags.
function migrateLegacyCabling(data) {
  S.cabling = CHAPTER1.cabling();
  const old = data.devices || {};
  for (const [name, id] of [["PC-A","C-PCA"],["PC-B","C-PCB"],["PC-C","C-PCC"],["PC-D","C-PCD"]]) {
    if (old[name] && old[name].cable === false) S.cabling.cables[id].a = null;
  }
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch(e) {}
}
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !data.started) return false;
    S = Object.assign(freshState(), data);
    if (!S.cabling) migrateLegacyCabling(data);
    return true;
  } catch(e) { return false; }
}
export function hasSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return !!(d && d.started && !d.ended);
  } catch(e) { return false; }
}
// story mode is paused — only lab saves may be resumed
export function savedIsLab() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return !!(d && d.mechanicsMode);
  } catch(e) { return false; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch(e) {} }

// ---- user settings (separate from the game save) ----
const SETTINGS_KEY = "echolink-settings-v1";
const SETTINGS_DEFAULTS = { nsRememberView: true };
export function getSettings() {
  try { return Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
  catch(e) { return { ...SETTINGS_DEFAULTS }; }
}
export function setSetting(k, v) {
  const s = getSettings(); s[k] = v;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch(e) {}
}

// ---------- objective list (order = mission log order) ----------
export const OBJECTIVES = [
  { id:"accept",   text:"Accept job BF-1042 in the BFree app" },
  { id:"server",   text:"Inventory & power on the Server Room equipment", sub:"2 servers · 1 switch · 1 router" },
  { id:"pcs",      text:"Inventory the office workstations", sub:"PC-A · PC-B · PC-C · PC-D" },
  { id:"invest",   text:"Investigate the office connectivity problem", sub:"BFree scope update · bonus approved" },
  { id:"netspace", text:"Use PC-C's Network Space to compare the PCs" },
  { id:"fixb",     text:"Restore PC-B and verify with ping" },
  { id:"fixd",     text:"Restore PC-D and verify with ping" },
  { id:"home",     text:"Go home and submit the BFree report" },
];

export function objectiveDone(id) {
  switch(id){
    case "accept":   return S.jobAccepted;
    case "server":   return ["SRV-01","SRV-02","CSW-01","RTR-01"].every(d=>S.inventoried.includes(d) && S.poweredOn.includes(d));
    case "pcs":      return ["PC-A","PC-B","PC-C","PC-D"].every(d=>S.inventoried.includes(d));
    case "invest":   return S.scopeUpdate;
    case "netspace": return S.netspaceSeen;
    case "fixb":     return S.pcbVerified;
    case "fixd":     return S.pcdVerified;
    case "home":     return S.reportSubmitted;
  }
  return false;
}
export function currentObjective() {
  for (const o of OBJECTIVES) if (!objectiveDone(o.id)) return o;
  return null;
}

// One shared in-world clock: three narrative minutes per real minute.
export function worldClock() {
  const elapsed = Math.max(0, Date.now() - (S.stats.startTime || Date.now()));
  const total = (21*60 + 47 + Math.floor(elapsed/20000)) % (24*60);
  return String(Math.floor(total/60)).padStart(2,"0") + ":" + String(total%60).padStart(2,"0");
}
