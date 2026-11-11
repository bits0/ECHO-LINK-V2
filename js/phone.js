// ============================================================
// ECHO//LINK — the phone: BFree jobs · chat · mail · mission log
// The story layer that travels with the player.
// ============================================================
import { S, save, OBJECTIVES, objectiveDone, currentObjective, worldClock } from "./state.js";
import { sfx } from "./audio.js";

let ctx = null;
export function initPhone(c) { ctx = c; }

const el = id => document.getElementById(id);
let activeTab = "jobs";
const inLab = () => !!S.mechanicsMode;

// ---------- public API used by story ----------
export function addChatMsg(from, text) {
  S.chatLog = S.chatLog || [];
  S.chatLog.push({ from, text });
  save(); refreshBadge();
  if (!phoneOpen() || activeTab !== "chat") { S.unread.chat++; refreshBadge(); sfx.notify(); ctx.updateObjectiveBar(); }
}
export function addMail(id) {
  if (!S.mail.includes(id)) {
    S.mail.push(id); S.unread.mail++;
    save(); refreshBadge(); sfx.notify();
    ctx.toast("📧 New mail", "amber");
  }
}
export function refreshBadge() {
  const n = (S.unread.chat||0) + (S.unread.mail||0);
  const b = el("phone-badge");
  if (n > 0) { b.textContent = n; b.classList.remove("hidden"); }
  else b.classList.add("hidden");
  // tab dots
  document.querySelectorAll(".phone-tab").forEach(t => {
    const tab = t.dataset.tab;
    t.querySelector(".tab-dot")?.remove();
    if ((tab==="chat" && S.unread.chat>0) || (tab==="mail" && S.unread.mail>0)) {
      t.insertAdjacentHTML("beforeend", `<span class="tab-dot"></span>`);
    }
  });
}

function phoneOpen() { return !el("phone-overlay").classList.contains("hidden"); }

export function openPhone(tab) {
  activeTab = tab || activeTab;
  el("phone-overlay").classList.remove("hidden");
  if (activeTab === "chat") S.unread.chat = 0;
  if (activeTab === "mail") S.unread.mail = 0;
  renderTab(); refreshBadge(); save();
}
export function closePhone() { el("phone-overlay").classList.add("hidden"); }
export function togglePhone() { phoneOpen() ? closePhone() : openPhone(); }

