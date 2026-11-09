// ============================================================
// ECHO//LINK — scenario configuration (the extension seam)
// ------------------------------------------------------------
// A scenario owns everything that makes one night different from
// another: the network policy (player machine, infrastructure,
// addressing, segmentation), the device roster, and the physical
// cabling graph. state.js seeds a fresh game from the active
// scenario; net.js reads its rules from it at call time.
//
// To author a new night: describe a scenario like CHAPTER1 below,
// register it in SCENARIOS, and call setScenario(id) before
// resetState(). Nothing in net.js or state.js needs to change.
//
// Still hand-authored per scenario: scene geometry and Network
// Space positions (scenes.js / netspace.js), and the objective
// list + story beats. Those are the next spaces to open.
// ============================================================

// ---------- Chapter 1 roster (identical in story and lab) ----------
// Factory: every call returns fresh, independent device records so a
// reset can never leak mutations from a previous run.
function chapter1Devices() {
  return {
    "SRV-01": { name:"SRV-01", role:"Server — Aster Facilities (unknown role)", room:"server",
                power:false, nic:true, cable:true, ip:"10.20.0.11", vlan:20, dhcp:false, nameRegistered:false },
    "SRV-02": { name:"SRV-02", role:"Server — Aster Facilities (unknown role)", room:"server",
                power:false, nic:true, cable:true, ip:"10.20.0.12", vlan:20, dhcp:false, nameRegistered:false },
    "CSW-01": { name:"CSW-01", role:"Switch — 24-port, managed", room:"server",
                power:false, nic:true, cable:true, ip:null, vlan:null, dhcp:false, nameRegistered:false },
    "RTR-01": { name:"RTR-01", role:"Router — Aster edge (consumer grade)", room:"server",
                power:false, nic:true, cable:true, ip:"192.168.1.1", vlan:10, dhcp:false, nameRegistered:false,
                note:"Runs DHCP and DNS for the office network." },
    "PC-A":   { name:"PC-A", role:"Staff workstation — someone uses this one", room:"office",
                power:true, nic:true, cable:true, ip:"192.168.1.10", vlan:10, dhcp:false, nameRegistered:false,
                note:"Static IP — configured by hand. The router never learned its name." },
    "PC-B":   { name:"PC-B", role:"Staff workstation", room:"office",
                power:true, nic:false, cable:true, ip:"192.168.1.11", vlan:10, dhcp:true, nameRegistered:true },
    "PC-C":   { name:"PC-C", role:"Staff workstation — the one you're using", room:"office",
                power:true, nic:true, cable:true, ip:"192.168.1.12", vlan:10, dhcp:true, nameRegistered:true },
    "PC-D":   { name:"PC-D", role:"Staff workstation", room:"office",
                power:true, nic:true, cable:false, ip:"192.168.1.13", vlan:10, dhcp:true, nameRegistered:true },
  };
}

// ---------- Chapter 1 physical layer (story-true) ----------
// Ports and cable segments, not animations. A physical path is:
// PC NIC → long cable → wall outlet → hidden building run →
// patch-panel jack → patch lead → switch port.
// Outlet labels are honest; panel PRINTED labels can lie — a jack's
// continuity light always tells the truth.
// Port addresses: "PC-D:nic" · "OF-04:sock" · "PP-04:jack" · "CSW-01:p04"
function chapter1Cabling() {
  return {
    // wall outlets in the office. label (printed on the plate) is always truthful.
    outlets: { "OF-01":{}, "OF-02":{}, "OF-03":{}, "OF-04":{}, "OF-07":{} },
    // hidden building wiring — the TRUTH: outlet → patch-panel jack.
    runs: { "OF-01":"PP-01", "OF-02":"PP-02", "OF-03":"PP-03", "OF-04":"PP-04", "OF-07":"PP-07" },
    // patch panel jacks and their PRINTED labels — labels claim, runs know.
    panel: {
      "PP-01":{printed:"OF-01"}, "PP-02":{printed:"OF-02"}, "PP-03":{printed:"OF-03"},
      "PP-04":{printed:"OF-04"}, "PP-05":{printed:"OF-05"}, "PP-06":{printed:"OF-06"},
      "PP-07":{printed:"OF-07"}, "PP-08":{printed:"OF-08"},
    },
    cables: {
      "C-PCA":    { kind:"long",  a:"PC-A:nic",    b:"OF-01:sock", intact:true },
      "C-PCB":    { kind:"long",  a:"PC-B:nic",    b:"OF-02:sock", intact:true },
      "C-PCC":    { kind:"long",  a:"PC-C:nic",    b:"OF-03:sock", intact:true },
      "C-PCD":    { kind:"long",  a:null,          b:"OF-04:sock", intact:true }, // story: loose at the PC
      "C-SRV1":   { kind:"patch", a:"SRV-01:nic",  b:"CSW-01:p09", intact:true },
      "C-SRV2":   { kind:"patch", a:"SRV-02:nic",  b:"CSW-01:p10", intact:true },
      "C-UPLINK": { kind:"patch", a:"RTR-01:lan1", b:"CSW-01:p24", intact:true },
      "C-PATCH-1":{ kind:"patch", a:"PP-01:jack",  b:"CSW-01:p01", intact:true },
      "C-PATCH-2":{ kind:"patch", a:"PP-02:jack",  b:"CSW-01:p02", intact:true },
      "C-PATCH-3":{ kind:"patch", a:"PP-03:jack",  b:"CSW-01:p03", intact:true },
      "C-PATCH-4":{ kind:"patch", a:"PP-04:jack",  b:"CSW-01:p04", intact:true },
      "C-SPARE-1":{ kind:"patch", a:null,          b:null,         intact:true },
      "C-SPARE-2":{ kind:"patch", a:null,          b:null,         intact:true },
    },
  };
}

