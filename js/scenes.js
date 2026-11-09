// ============================================================
// ECHO//LINK — first-person scene views (monochrome line-art, v2 polish)
// Scenes: hallway · server room · staff offices · home
// ============================================================
import { S, worldClock } from "./state.js";
import { cableAt, runContinuity } from "./net.js";

// shared defs: gradients & filters used by all scenes
function defs() {
  return `<defs>
    <radialGradient id="lightCone" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#3a4250" stop-opacity=".22"/>
      <stop offset="100%" stop-color="#3a4250" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floorSheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1f27" stop-opacity="0"/>
      <stop offset="100%" stop-color="#232a35" stop-opacity=".25"/>
    </linearGradient>
    <linearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#26313f"/>
      <stop offset="100%" stop-color="#141c26"/>
    </linearGradient>
    <radialGradient id="coldAmb" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#182030" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#0a0c0f" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cityGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0d12"/>
      <stop offset="100%" stop-color="#1b2330"/>
    </linearGradient>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

function ledRow(x, y, n, on, cls="") {
  let out = "";
  for (let i = 0; i < n; i++) {
    const lit = on && (i % 3 !== 2);
    out += `<circle cx="${x + i*10}" cy="${y}" r="2.4" class="${lit ? "led led-on "+cls : "led"}" style="animation-delay:${(i*0.37)%2}s" ${lit?'filter="url(#softGlow)"':""}/>`;
  }
  return out;
}

function hotspot(id, label, x, y, w, h) {
  return `<g class="hotspot" data-hs="${id}" data-label="${label}">
    <rect class="hs-glow" x="${x}" y="${y}" width="${w}" height="${h}" fill="#e0a13e" opacity="0"/>
    <rect class="hs-outline" x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#9aa4b2" stroke-width="1.2" stroke-dasharray="5 4" opacity="0"/>
  </g>`;
}

// wall texture: faint vertical panel seams
function wallSeams(x0, x1, y0, y1, step=110) {
  let s = "";
  for (let x = x0; x <= x1; x += step) s += `<line class="ln-faint" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/>`;
  return s;
}

// ---------- SCENE: HALLWAY ----------
export function hallwaySVG() {
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  ${defs()}
  <rect width="1600" height="900" fill="#0a0c0f"/>

  <!-- back wall -->
  <rect x="700" y="370" width="200" height="60" fill="#0d1015"/>
  ${wallSeams(705, 895, 372, 428, 40)}

  <!-- corridor perspective: walls -->
  <polygon points="0,60 700,380 700,430 0,900" fill="#0d1015"/>
  <polygon points="1600,60 900,380 900,430 1600,900" fill="#0c0f13"/>
  ${wallSeams(60, 660, 200, 700, 130)}
  <!-- floor -->
  <polygon points="0,900 700,430 900,430 1600,900" fill="#0b0e12"/>
  <polygon points="0,900 700,430 900,430 1600,900" fill="url(#floorSheen)"/>
  <line class="ln-dim" x1="0" y1="900" x2="700" y2="430"/>
  <line class="ln-dim" x1="1600" y1="900" x2="900" y2="430"/>
  <!-- floor guide lights -->
  <g opacity=".7">
    <ellipse cx="660" cy="760" rx="10" ry="3" fill="#232a35"/><ellipse cx="700" cy="640" rx="7" ry="2.4" fill="#232a35"/>
    <ellipse cx="728" cy="550" rx="5" ry="2" fill="#232a35"/><ellipse cx="748" cy="480" rx="4" ry="1.6" fill="#232a35"/>
    <ellipse cx="940" cy="760" rx="10" ry="3" fill="#232a35"/><ellipse cx="900" cy="640" rx="7" ry="2.4" fill="#232a35"/>
    <ellipse cx="872" cy="550" rx="5" ry="2" fill="#232a35"/><ellipse cx="852" cy="480" rx="4" ry="1.6" fill="#232a35"/>
  </g>

  <!-- ceiling + light strip + cones -->
  <polygon points="0,60 700,380 900,380 1600,60" fill="#090b0e"/>
  <rect x="720" y="70" width="160" height="7" fill="#39404d"/>
  <rect x="745" y="70" width="110" height="7" fill="#4a5262" filter="url(#softGlow)"/>
  <polygon points="745,77 655,420 945,420 855,77" fill="url(#lightCone)"/>
  <rect x="760" y="200" width="80" height="5" fill="#333b48"/>
  <polygon points="760,205 706,400 894,400 840,205" fill="url(#lightCone)" opacity=".7"/>

  <!-- LEFT DOOR: server room (frame + depth + spill) -->
  <g>
    <rect x="168" y="258" width="284" height="504" fill="#090b0e"/>
    <rect class="ln" x="180" y="270" width="260" height="480" fill="#10131a"/>
    <rect class="ln-dim" x="200" y="292" width="220" height="436"/>
    <line class="ln-faint" x1="310" y1="292" x2="310" y2="728"/>
    <rect x="214" y="300" width="192" height="420" fill="none" stroke="#171c24" stroke-width="6"/>
    <circle class="ln" cx="410" cy="520" r="6" fill="#12151b"/>
    <circle cx="410" cy="520" r="2" fill="#3a4250"/>
    <rect x="228" y="330" width="60" height="26" fill="#0c0f13" stroke="#262c36"/>
    <text x="258" y="348" text-anchor="middle" font-size="10" fill="#3d434e">SR-01</text>
    <rect x="180" y="744" width="260" height="6" fill="#1a2230" opacity=".8"/> <!-- cold spill under door -->
    <text x="310" y="250" text-anchor="middle" font-size="17" fill="#6b7484">SERVER ROOM</text>
    <text x="310" y="790" text-anchor="middle" font-size="10" opacity=".6">ASTER FACILITIES · FLOOR 1</text>
  </g>
  ${hotspot("door:server","ENTER — SERVER ROOM",180,270,260,480)}

  <!-- RIGHT DOOR: staff offices (warm spill) -->
  <g>
    <rect x="1148" y="258" width="284" height="504" fill="#090b0e"/>
    <rect class="ln" x="1160" y="270" width="260" height="480" fill="#10131a"/>
    <rect class="ln-dim" x="1180" y="292" width="220" height="436"/>
    <rect x="1194" y="300" width="192" height="420" fill="none" stroke="#171c24" stroke-width="6"/>
    <circle class="ln" cx="1190" cy="520" r="6" fill="#12151b"/>
    <circle cx="1190" cy="520" r="2" fill="#3a4250"/>
    <rect x="1330" y="330" width="60" height="26" fill="#0c0f13" stroke="#262c36"/>
    <text x="1360" y="348" text-anchor="middle" font-size="10" fill="#3d434e">OF-02</text>
    <rect x="1160" y="744" width="260" height="5" fill="#2a2a24" opacity=".9"/>
    <text x="1290" y="250" text-anchor="middle" font-size="17" fill="#6b7484">STAFF OFFICES</text>
  </g>
  ${hotspot("door:office","ENTER — STAFF OFFICES",1160,270,260,480)}

  <!-- CENTER: exit doors -->
  <g>
    <rect x="722" y="422" width="156" height="316" fill="#080a0d"/>
    <rect class="ln-dim" x="730" y="430" width="140" height="300" fill="#0c0e12"/>
    <line class="ln-dim" x1="800" y1="430" x2="800" y2="730"/>
    <line class="ln-faint" x1="752" y1="430" x2="752" y2="730"/>
    <line class="ln-faint" x1="848" y1="430" x2="848" y2="730"/>
    <rect x="742" y="394" width="116" height="26" fill="#0d1310" stroke="#223126"/>
    <text x="800" y="412" text-anchor="middle" font-size="13" class="exit-sign">EXIT</text>
    <polygon points="800,420 770,510 830,510" fill="url(#lightCone)" opacity=".4"/>
  </g>
  ${hotspot("door:exit","LEAVE — HEAD HOME",730,430,140,300)}

  <!-- notice board left of center -->
  <g opacity=".75">
    <rect class="ln-dim" x="540" y="380" width="90" height="120" fill="#0d1015"/>
    <rect x="550" y="392" width="30" height="40" fill="#141922"/><rect x="586" y="392" width="32" height="52" fill="#12161d"/>
    <rect x="550" y="440" width="30" height="48" fill="#11151c"/>
  </g>
  <!-- fire extinguisher right -->
  <g opacity=".7">
    <rect x="1000" y="470" width="18" height="48" rx="6" fill="#151a22" stroke="#262c36"/>
    <line class="ln-faint" x1="1009" y1="470" x2="1009" y2="460"/>
  </g>

  <text x="800" y="864" text-anchor="middle" font-size="11" opacity=".45">BFREE JOB BF-1042 · EQUIPMENT INVENTORY</text>
  </svg>`;
}

