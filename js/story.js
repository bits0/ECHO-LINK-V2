// ============================================================
// ECHO//LINK — story conductor: conversations, events, hints
// UNKNOWN is a character, not a tutorial bot.
// ============================================================
import { S, save, currentObjective } from "./state.js";
import * as phone from "./phone.js";
import { sfx } from "./audio.js";

let ctx = null;
export function initStory(c) { ctx = c; }
const mechanicsMode = () => !!S.mechanicsMode;

const el = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ================= letterbox (in-world narrative moments) =================
let lbQueue = Promise.resolve();
export function letterbox(speaker, text, cls="") {
  lbQueue = lbQueue.then(() => new Promise(res => {
    const old = el("letterbox"); if (old) old.remove();
    const lb = document.createElement("div");
    lb.id = "letterbox";
    lb.innerHTML = `<div class="lb-speaker ${cls}">${speaker}</div>
      <div class="lb-text">${text}</div>
      <div class="lb-continue">CLICK TO CONTINUE ▸</div>`;
    el("game-screen").appendChild(lb);
    lb.onclick = () => { sfx.click(); lb.remove(); res(); };
  }));
  return lbQueue;
}

// ================= chat conversation runner =================
let running = false;
let pendingChoices = null;

async function say(from, text, delay=900) {
  S.chatTyping = true;  phone.renderTab && phoneOpenChatRefresh();
  await wait(Math.min(600 + text.length * 14, 2200));
  S.chatTyping = false;
  phone.addChatMsg(from, text);
  phoneOpenChatRefresh();
  await wait(150);
}
function phoneOpenChatRefresh() {
  // re-render chat tab if phone is open on chat
  const overlay = el("phone-overlay");
  if (!overlay.classList.contains("hidden")) phone.renderTab();
}
function choices(list) {
  return new Promise(res => {
    pendingChoices = { list, res };
    phoneOpenChatRefresh();
    if (el("phone-overlay").classList.contains("hidden")) {
      ctx.toast("📱 UNKNOWN is waiting — open your phone (Tab)", "amber");
      S.unread.chat++; phone.refreshBadge(); sfx.notify();
    }
  });
}
export function renderChatChoices(container) {
  if (!container) return;
  container.innerHTML = "";
  if (!pendingChoices) return;
  for (const c of pendingChoices.list) {
    const b = document.createElement("button");
    b.className = "chat-choice";
    b.textContent = c.text;
    b.onclick = () => {
      sfx.click();
      const p = pendingChoices; pendingChoices = null;
      phone.addChatMsg("me", c.text);
      phoneOpenChatRefresh();
      p.res(c.id);
    };
    container.appendChild(b);
  }
}

// ================= CONVERSATIONS =================
async function convoFirstContact() {
  S.metUnknown = true; save();
  ctx.toast("📱 New message — UNKNOWN", "amber"); sfx.notify();
  await say("them", "You're the BFree technician. Don't bother looking around — I'm not in the building. I'm in the machine you're standing in front of.");
  await choices([
    { id:"who", text:"Who is this?" },
    { id:"how", text:"How are you inside this PC?" },
  ]);
  await say("them", "Someone who pays attention to quiet rooms. How I'm here doesn't matter tonight. What matters: two of the office machines aren't talking.");
  await say("them", "PC-B and PC-D. Powered, present… and silent. Your inventory job won't pay you to care about that. I will.");
  await choices([
    { id:"why", text:"Why do you care about two office PCs?" },
    { id:"ok",  text:"Fine. I'll take a look." },
  ]);
  await say("them", "Because on a network, silence is never just silence. I've arranged a scope update through BFree — official, with a bonus. Check your jobs app.");
  await say("them", "Fix what's broken. And technician — when something looks connected but won't answer, don't trust your eyes. Test it.");
  await say("them", "You can call me UNKNOWN. It's what your phone says anyway.");
  S.scopeUpdate = true; save();
  sfx.notify(); ctx.toast("BFREE — scope update approved: connectivity investigation · +$150", "amber");
  ctx.changed("scope");
}

async function convoPCAName() {
  S.pcaDialogueDone = true; save();
  await wait(1400);
  await say("them", "You knocked on a name and nobody answered. And yet PC-A is right there, humming. Interesting, no?");
  await choices([
    { id:"map", text:"So Network Space lied to me?" },
    { id:"how", text:"How can it be online but unreachable?" },
  ]);
  await say("them", "The map showed you what it could see. Names are a courtesy, not a guarantee — somebody has to write them down, and nobody wrote down PC-A's.");
  await say("them", "Ask the machine by its number instead: 192.168.1.10. Watch what happens.");
  S.pcaHintIp = true; save();
}