// The lab's fault hides in the walls: OF-04's true run lands on PP-07
// while the panel insists PP-04, and the patch lead sits in the labeled
// port. PC-D looks completely normal from the desk.
function chapter1LabCabling() {
  const c = chapter1Cabling();
  c.runs["OF-04"] = "PP-07";
  c.runs["OF-07"] = "PP-04";
  c.cables["C-PCD"].a = "PC-D:nic";   // seated at both ends
  return c;
}

// ---------- Chapter 1: the story scenario ----------
export const CHAPTER1 = {
  id: "chapter1-inventory",
  title: "Chapter 1 — The Inventory",

  // The machine the player works from: terminal source address, ipconfig,
  // and the origin whose segment defines what is reachable.
  player: "PC-C",

  // Infrastructure identities. The simulation asks the scenario which
  // device is the switch / router rather than hard-coding the names.
  switch: "CSW-01",
  router: "RTR-01",

  // Player-side addressing shown by ipconfig / used as the gateway.
  gatewayIp: "192.168.1.1",
  subnetMask: "255.255.255.0",
  dnsSuffix: "aster.local",

  // Segmentation policy.
  playerVlan: 10,          // the segment the player's machine lives on
  serverVlan: 20,          // the segment servers belong to (default before patching)
  interVlanRouting: false, // whether traffic is allowed to cross segments

  // Switch port → VLAN plan. Office ports default to 10; the two server
  // ports are 20. A different scenario just supplies a different plan.
  portVlan(portId) {
    return (portId === "p09" || portId === "p10") ? 20 : 10;
  },

  // Naming conventions that tie a device to its cable in the cabling graph.
  pcCableId(name)     { return "C-PC" + name.slice(-1); },
  serverCableId(name) { return name === "SRV-01" ? "C-SRV1" : "C-SRV2"; },

  // Device-kind predicates used by tracing, continuity and the view.
  isPC(name)     { return /^PC-[A-D]$/.test(name); },
  isServer(name) { return /^SRV-\d+$/.test(name); },

  // Can the player's machine reach a device on this VLAN? With no
  // inter-VLAN routing, only the player's own segment is reachable.
  reachesVlan(vlan) {
    return this.interVlanRouting || vlan === this.playerVlan;
  },

  // What exists tonight.
  devices: chapter1Devices,
  cabling: chapter1Cabling,
};

// ---------- Mechanics Lab: same network, one lie in the walls ----------
export const CHAPTER1_LAB = {
  ...CHAPTER1,
  id: "chapter1-lab",
  title: "Chapter 1 — Mechanics Lab",
  cabling: chapter1LabCabling,
};

// Registry of authored scenarios. Add new entries here as they are built.
export const SCENARIOS = {
  [CHAPTER1.id]: CHAPTER1,
  [CHAPTER1_LAB.id]: CHAPTER1_LAB,
};

// Live binding: importers see reassignment done through setScenario.
export let activeScenario = CHAPTER1;

export function setScenario(scenarioOrId) {
  const next = typeof scenarioOrId === "string" ? SCENARIOS[scenarioOrId] : scenarioOrId;
  if (!next) throw new Error("Unknown scenario: " + scenarioOrId);
  activeScenario = next;
  return activeScenario;
}