// ---------- SCENE: SERVER ROOM ----------
export function serverRoomSVG() {
  const p = n => S.poweredOn.includes(n);
  const anyOn = p("CSW-01") || p("RTR-01") || p("SRV-01") || p("SRV-02");
  const unit = (name, x, y, role) => `
    <g>
      <rect x="${x-8}" y="${y-8}" width="376" height="126" rx="5" fill="#090b0e"/>
      <rect class="ln ${p(name)?"":"ln-dim"}" x="${x}" y="${y}" width="360" height="110" rx="3" fill="#0e1116"/>
      <!-- vent grille -->
      ${Array.from({length:5},(_,i)=>`<rect x="${x+26}" y="${y+72+i*6}" width="120" height="2" fill="#171c24"/>`).join("")}
      ${ledRow(x+30, y+30, 8, p(name))}
      <text x="${x+30}" y="${y+56}" font-size="15" class="${p(name)?"svg-on":"svg-off"}">${name}</text>
      <text x="${x+330}" y="${y+56}" font-size="10" text-anchor="end" opacity=".6">${p(name)?role:"POWERED DOWN"}</text>
      <rect x="${x+300}" y="${y+22}" width="34" height="16" rx="2" fill="#0a0c0f" stroke="${p(name)?"#3d6b49":"#262c36"}"/>
      <circle cx="${x+334}" cy="${y+30}" r="2.5" class="${p(name)?"led led-on":"led"}"/>
      ${hotspot("device:"+name, name+" — "+(name.startsWith("SRV")?"SERVER":name.startsWith("CSW")?"SWITCH":"ROUTER"), x, y, 360, 110)}
    </g>`;
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  ${defs()}
  <rect width="1600" height="900" fill="#090b0e"/>
  <rect width="1600" height="900" fill="url(#coldAmb)"/>

  <!-- ceiling pipes + cable trays -->
  <line class="ln-dim" x1="0" y1="130" x2="1600" y2="130"/>
  <line class="ln-faint" x1="0" y1="140" x2="1600" y2="140"/>
  <line class="ln-faint" x1="0" y1="122" x2="1600" y2="122"/>
  <rect x="300" y="60" width="1000" height="10" fill="#10141a"/>
  ${wallSeams(60, 1540, 150, 800, 170)}
  <text x="800" y="52" text-anchor="middle" font-size="15" letter-spacing=".4em" fill="#7a8392">SERVER ROOM</text>
  <text x="800" y="100" text-anchor="middle" font-size="10" opacity=".5">AUTHORIZED PERSONNEL · INVENTORY ONLY</text>

  <!-- floor: raised tiles -->
  <line class="ln-dim" x1="0" y1="820" x2="1600" y2="820"/>
  <g opacity=".35">
    ${Array.from({length:9},(_,i)=>`<line class="ln-faint" x1="${140+i*160}" y1="820" x2="${60+i*190}" y2="900"/>`).join("")}
    <line class="ln-faint" x1="0" y1="860" x2="1600" y2="860"/>
  </g>

  <!-- RACK A -->
  <g>
    <rect x="316" y="146" width="448" height="648" rx="6" fill="#08090c"/>
    <rect class="fill-panel ln" x="330" y="160" width="420" height="620" rx="4"/>
    <!-- mesh door -->
    ${Array.from({length:22},(_,i)=>`<line class="ln-faint" x1="336" y1="${176+i*26}" x2="744" y2="${176+i*26}" opacity=".5"/>`).join("")}
    <rect x="740" y="440" width="6" height="70" rx="3" fill="#1c222b"/>
    ${unit("SRV-01", 360, 270, "RUNNING")}
    ${unit("SRV-02", 360, 410, "RUNNING")}
    <text x="540" y="764" text-anchor="middle" font-size="10" opacity=".5">RACK A</text>
  </g>

  <!-- RACK B -->
  <g>
    <rect x="836" y="146" width="448" height="648" rx="6" fill="#08090c"/>
    <rect class="fill-panel ln" x="850" y="160" width="420" height="620" rx="4"/>
    ${Array.from({length:22},(_,i)=>`<line class="ln-faint" x1="856" y1="${176+i*26}" x2="1264" y2="${176+i*26}" opacity=".5"/>`).join("")}
    <rect x="860" y="440" width="6" height="70" rx="3" fill="#1c222b"/>
    ${unit("CSW-01", 880, 270, "SWITCHING")}
    ${unit("RTR-01", 880, 410, "ROUTING")}
    <!-- patch panel: passive, 8 office runs -->
    <g>
      <rect x="872" y="542" width="376" height="126" rx="5" fill="#090b0e"/>
      <rect class="ln" x="880" y="550" width="360" height="110" rx="3" fill="#0e1116"/>
      <text x="896" y="576" font-size="13" class="svg-on">PATCH PANEL</text>
      <text x="1224" y="576" font-size="9" text-anchor="end" opacity=".6">OFFICE RUNS · PASSIVE</text>
      ${Array.from({length:8},(_,i)=>{
        const jack = "PP-0"+(i+1);
        const live = S.cabling ? runContinuity(jack) : null;
        const printed = S.cabling ? S.cabling.panel[jack].printed : "";
        const disagree = live && live.outlet !== printed && !cableAt(jack + ":jack");
        const led = live ? (disagree ? "#e0a13e" : "#79c98d") : "#3a4250";
        return `<g>
        <circle cx="${910+i*41}" cy="585" r="2.4" fill="${led}" ${live ? 'class="pj-led-scene"' : ""}/>
        <rect x="${896+i*41}" y="590" width="28" height="26" rx="2" fill="#0a0d11" stroke="${disagree ? "#e0a13e" : "#2c3440"}"/>
        <text x="${910+i*41}" y="632" text-anchor="middle" font-size="7.5" opacity=".55">PP-0${i+1}</text>
      </g>`;}).join("")}
      ${hotspot("device:panel","PATCH PANEL — OFFICE RUNS",880,550,360,110)}
    </g>
    <text x="1060" y="764" text-anchor="middle" font-size="10" opacity=".5">RACK B</text>
  </g>

  <!-- cable dressing between racks -->
  <g opacity=".6">
    <path class="ln-dim" d="M 750 320 C 800 320 800 330 850 330"/>
    <path class="ln-dim" d="M 750 460 C 810 460 790 470 850 470"/>
    <path class="ln-faint" d="M 750 336 C 806 336 796 346 850 346"/>
    <path class="ln-faint" d="M 750 350 C 812 350 792 360 850 360"/>
    <path class="ln-faint" d="M 750 476 C 816 476 786 486 850 486"/>
  </g>
  ${anyOn ? `<ellipse cx="800" cy="880" rx="500" ry="60" fill="#1c2733" opacity=".12"/>` : ""}

  <!-- door back -->
  <g>
    <rect x="52" y="372" width="136" height="316" fill="#080a0d"/>
    <rect class="ln-dim" x="60" y="380" width="120" height="300" fill="#0c0e12"/>
    <rect class="ln-faint" x="70" y="392" width="100" height="276"/>
    <text x="120" y="712" text-anchor="middle" font-size="12" opacity=".7">HALLWAY</text>
  </g>
  ${hotspot("door:hallway","BACK — HALLWAY",60,380,120,300)}
  </svg>`;
}

// ---------- SCENE: STAFF OFFICES ----------
export function officeSVG() {
  const desk = (name, x, y, s) => {
    const d = S.devices[name];
    const scr = d.power ? "url(#screenGlow)" : "#0d1014";
    return `<g>
      <!-- chair silhouette behind -->
      <path d="M ${x+140*s} ${y-160*s} q 30 ${-14*s} 60 0 l 0 ${60*s} l ${-60*s} 0 z" fill="#0c0f13" stroke="#1c222b" opacity=".8"/>
      <!-- monitor -->
      <rect class="ln ${d.power?"monitor-on":""}" x="${x+105*s}" y="${y-92*s}" width="${120*s}" height="${76*s}" rx="3" fill="${scr}"/>
      ${d.power ? `<g opacity=".35">
        <rect x="${x+112*s}" y="${y-84*s}" width="${70*s}" height="3" fill="#5b6472"/>
        <rect x="${x+112*s}" y="${y-76*s}" width="${96*s}" height="2.4" fill="#4a5262"/>
        <rect x="${x+112*s}" y="${y-68*s}" width="${82*s}" height="2.4" fill="#4a5262"/>
        <rect x="${x+112*s}" y="${y-60*s}" width="${90*s}" height="2.4" fill="#4a5262"/>
        <rect x="${x+112*s}" y="${y-52*s}" width="${60*s}" height="2.4" fill="#4a5262"/>
      </g>` : ""}
      <line class="ln-dim" x1="${x+165*s}" y1="${y-16*s}" x2="${x+165*s}" y2="${y}"/>
      <ellipse cx="${x+165*s}" cy="${y-2*s}" rx="${34*s}" ry="${4*s}" fill="#12161d"/>
      <!-- keyboard + mouse + papers -->
      <rect x="${x+120*s}" y="${y+3*s}" width="${90*s}" height="${10*s}" rx="2" fill="#10141a" stroke="#1c222b"/>
      <ellipse cx="${x+228*s}" cy="${y+8*s}" rx="${7*s}" ry="${5*s}" fill="#10141a" stroke="#1c222b"/>
      <rect x="${x+30*s}" y="${y+2*s}" width="${36*s}" height="${12*s}" fill="#141922" opacity=".8"/>
      <!-- tower -->
      <rect class="ln-dim" x="${x+245*s}" y="${y-40*s}" width="${34*s}" height="${56*s}" fill="#0e1116"/>
      <circle cx="${x+262*s}" cy="${y-28*s}" r="2.6" class="${d.power?"led led-on":"led"}"/>
      <!-- desk -->
      <rect class="fill-panel ln" x="${x}" y="${y}" width="${330*s}" height="${16*s}"/>
      <line class="ln-dim" x1="${x+20*s}" y1="${y+16*s}" x2="${x+14*s}" y2="${y+120*s}"/>
      <line class="ln-dim" x1="${x+310*s}" y1="${y+16*s}" x2="${x+316*s}" y2="${y+120*s}"/>
      <line class="ln-faint" x1="${x+60*s}" y1="${y+16*s}" x2="${x+58*s}" y2="${y+120*s}"/>
      <line class="ln-faint" x1="${x+270*s}" y1="${y+16*s}" x2="${x+274*s}" y2="${y+120*s}"/>
      <text x="${x+165*s}" y="${y+36*s}" text-anchor="middle" font-size="${14*s}" class="${d.power?"svg-on":"svg-off"}">${name}</text>
      ${hotspot("device:"+name, name+" — WORKSTATION", x, y-100*s, 330*s, 250*s)}
    </g>`;
  };
  // labeled wall plate: label truthful, run hidden, dot = cable seated here
  const outletPlate = (id, x, y) => {
    const inUse = S.cabling && !!cableAt(id + ":sock");
    return `<g>
      <rect x="${x}" y="${y}" width="64" height="42" rx="3" fill="#10141a" stroke="#2c3440" stroke-width="1.2"/>
      <rect x="${x+18}" y="${y+9}" width="28" height="18" rx="2" fill="#0b0e12" stroke="#262c36"/>
      <circle cx="${x+53}" cy="${y+11}" r="2.2" fill="${inUse ? "#9aa4b2" : "#3a4250"}"/>
      <text x="${x+32}" y="${y+36}" text-anchor="middle" font-size="9" fill="#5b6472">${id}</text>
      ${hotspot("outlet:"+id, id+" — WALL OUTLET", x-4, y-4, 72, 50)}
    </g>`;
  };
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  ${defs()}
  <rect width="1600" height="900" fill="#0a0c0f"/>
  ${wallSeams(40, 1560, 60, 500, 150)}

  <!-- window: night city with depth -->
  <rect x="552" y="82" width="496" height="256" fill="#07090c"/>
  <rect class="ln-dim" x="560" y="90" width="480" height="240" fill="url(#cityGlow)"/>
  <g opacity=".35">
    <rect x="580" y="230" width="26" height="100" fill="#141b26"/><rect x="612" y="200" width="20" height="130" fill="#121822"/>
    <rect x="880" y="220" width="30" height="110" fill="#141b26"/><rect x="916" y="190" width="22" height="140" fill="#121822"/>
    <rect x="950" y="240" width="18" height="90" fill="#141b26"/><rect x="640" y="250" width="16" height="80" fill="#141b26"/>
  </g>
  <g opacity=".7">
    <circle cx="640" cy="150" r="1.6" fill="#4a5262"/><circle cx="730" cy="250" r="1.6" fill="#3a4250"/>
    <circle cx="880" cy="140" r="1.6" fill="#4a5262"/><circle cx="960" cy="240" r="1.6" fill="#3a4250"/>
    <circle cx="700" cy="180" r="1.4" fill="#3a4250"/><circle cx="920" cy="180" r="1.4" fill="#3a4250"/>
    <circle cx="600" cy="200" r="1.2" fill="#3a4250"/><circle cx="990" cy="160" r="1.2" fill="#4a5262"/>
    <circle cx="800" cy="130" r="1.3" fill="#3a4250"/><circle cx="840" cy="270" r="1.2" fill="#3a4250"/>
  </g>
  <line class="ln-dim" x1="800" y1="90" x2="800" y2="330"/>
  <line class="ln-dim" x1="560" y1="210" x2="1040" y2="210"/>
  <!-- blinds -->
  <g opacity=".4">${Array.from({length:7},(_,i)=>`<line class="ln-faint" x1="560" y1="${98+i*10}" x2="1040" y2="${98+i*10}"/>`).join("")}</g>
  <text x="800" y="58" text-anchor="middle" font-size="15" letter-spacing=".4em" fill="#7a8392">STAFF OFFICES</text>

  <!-- floor -->
  <polygon points="0,900 700,430 900,430 1600,900" fill="#0b0e12"/>
  <polygon points="0,900 700,430 900,430 1600,900" fill="url(#floorSheen)"/>
  <line class="ln-dim" x1="0" y1="880" x2="700" y2="430"/>
  <line class="ln-dim" x1="1600" y1="880" x2="900" y2="430"/>
  <line class="ln-dim" x1="0" y1="520" x2="1600" y2="520" opacity=".4"/>
  <!-- ceiling light cone -->
  <rect x="700" y="20" width="200" height="6" fill="#39404d"/>
  <polygon points="700,26 560,500 1040,500 900,26" fill="url(#lightCone)" opacity=".8"/>

  <!-- plant in corner -->
  <g opacity=".7">
    <rect x="1470" y="470" width="40" height="46" fill="#10141a" stroke="#1c222b"/>
    <path d="M 1490 470 q -30 -50 -18 -80 q 22 30 18 80 M 1490 470 q 4 -60 26 -76 q -2 44 -26 76 M 1490 470 q -6 -34 -30 -44 q 8 30 30 44" fill="#161d18" stroke="#232e26"/>
  </g>

  ${desk("PC-B", 180, 470, 0.78)}
  ${desk("PC-D", 1090, 470, 0.78)}
  ${desk("PC-A", 120, 640, 1.06)}
  ${desk("PC-C", 1030, 640, 1.06)}

  <!-- wall outlets: labeled plates, honest labels, hidden runs -->
  ${outletPlate("OF-02", 460, 492)}
  ${outletPlate("OF-04", 1355, 492)}
  ${outletPlate("OF-07", 70, 300)}
  ${outletPlate("OF-01", 500, 756)}
  ${outletPlate("OF-03", 962, 756)}

  <!-- back to hallway -->
  <g>
    <rect x="732" y="352" width="136" height="86" fill="#080a0d"/>
    <rect class="ln-dim" x="740" y="360" width="120" height="70" fill="#0c0e12"/>
    <text x="800" y="402" text-anchor="middle" font-size="11" opacity=".7">HALLWAY →</text>
  </g>
  ${hotspot("door:hallway","BACK — HALLWAY",740,360,120,70)}
  </svg>`;
}