async function convoPCAIpWorks() {
  await wait(1200);
  await say("them", "There. It was there all along. Connected is not the same as findable — remember that. It will matter again.");
}

async function convoFinal() {
  S.finalChatStarted = true; save();
  await wait(1600);
  await say("them", "Both of them, back from the quiet. You have careful hands, technician.");
  await choices([
    { id:"servers", text:"Should we start on the Server Room now?" },
    { id:"done",    text:"Job's done. Anything else?" },
  ]);
  await say("them", "Not tonight. I need to listen to what the office machines can tell me first. Some rooms answer questions you haven't asked yet.");
  await say("them", "Come back tomorrow. Same building. There are two machines in that rack room I'd like to… meet.");
  const pick = await choices([
    { id:"who2", text:"Who are you, really?" },
    { id:"tom",  text:"Tomorrow, then." },
  ]);
  if (pick === "who2") {
    await say("them", "Someone who can't afford a name. Not yet. Tomorrow, technician.");
  } else {
    await say("them", "Tomorrow, then. Sleep well — you've earned the bonus.");
  }
  S.finalChatDone = true; save();
  ctx.toast("◈ Objective updated — head home and file the report", "amber");
  ctx.changed("final");
}

// ================= EVENT HANDLERS =================
export const story = {
  renderChatChoices,

  onGameStart() {
    if (mechanicsMode()) return;
    S.unread.chat = 0;
    ctx.toast("📱 BFree — job offer BF-1042 waiting", "amber");
    sfx.notify();
    letterbox("ASTER FACILITIES — FLOOR 1, 21:47",
      "A quiet office building after hours. Four machines in a server rack, four workstations, one job: count them, power them, go home. Simple work. Simple night.");
  },

  onJobAccepted() {
    S.jobAccepted = true; save();
    ctx.toast("Job BF-1042 accepted — Aster Facilities, Floor 1", "green");
    ctx.changed("accepted");
  },

  checkPCAScreen() {
    if (mechanicsMode()) { ctx.toast("Narrative link disabled in Mechanics Lab.", "amber"); return; }
    if (!S.jobAccepted) { ctx.toast("A locked staff workstation. The inventory first.", "amber"); return; }
    if (!S.metUnknown) { convoFirstContact(); return; }
    ctx.toast("The messaging window sits quietly. She's watching, though.", "");
  },

  onNetspaceFirstOpen() {
    if (mechanicsMode()) return;
    letterbox("NETWORK SPACE",
      "The office unfolds as a constellation of machines — some bright, some barely there. A view of the network. Not the whole truth, but a place to start.");
  },

  onPingResult(target, lines) {
    const ok = lines.some(l => l.cls === "t-green" && l.text.startsWith("Reply from"));
    const name = target.toUpperCase();
    // network-space packet animation
    const devName = name.match(/^PC-[A-D]$/) || ["RTR-01","CSW-01","SRV-01","SRV-02"].includes(name) ? name
      : (Object.values(S.devices).find(d => d.ip === target) || {}).name;
    if (ctx.netspaceAnimate && devName) ctx.netspaceAnimate(devName, ok);

    if (name === "PC-A" && !ok) {
      const first = !S.pcaPingTried;
      S.pcaPingTried = true; save();
      if (!mechanicsMode() && first && !S.pcaDialogueDone) convoPCAName();
    }
    if (target === "192.168.1.10" && ok && !S.pcaIpPinged) {
      S.pcaIpPinged = true; save();
      ctx.toast("PC-A answers by number. Connected ≠ findable.", "green"); sfx.success();
      if (!mechanicsMode() && S.pcaDialogueDone) convoPCAIpWorks();
    }
    if (name === "PC-B" && ok && !S.pcbVerified) {
      S.pcbVerified = true; S.stats.fixes++; save();
      ctx.toast("✓ PC-B verified — it answers now", "green"); sfx.success();
      ctx.changed("verified");
    }
    if (name === "PC-D" && ok && !S.pcdVerified) {
      S.pcdVerified = true; S.stats.fixes++; save();
      ctx.toast("✓ PC-D verified — it answers now", "green"); sfx.success();
      ctx.changed("verified");
    }
    if (!mechanicsMode() && S.pcbVerified && S.pcdVerified && !S.finalChatDone && !S.finalChatStarted) convoFinal();
  },

  onChanged(reason, arg) {
    // inventory milestones
    if (!mechanicsMode() && reason === "record") {
      const inv = ["SRV-01","SRV-02","CSW-01","RTR-01"].filter(d=>S.inventoried.includes(d)).length;
      const pcs = ["PC-A","PC-B","PC-C","PC-D"].filter(d=>S.inventoried.includes(d)).length;
      if (inv === 4 && !S._srvToastDone) { S._srvToastDone = true; ctx.toast("Server Room recorded. Don't forget to power the units on.", ""); }
      if (pcs === 4 && !S._pcsToastDone) { S._pcsToastDone = true; ctx.toast("All four workstations recorded.", "green"); }
    }
    if (!mechanicsMode() && reason === "power") {
      const pow = ["SRV-01","SRV-02","CSW-01","RTR-01"].filter(d=>S.poweredOn.includes(d)).length;
      if (pow === 4 && !S._powToastDone) { S._powToastDone = true; ctx.toast("The rack hums awake. One switch, one router, two servers.", "green"); }
    }
    ctx.updateObjectiveBar();
  },

  onEnterScene(scene) {
    if (mechanicsMode()) return;
    if (scene === "server" && !S._seenServer) {
      S._seenServer = true; save();
      letterbox("SERVER ROOM",
        "Cold air, louder fans than you'd expect. Four dark units wait in the racks. The job says: record them, power them on. Nothing more.");
    }
    if (scene === "office" && !S._seenOffice) {
      S._seenOffice = true; save();
      letterbox("STAFF OFFICES",
        "Four desks. One monitor glows faintly — PC-A, mid-task, as if someone just stepped away.");
    }
    if (scene === "home") {
      letterbox("HOME",
        "Your own desk, your own quiet. The laptop waits with the BFree report. Just file it and the night is over.");
    }
  },

  onReportSubmit() {
    if (mechanicsMode()) { ctx.toast("Report flow disabled in Mechanics Lab.", "amber"); return; }
    S.reportSubmitted = true; save();
    ctx.toast("Report submitted — BF-1042 complete", "green"); sfx.success();
    setTimeout(() => {
      phone.addMail("unknown-basics");
      setTimeout(() => {
        phone.addMail("aster-followup");
        ctx.changed("mail2");
      }, 9000);
    }, 3500);
  },

  onMailRead() {
    if (mechanicsMode()) return;
    if (S.reportSubmitted && S.emailRead && S.asterRead && !S.ended) {
      setTimeout(() => ctx.showEnd(), 1600);
    }
  },

  // ---------- hints ----------
  currentHint() {
    const H = {
      accept:  ["Your phone is buzzing. Open it (Tab, or the icon bottom-right) and check the BFree app."],
      server:  ["The Server Room is the left door in the hallway.",
                "Click each rack unit: record it in BFree, then power it on.",
                "Four units total: SRV-01, SRV-02, CSW-01, RTR-01. Record AND power each one."],
      pcs:     ["Staff Offices — the right door in the hallway.",
                "Walk to each desk and record the workstation in BFree.",
                "PC-A's screen looks… active. Maybe check it while you're there."],
      invest:  ["UNKNOWN mentioned PC-B and PC-D. Start by looking at them physically — same symptom can mean different causes."],
      netspace:["PC-C is the front-right desk. USE THIS COMPUTER → NETWORK SPACE.",
                "Compare the map with reality: solid = actually observed; dashed = only known from your inventory.",
                "Network Space never proves anything by itself. It's a view — not the whole truth."],
      fixb:    ["PC-B: powered, cabled… but its NIC is disabled. Enable it from the device panel.",
                "Then prove it: PC-C → Terminal → ping PC-B"],
      fixd:    ["PC-D's cable lies loose on the desk. Click the cable end, then the ETH port.",
                "Once both ends are seated, a jack on the server-room patch panel lights up — the light means the hidden run is good.",
                "A cable isn't proof. Verify from PC-C: ping PC-D"],
      home:    ["Hallway → EXIT. Submit the BFree report from your laptop at home."],
    };
    const cur = currentObjective();
    if (!cur) return ["Nothing left but the quiet. Well played, technician."];
    const list = H[cur.id] || ["Trust what you can verify."];
    const lvl = Math.min(S.hintLevel[cur.id] || 0, list.length - 1);
    return [list[lvl], lvl < list.length - 1];
  },
  advanceHint() {
    const cur = currentObjective();
    if (!cur) return;
    const list = this.currentHintList ? this.currentHintList : null;
    S.hintLevel[cur.id] = (S.hintLevel[cur.id] || 0) + 1;
    save();
  },
};