export function renderTab() {
  el("phone-clock").textContent = worldClock();
  document.querySelectorAll(".phone-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === activeTab));
  const c = el("phone-content");
  if (activeTab === "jobs") c.innerHTML = jobsHTML();
  else if (activeTab === "chat") { c.innerHTML = chatHTML(); wireChat(); }
  else if (activeTab === "mail") { c.innerHTML = mailListHTML(); wireMail(); }
  else c.innerHTML = logHTML();
  refreshBadge();
}

// ================= BFREE JOBS =================
function checkItem(done, active, text) {
  return `<li class="${done ? "done" : active ? "active" : ""}">${text}</li>`;
}
function jobsHTML() {
  if (inLab()) {
    const total = Object.keys(S.devices).length;
    return `<div class="job-card">
      <div class="job-id">MECHANICS LAB</div>
      <div class="job-title">Sandbox — no contract</div>
      <div style="font-size:12.5px;color:var(--ink);line-height:1.6;margin-bottom:8px">
        No client, no deadline, no pay. Inspect, power, cable, verify.
      </div>
      <div class="job-pay">RECORDED ${S.inventoried.length}/${total} · POWERED ${S.poweredOn.length}/${total}</div>
    </div>`;
  }
  const inv = ["SRV-01","SRV-02","CSW-01","RTR-01"].filter(d=>S.inventoried.includes(d)).length;
  const pow = ["SRV-01","SRV-02","CSW-01","RTR-01"].filter(d=>S.poweredOn.includes(d)).length;
  const pcs = ["PC-A","PC-B","PC-C","PC-D"].filter(d=>S.inventoried.includes(d)).length;
  const serverDone = inv===4 && pow===4;

  if (!S.jobAccepted) {
    return `<div class="job-card">
      <div class="job-id">BFREE · JOB BF-1042</div>
      <div class="job-title">Office Equipment Inventory</div>
      <div class="job-client">Aster Facilities — Floor 1 · tonight</div>
      <div style="font-size:12.5px;color:var(--ink);line-height:1.6;margin-bottom:8px">
        Record all IT equipment in the Server Room and Staff Offices, power on the
        Server Room units, and confirm the inventory. <b>No repairs. No configuration.</b>
      </div>
      <div class="job-pay">BASE PAY: $180 · EST. 40 MIN</div>
      <button class="btn btn-primary job-accept" id="job-accept">ACCEPT JOB</button>
    </div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.1em;text-align:center">
      BFREE — odd jobs, honestly described. usually.
    </div>`;
  }

  let rows = "";
  rows += checkItem(true, false, "Job accepted — Aster Facilities, Floor 1");
  rows += checkItem(serverDone, !serverDone, `Server Room: record & power on (${Math.min(inv,4)}/4 recorded · ${pow}/4 on)`);
  rows += checkItem(pcs===4, serverDone && pcs<4, `Staff Offices: record PC-A to PC-D (${pcs}/4)`);
  if (S.scopeUpdate) {
    rows += checkItem(S.pcbVerified && S.pcdVerified, true,
      `SCOPE UPDATE: restore office connectivity (${S.pcbVerified&&S.pcdVerified ? "verified" : "in progress"})`);
  }
  const canSubmit = S.finalChatDone && S.scene === "home";
  return `<div class="job-card">
    <div class="job-id">BFREE · JOB BF-1042 ${S.scopeUpdate? "+ AMENDMENT":""}</div>
    <div class="job-title">Office Equipment Inventory</div>
    <div class="job-client">Aster Facilities — Floor 1 · tonight</div>
    <ul class="job-check">${rows}</ul>
    ${S.scopeUpdate ? `<div class="job-bonus">◈ SCOPE UPDATE — connectivity investigation · BONUS +$150 (client-approved)</div>` : ""}
    <div class="job-pay">BASE $180 ${S.scopeUpdate ? "+ $150 BONUS" : ""}</div>
    ${S.reportSubmitted
      ? `<div class="dp-record-ok">✓ REPORT SUBMITTED — PAYMENT PENDING</div>`
      : canSubmit
        ? `<button class="btn btn-primary job-accept" id="job-submit">SUBMIT REPORT</button>`
        : `<div class="dp-note">Report can be submitted from home, once the work is done.</div>`}
  </div>`;
}

// ================= CHAT =================
function chatHTML() {
  if (inLab()) {
    return `<div class="chat-sys" style="margin-top:30px">NO CONVERSATIONS<br/><br/>narrative link disabled in the lab.</div>`;
  }
  const log = S.chatLog || [];
  if (!log.length) {
    return `<div class="chat-sys" style="margin-top:30px">NO CONVERSATIONS<br/><br/>your clients usually email.</div>`;
  }
  let h = `<div class="chat-thread">`;
  h += `<div class="chat-sys">UNKNOWN — no profile · no number · encrypted</div>`;
  for (const m of log) {
    if (m.from === "them") h += `<div class="chat-msg them"><span class="chat-name">UNKNOWN</span>${m.text}</div>`;
    else if (m.from === "me") h += `<div class="chat-msg me">${m.text}</div>`;
    else h += `<div class="chat-sys">${m.text}</div>`;
  }
  if (S.chatTyping) h += `<div class="chat-typing">typing</div>`;
  h += `</div><div class="chat-choices" id="chat-choices"></div>`;
  return h;
}
function wireChat() {
  const c = el("phone-content");
  c.scrollTop = c.scrollHeight;
  ctx.story.renderChatChoices(el("chat-choices"));
}

// ================= MAIL =================
const MAILS = {
  "unknown-basics": {
    from:"UNKNOWN", subject:"the basics, as promised",
    preview:"you asked how any of this works. fair question…",
    body:`<p>You did good work tonight. You also got lucky — a cable and a checkbox are the easy kind of broken.</p>
    <p>You asked how the computers actually <b>find</b> each other. I put together a short read. No test at the end. Understanding is its own reward.</p>
    <p>One thing to sit with: tonight, a machine was <b>on the network</b> but had <b>no name</b>. Connected is not the same as findable. Remember that. It matters more than you think — it matters to <b>me</b> more than you know.</p>
    <p style="color:var(--ink-dim)">— U.</p>`,
    kb:true,
  },
  "aster-followup": {
    from:"ASTER FACILITIES — FACILITIES DESK", subject:"Follow-up request: Server Room check (tomorrow)",
    preview:"Thank you for tonight's inventory. We'd like to book you again…",
    body:`<p>Dear technician,</p>
    <p>Thank you for completing job <b>BF-1042</b>. During tonight's visit you noted the Server Room equipment is powered and linked.</p>
    <p>We'd like to book a follow-up visit tomorrow: some staff report that internal services (file shares, the intranet site) have been unreliable. Since you're already familiar with the site, you're our first call.</p>
    <p><b>Proposed scope:</b> check server availability and network configuration. Details on arrival.</p>
    <p style="color:var(--ink-dim)">— Aster Facilities Desk</p>`,
    kb:false,
  },
};
function mailListHTML() {
  if (inLab()) return `<div class="chat-sys" style="margin-top:30px">NO MAIL<br/><br/>the lab has no inbox.</div>`;
  if (!S.mail.length) return `<div class="chat-sys" style="margin-top:30px">NO MAIL</div>`;
  let h = "";
  for (const id of [...S.mail].reverse()) {
    const m = MAILS[id];
    const unread = !S["read_"+id];
    h += `<div class="mail-item ${unread?"unread":""}" data-mail="${id}">
      <div class="mail-from">${m.from}</div>
      <div class="mail-subject">${m.subject}</div>
      <div class="mail-preview">${m.preview}</div>
    </div>`;
  }
  return h;
}
function wireMail() {
  document.querySelectorAll(".mail-item").forEach(it => {
    it.onclick = () => {
      sfx.click();
      const id = it.dataset.mail;
      S["read_"+id] = true;
      if (id === "unknown-basics") S.emailRead = true;
      if (id === "aster-followup") S.asterRead = true;
      save();
      const m = MAILS[id];
      el("phone-content").innerHTML = `
        <button class="btn btn-tiny mail-back" id="mail-back">← BACK</button>
        <div class="mail-open">
          <div class="mail-from">${m.from}</div>
          <h3>${m.subject}</h3>
          <div class="mail-body">${m.body}</div>
          ${m.kb ? `<div class="kb-link" id="kb-open">◈ OPEN IN KNOWLEDGE BASE — “NETWORKS 101”</div>` : ""}
        </div>`;
      el("mail-back").onclick = () => { sfx.click(); renderTab(); };
      const kb = el("kb-open");
      if (kb) kb.onclick = () => { sfx.click(); openKB(); };
      ctx.story.onMailRead();
    };
  });
}
function openKB() {
  S.kbRead = true; save();
  el("phone-content").innerHTML = `
    <button class="btn btn-tiny mail-back" id="kb-back">← BACK</button>
    <div class="mail-open"><div class="kb-article">
      <h2>Networks 101 — how machines talk</h2>
      <p>A <b>network</b> is just machines agreeing on how to hold a conversation. Like any conversation, it needs a physical medium, addresses, and names.</p>
      <h2>1 · The physical link</h2>
      <p>Data travels as signals over a cable (or radio). If the cable is unplugged, nothing else matters — no signal can flow. Tonight you saw this: <code>PC-D</code> was powered and configured, but its cable lay on the desk.</p>
      <h2>2 · The network interface (NIC)</h2>
      <p>The NIC is the machine's mouth and ears. It can be <b>administratively disabled</b> — present, cabled, but switched off in software. That was <code>PC-B</code>: a perfectly good machine refusing to speak.</p>
      <h2>3 · Addresses (IP)</h2>
      <p>Every machine on a network needs an address, like <code>192.168.1.12</code>. Most get one automatically from the <b>router</b> via a service called <b>DHCP</b>. Some are set by hand — a <b>static IP</b>.</p>
      <h2>4 · Names</h2>
      <p>Humans prefer names (<code>PC-B</code>) over numbers. A <b>DNS</b> service translates names to addresses — but it only knows names that were <i>registered</i>. A static-IP machine may never register, so <code>ping PC-A</code> fails while <code>ping 192.168.1.10</code> answers. <b>The machine is there; the name isn't.</b></p>
      <h2>5 · Verifying</h2>
      <p><code>ping</code> asks a machine “are you there?” and times the reply. It's the technician's knock on the door — but a failed ping tells you <i>that</i> something failed, not <i>what</i>. That's why you check the cable, the NIC, and the name — in that order.</p>
      <div class="kb-diagram">  [ PC ] —cable→ [ switch ] —— [ router ] —— internet
   mouth      hallway       post office

  cable = physical link
  NIC   = the machine's mouth (can be switched off)
  IP    = street address      (DHCP hands these out)
  name  = a nickname          (DNS remembers them)</div>
      <p style="color:var(--ink-dim)">Next time: why some doors stay closed — separating networks on purpose.</p>
    </div></div>`;
  el("kb-back").onclick = () => { sfx.click(); renderTab(); };
  el("phone-content").scrollTop = 0;
  ctx.story.onMailRead();
}

// ================= LOG =================
function logHTML() {
  if (inLab()) {
    return `<div style="font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--ink-dim);padding:6px 4px 10px">MISSION LOG — MECHANICS LAB</div>
      <div class="log-item active">
        <div class="log-title">MECHANICS LAB — inspect, power, cable, verify</div>
        <div class="log-sub">Story objectives belong to Story Mode.</div>
      </div>`;
  }
  let h = `<div style="font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--ink-dim);padding:6px 4px 10px">MISSION LOG — CHAPTER 1</div>`;
  for (const o of OBJECTIVES) {
    const done = objectiveDone(o.id);
    const cur = currentObjective();
    const active = cur && cur.id === o.id;
    // don't reveal future story beats too early
    if (!done && !active && (o.id==="fixb"||o.id==="fixd"||o.id==="home") && !S.scopeUpdate) continue;
    h += `<div class="log-item ${done?"done":active?"active":""}">
      <div class="log-title">${o.text}</div>${o.sub?`<div class="log-sub">${o.sub}</div>`:""}
    </div>`;
  }
  return h;
}

// ---------- wiring ----------
export function wirePhoneButton() {
  el("phone-button").onclick = () => { sfx.click(); togglePhone(); };
  el("phone-close").onclick = () => { sfx.click(); closePhone(); };
  document.querySelectorAll(".phone-tab").forEach(t => {
    t.onclick = () => {
      sfx.click();
      activeTab = t.dataset.tab;
      if (activeTab === "chat") S.unread.chat = 0;
      if (activeTab === "mail") S.unread.mail = 0;
      renderTab(); save();
    };
  });
  // delegated job buttons (re-rendered content)
  el("phone-content").addEventListener("click", e => {
    if (e.target.id === "job-accept") { sfx.notify(); ctx.story.onJobAccepted(); }
    if (e.target.id === "job-submit") { sfx.notify(); ctx.story.onReportSubmit(); }
  });
}
