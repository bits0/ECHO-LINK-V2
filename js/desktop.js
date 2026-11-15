// ============================================================
// ECHO//LINK — a PC's field workspace + bottom tool dock
// Opens as any workstation; Network Space is the player's own.
// Network Space opens full-view; Terminal floats above it.
// ============================================================
import { S, save, worldClock } from "./state.js";
import { activeScenario } from "./scenario.js";
import { sfx } from "./audio.js";
import { openTerminal } from "./terminal.js";
import { openNetspace, closeNetspace } from "./netspace.js";
import { webRequest } from "./net.js";
import { openSyslog } from "./syslog.js";
import { openNotepad } from "./notepad.js";
import { openSop } from "./sop.js";

const APP_TITLES = { terminal:"FIELD TERMINAL", browser:"BROWSER", syslog:"SYSLOG", notepad:"NOTEPAD", sop:"SOP" };
const APPS = Object.keys(APP_TITLES);

let ctx = null;
export function initDesktop(c) { ctx = c; }

const el = id => document.getElementById(id);
let zTop = 10;

let host = activeScenario.player;   // the machine this desktop belongs to
let returnTo = null;                // "netspace" when launched from the map

export function openDesktop(opts = {}) {
  host = S.devices[opts.host] ? opts.host : activeScenario.player;
  returnTo = opts.from === "netspace-traffic" ? "netspace" : null;
  if (returnTo) closeNetspace();    // the desktop sits above the map, not behind it
  const dev = S.devices[host];
  const isPlayer = host === activeScenario.player;

  const ov = el("desktop-overlay");
  ov.classList.remove("hidden");
  ov.innerHTML = `
    <div class="desk-topbar">
      <span class="dt-host">${host}</span><span>${dev.ip || "NO ADDRESS"} · LOCAL FIELD WORKSPACE</span>
      <span class="dt-right">
        <span id="dt-clock">${worldClock()}</span>
        <span class="desk-leave" id="dt-leave">⏏ STEP AWAY</span>
      </span>
    </div>
    <div class="desk-body" id="desk-body">
      <div class="workspace-home" id="workspace-home">
        <div class="ws-kicker">ECHO//LINK FIELD SHELL</div>
        <div class="ws-title">LOCAL WORKSPACE</div>
        <div class="ws-copy">Observe the topology, test from the terminal, then return to the physical room.</div>
        ${isPlayer && !S.netspaceSeen ? `<div class="ws-new">◈ NETWORK SPACE AVAILABLE</div>` : ""}
      </div>
      <div class="desk-dock">
        <button class="dock-item" id="dock-terminal"><span>&gt;_</span>TERMINAL</button>
        ${S.act0
          ? `<button class="dock-item dock-primary" id="dock-netspace"><span>◇</span>NETWORK SPACE</button>
        <button class="dock-item" id="dock-syslog"><span>≣</span>SYSLOG</button>
        <button class="dock-item" id="dock-notepad"><span>✎</span>NOTEPAD</button>
        <button class="dock-item" id="dock-sop"><span>◈</span>SOP</button>`
          : `<button class="dock-item" id="dock-browser"><span>◱</span>BROWSER</button>
        ${isPlayer ? `<button class="dock-item dock-primary" id="dock-netspace"><span>◇</span>NETWORK SPACE${S.netspaceSeen ? "" : `<b>NEW</b>`}</button>` : ""}`}
        <button class="dock-item" id="dock-away"><span>⏏</span>STEP AWAY</button>
      </div>
    </div>`;

  const leave = () => {
    if (S.act0) { ctx.toast("Stepping away is not available in Act 0.", "amber"); return; }
    closeDesktop();
  };
  el("dt-leave").onclick = () => { sfx.click(); leave(); };
  el("dock-away").onclick = () => { sfx.click(); leave(); };
  el("dock-terminal").onclick = () => { sfx.click(); spawnWindow("terminal"); };
  const br = el("dock-browser");
  if (br) br.onclick = () => { sfx.click(); spawnWindow("browser"); };
  for (const app of ["syslog", "notepad", "sop"]) {
    const item = el("dock-" + app);
    if (item) item.onclick = () => { sfx.click(); spawnWindow(app); };
  }
  const ns = el("dock-netspace");
  if (ns) ns.onclick = () => {
    sfx.click();
    if (S.act0) { ctx.toast("Network Space is not available in Act 0.", "amber"); return; }
    const first = !S.netspaceSeen;
    S.netspaceSeen = true; save();
    openNetspace(ctx);
    if (first) ctx.story.onNetspaceFirstOpen();
    ctx.changed("netspace");
  };
}