// ---------- SCENE: HOME ----------
export function homeSVG() {
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  ${defs()}
  <rect width="1600" height="900" fill="#08090c"/>

  <!-- window with layered city -->
  <rect x="172" y="112" width="396" height="436" fill="#06080b"/>
  <rect class="ln-dim" x="180" y="120" width="380" height="420" fill="url(#cityGlow)"/>
  <g opacity=".4">
    <rect x="200" y="360" width="34" height="180" fill="#141b26"/><rect x="242" y="300" width="26" height="240" fill="#121822"/>
    <rect x="400" y="340" width="40" height="200" fill="#141b26"/><rect x="450" y="280" width="24" height="260" fill="#121822"/>
    <rect x="486" y="400" width="30" height="140" fill="#141b26"/><rect x="300" y="420" width="28" height="120" fill="#141b26"/>
  </g>
  <g opacity=".7">
    <circle cx="240" cy="180" r="1.8" fill="#4a5262"/><circle cx="300" cy="260" r="1.5" fill="#3a4250"/>
    <circle cx="430" cy="200" r="1.8" fill="#4a5262"/><circle cx="490" cy="300" r="1.4" fill="#3a4250"/>
    <circle cx="260" cy="400" r="1.6" fill="#3a4250"/><circle cx="460" cy="440" r="1.7" fill="#4a5262"/>
    <circle cx="350" cy="470" r="1.3" fill="#3a4250"/><circle cx="510" cy="170" r="1.3" fill="#3a4250"/>
    <circle cx="215" cy="300" r="1.2" fill="#3a4250"/><circle cx="390" cy="150" r="1.3" fill="#4a5262"/>
  </g>
  <line class="ln-dim" x1="370" y1="120" x2="370" y2="540"/>
  <line class="ln-dim" x1="180" y1="330" x2="560" y2="330"/>
  <text x="370" y="88" text-anchor="middle" font-size="13" letter-spacing=".4em" fill="#6b7484">HOME · ${worldClock()}</text>

  <!-- bookshelf silhouette -->
  <g opacity=".8">
    <rect class="ln-dim" x="660" y="180" width="150" height="400" fill="#0b0e12"/>
    ${[0,1,2,3].map(i=>`<line class="ln-faint" x1="660" y1="${260+i*80}" x2="810" y2="${260+i*80}"/>`).join("")}
    ${[0,1,2].map(r=>[0,1,2,3,4].map(c=>`<rect x="${670+c*27}" y="${216+r*80}" width="${14+(c%3)*4}" height="42" fill="#${c%2?"12161d":"151a23"}"/>`).join("")).join("")}
  </g>

  <!-- rug -->
  <ellipse cx="1080" cy="800" rx="380" ry="46" fill="#0d1015" stroke="#171c24" opacity=".8"/>
  <ellipse cx="1080" cy="800" rx="330" ry="36" fill="none" stroke="#141922"/>

  <!-- desk -->
  <rect x="806" y="548" width="588" height="34" rx="4" fill="#0c0f13"/>
  <rect class="fill-panel ln" x="820" y="560" width="560" height="20"/>
  <line class="ln-dim" x1="850" y1="580" x2="840" y2="760"/>
  <line class="ln-dim" x1="1350" y1="580" x2="1360" y2="760"/>

  <!-- laptop -->
  <g>
    <rect class="ln monitor-on" x="990" y="400" width="220" height="140" rx="5" fill="url(#screenGlow)"/>
    <g opacity=".45">
      <rect x="1010" y="420" width="110" height="4" fill="#5b6472"/>
      <rect x="1010" y="432" width="160" height="3" fill="#4a5262"/>
      <rect x="1010" y="442" width="140" height="3" fill="#4a5262"/>
      <rect x="1010" y="500" width="180" height="10" rx="2" fill="#1a2432"/>
    </g>
    <text x="1100" y="468" text-anchor="middle" font-size="12" fill="#6b7484">BFREE</text>
    <rect x="1060" y="540" width="80" height="20" fill="#10141a" stroke="#262c36"/>
    <rect x="960" y="556" width="280" height="8" rx="3" fill="#141922"/>
  </g>
  ${hotspot("home:laptop","LAPTOP — SUBMIT BFREE REPORT",990,400,220,160)}

  <!-- mug with steam -->
  <rect class="ln-dim" x="1260" y="528" width="34" height="32" fill="#0e1116"/>
  <path class="ln-dim" d="M 1294 536 q 18 6 0 18"/>
  <path class="ln-faint" d="M 1272 514 q 4 -8 0 -14 M 1282 516 q 4 -8 0 -14" opacity=".6"/>

  <!-- small plant -->
  <g opacity=".7">
    <rect x="880" y="530" width="26" height="26" fill="#10141a" stroke="#1c222b"/>
    <path d="M 893 530 q -18 -30 -10 -46 q 12 18 10 46 M 893 530 q 2 -36 16 -44 q 0 26 -16 44" fill="#161d18" stroke="#232e26"/>
  </g>

  <text x="1100" y="850" text-anchor="middle" font-size="11" opacity=".5">A QUIET EVENING · THE JOB IS DONE</text>
  </svg>`;
}

// ---------- scene registry ----------
export const SCENES = {
  hallway: { svg: hallwaySVG,    label: "ASTER FACILITIES — FLOOR 1 HALLWAY" },
  server:  { svg: serverRoomSVG, label: "SERVER ROOM" },
  office:  { svg: officeSVG,     label: "STAFF OFFICES" },
  home:    { svg: homeSVG,       label: "HOME" },
};
