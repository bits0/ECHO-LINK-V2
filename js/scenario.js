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

  // Physical floor-plan geometry. The renderer draws whatever this says;
  // a different floor is a different object, not different code.
  floorplan: {
    title: "ASTER FACILITIES — FLOOR 1",
    walls: [
      [-470,-300,  20,-300], [  80,-300, 470,-300],   // top + entrance gap
      [-470, 300, 470, 300],                          // bottom
      [-470,-300,-470, 300],                          // left
      [ 470,-300, 470, 300],                          // right
      [ -30,-300, -30, -20], [ -30,  40, -30, 300],   // staff | corridor
      [ 150,-300, 150,-140], [ 150, -80, 150, 202],
      [ 150, 258, 150, 300],                          // corridor | right block
      [ 150, 110, 470, 110],                          // admin | server
    ],
    doors: [
      { hx:  20, hy:-300, r:60, a0:0,       a1:Math.PI/2 },
      { hx: -30, hy: -20, r:60, a0:0,       a1:Math.PI/2 },
      { hx: 150, hy:-140, r:60, a0:Math.PI, a1:Math.PI*1.5 },
      { hx: 150, hy: 258, r:56, a0:Math.PI, a1:Math.PI*1.5 },
    ],
    labels: [
      { text:"STAFF ROOM", x:-448, y:-276 },
      { text:"SERVER ROOM", x:162, y:132 },
      { text:"ADMINISTRATION", x:452, y:-95, rot:-Math.PI/2, align:"center" },
      { text:"CORRIDOR · CABLE TRAY", x:60, y:0, rot:-Math.PI/2, alpha:.32 },
    ],
    devices: {
      "PC-A":   { x:-390, y: 150, type:"pc" },
      "PC-B":   { x:-390, y: -80, type:"pc" },
      "PC-C":   { x:-150, y: 150, type:"pc" },
      "PC-D":   { x:-180, y:-140, type:"pc" },
      "SRV-01": { x: 205, y: 268, type:"server" },
      "SRV-02": { x: 252, y: 268, type:"server" },
      "RTR-01": { x: 430, y: 150, type:"router" },
    },
    outlets: {
      "OF-01": { x:-380, y: 288, lx:   0, ly: 20, la:"center" },
      "OF-02": { x:-448, y: -80, lx:  12, ly:  3, la:"left" },
      "OF-03": { x:-140, y: 288, lx:   0, ly: 20, la:"center" },
      "OF-04": { x: -34, y:-130, lx: -12, ly:  3, la:"right" },
      "OF-07": { x:-448, y:-240, lx:  12, ly:  3, la:"left" },
    },
    // corridor cable tray: one shared trunk; each run leaves its wall plate
    // horizontally, taps the trunk at that height, rides to its fan-out
    // height, then crosses into the server room and drops to its TRUE jack.
    trunkX: 108,
    fan: { bottom: 212, step: 9 },
    taps: {
      "OF-01": { y: 282, from: [-380, 282] },
      "OF-02": { y: -80, from: [-441, -80] },
      "OF-03": { y: 270, from: [-140, 270] },
      "OF-04": { y:-130, from: [ -29,-130] },
      "OF-07": { y:-240, from: [-441,-240] },
    },
    racks: [
      { id:"A", label:"RACK A", x:165, y:245, w:125, h:50 },
      { id:"B", label:"RACK B — PATCH PANEL", x:300, y:245, w:145, h:50 },
    ],
    jackX: { start: 312, step: 15 },
    portX: { start: 316, span: 104, count: 23 },
    laptop: { x: 310, y: -80 },
    wan: { x0: 448, y: 150, tip: 545 },
    riser: { x: 470, y: -240, label: "CABLE TRAY" },
  },
};

// ---------- Mechanics Lab: same network, one lie in the walls ----------
export const CHAPTER1_LAB = {
  ...CHAPTER1,
  id: "chapter1-lab",
  title: "Chapter 1 — Mechanics Lab",
  cabling: chapter1LabCabling,
};

// ---------- preview sheets: floors with no scenario behind them yet ----------
// A sheet that exists on the drawing board but not in the plant: walls, rooms
// and racks only. No devices, outlets, taps or panel — nothing here is wired,
// so nothing here can answer.
export const PREVIEW_FLOORS = [
  {
    id: "l1",
    label: "L1 — NOC",
    floorplan: {
      title: "LEVEL 1 — NOC & IT OPERATIONS",
      // 4:1 plate, 960 x 240 world units
      walls: [
        [-480,-120, 480,-120], [ -480, 120, 480, 120],
        [-480,-120, -480, 120], [ 480,-120, 480, 120],
        // corridor ceiling (y=70), door gaps for NOC, IT ops, airlock, lift
        [-480, 70, -230, 70], [-170, 70,  -40, 70],
        [ -40, 70,  100, 70], [ 160, 70,  240, 70],
        [ 240, 70,  280, 70], [ 320, 70,  400, 70], [ 440, 70, 480, 70],
        [ -40,-120,  -40, 70],                        // NOC | IT operations
        [ 240,-120,  240, 70],                        // IT operations | VoIP / airlock
        [ 240, -20,  320,-20], [ 356,-20,  360,-20],  // VoIP PBX enclosure
        [ 360,-120,  360, 70],                        // VoIP / airlock | lift
      ],
      doors: [
        { hx:-170, hy: 70, r:60, a0:Math.PI, a1:Math.PI*1.5 },
        { hx: 160, hy: 70, r:60, a0:Math.PI, a1:Math.PI*1.5 },
        { hx: 320, hy: 70, r:40, a0:Math.PI, a1:Math.PI*1.5 },
        { hx: 440, hy: 70, r:40, a0:Math.PI, a1:Math.PI*1.5 },
        { hx: 356, hy:-20, r:36, a0:Math.PI, a1:Math.PI*1.5 },
      ],
      labels: [
        { text:"NOC — CONTROL ROOM", x:-456, y:-92 },
        { text:"IT OPERATIONS", x:-26, y:-92 },
        { text:"VOIP PBX", x:250, y:-98 },
        { text:"AIRLOCK", x:250, y:54 },
        { text:"ELEVATOR / STAIRWELL", x:420, y:-25, rot:-Math.PI/2, align:"center" },
        { text:"CORRIDOR", x:-456, y:100 },
      ],
      racks: [
        { id:"mdf", label:"MDF · CORE SWITCH", x: -10, y:-40, w:120, h:36 },
        { id:"ops", label:"IT-OPS RACK A",      x: 120, y:-40, w:110, h:36 },
        { id:"pbx", label:"VOIP PBX",            x: 246, y:-56, w: 66, h:30 },
      ],
      riser: { x: 520, y: 10, label: "FIBER RISER · L0 / L3" },
    },
  },
];

// The building around the sheets. Floors without a sheet are unsurveyed:
// nothing may be invented for them.
export const FACILITY = {
  id: "complex09",
  title: "COMPLEX 09",
  subtitle: "RESEARCH & OPERATIONS FACILITY",
  floors: [
    { id:"L0", name:"SURFACE & ADMIN",         sub:"Gate · Reception · HR · Finance · IDF", sheet:null },
    { id:"L1", name:"NOC & IT OPERATIONS",     sub:"Network Operations Center · PBX · Syslog/AD", sheet:PREVIEW_FLOORS[0].floorplan },
    { id:"L2", name:"R&D & BIO-LABS",          sub:"Bio-Labs · Cleanroom · IoT · HVAC", sheet:null },
    { id:"L3", name:"MAIN DATA CENTER & CORE", sub:"Core Network · Compute · SAN/NAS · Cooling", sheet:null },
  ],
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