// opts.reopen === false keeps the desktop's launch context (used when the
// Network Space dock itself is stepping away for good).
export function closeDesktop(opts = {}) {
  if (S.act0) return;   // Act 0 has no physical scene yet — the workstation is the act
  const back = returnTo === "netspace" && opts.reopen !== false;
  el("desktop-overlay").classList.add("hidden");
  el("desktop-overlay").innerHTML = "";
  host = activeScenario.player;
  returnTo = null;
  save();
  if (back) openNetspace(ctx);
}

// Dock state is derived from the windows themselves: open = the window
// exists, active = the open window on top. View state, never kept in S.
function syncDock() {
  let active = null, top = -Infinity;
  for (const app of APPS) {
    const win = el("win-" + app);
    if (!win) continue;
    const z = Number(win.style.zIndex) || 0;
    if (z > top) { top = z; active = app; }
  }
  for (const app of APPS) {
    const item = el("dock-" + app);
    if (!item) continue;
    item.classList.toggle("is-open", !!el("win-" + app));
    item.classList.toggle("is-active", app === active);
    if (app === active) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  }
}

function spawnWindow(app) {
  const body = el("desk-body");
  if (el("win-"+app)) { el("win-"+app).style.zIndex = ++zTop; syncDock(); return; }

  const win = document.createElement("div");
  win.className = "win workspace-win";
  win.id = "win-" + app;
  const w = 620, h = 410;
  const offset = (zTop % 4) * 22;
  win.style.width = w+"px"; win.style.height = h+"px";
  win.style.left = Math.max(12, Math.min(body.clientWidth-w-16, 90+offset)) + "px";
  win.style.top  = Math.max(12, Math.min(body.clientHeight-h-92, 52+offset/2)) + "px";
  win.style.zIndex = ++zTop;
  const barTitle = "C:\\\\ " + (APP_TITLES[app] || "APP");
  win.innerHTML = `
    <div class="win-bar">
      <div class="wb-dot"></div>
      <div class="wb-title">${barTitle} · ${host}</div>
      <div class="wb-close">✕</div>
    </div>
    <div class="win-body"></div>`;
  body.appendChild(win);
  syncDock();

  win.addEventListener("mousedown", () => { win.style.zIndex = ++zTop; syncDock(); });
  win.querySelector(".wb-close").onclick = () => {
    sfx.click();
    if (win._flush) win._flush();
    win.remove(); syncDock();
  };

  const bar = win.querySelector(".win-bar");
  bar.addEventListener("mousedown", e => {
    const sx = e.clientX - win.offsetLeft, sy = e.clientY - win.offsetTop;
    const mv = ev => { win.style.left = (ev.clientX - sx)+"px"; win.style.top = (ev.clientY - sy)+"px"; };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  });

  const wb = win.querySelector(".win-body");
  if (app === "browser") openBrowser(wb, host);
  else if (app === "syslog") openSyslog(wb);
  else if (app === "notepad") win._flush = openNotepad(wb);
  else if (app === "sop") openSop(wb);
  else openTerminal(wb, ctx, host);
}

// The browser is a client: every pixel of a page comes from webRequest.
function openBrowser(body, host) {
  body.innerHTML = `
    <div class="browser">
      <div class="browser-bar">
        <input class="browser-url" spellcheck="false" autocomplete="off" placeholder="type an address"/>
        <button class="browser-go" id="browser-go">GO</button>
      </div>
      <div class="browser-page"></div>
    </div>`;
  const page = body.querySelector(".browser-page");
  const input = body.querySelector(".browser-url");

  function line(cls, text) {
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    return div;
  }

  function showStart() {
    page.replaceChildren();
    page.append(
      line("browser-title", "NEW TAB"),
      line("t-line t-dim", "Type an address above and press Enter."),
      line("t-line t-dim", "Try 192.168.1.1 or kb.aster.local"),
    );
  }

  function show(result) {
    page.replaceChildren();
    page.append(line("browser-title", result.title));
    for (const l of result.lines) page.append(line("t-line " + (l.cls || ""), l.text));
    if (result.error) page.append(line("browser-err", result.error));
  }

  function go() {
    if (!input.value.trim()) { showStart(); return; }
    show(webRequest(host, input.value));
  }

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") go();
    e.stopPropagation(); // don't trigger game hotkeys while typing
  });
  body.querySelector("#browser-go").onclick = () => go();
  showStart();
  setTimeout(() => input.focus(), 50);
}
