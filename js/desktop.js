// ============================================================
// ECHO//LINK — a PC's field workspace
// Opens as any workstation; Network Space is the player's own.
// The shell dock lives in shell.js; this module maps its items
// onto desktop surfaces (windows, the workspace, Network Space).
// ============================================================
import { S, save, worldClock } from "./state.js";
import { activeScenario } from "./scenario.js";
import { sfx } from "./audio.js";
import { openTerminal } from "./terminal.js";
import { openNetspace, closeNetspace, minimiseNetspace, showNetspace, netspaceVisible } from "./netspace.js";
import { webRequest } from "./net.js";
import { openNotepad } from "./notepad.js";
import { openSop } from "./sop.js";
import { mountDock, unmountDock, markOpen, markActive } from "./shell.js";

const APP_TITLES = { terminal:"FIELD TERMINAL", browser:"BROWSER", notepad:"NOTEPAD", sop:"SOP" };
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
        <div class="ws-copy">${S.act0
          ? "Read the log. The console is the only path left."
          : "Observe the topology, test from the terminal, then return to the physical room."}</div>
        ${isPlayer && !S.netspaceSeen ? `<div class="ws-new">◈ NETWORK SPACE AVAILABLE</div>` : ""}
      </div>
    </div>`;

  el("dt-leave").onclick = () => {
    sfx.click();
    if (S.act0) { ctx.toast("Stepping away is not available in Act 0.", "amber"); return; }
    closeDesktop();
  };

  mountShell();
  if (!S.act0) { markOpen("pc", true); markActive("pc"); }
}

// The item sets are the shell's whole vocabulary. Act 0 has no
// physical room yet, so its only exit is back to the title.
export function mountShell() {
  const items = S.act0
    ? [
        { id:"terminal", label:"TERMINAL", icon:">_" },
        { id:"netspace", label:"NETWORK SPACE", icon:"◇" },
        { id:"notepad", label:"NOTEPAD", icon:"✎" },
        { id:"sop", label:"SOP", icon:"◈" },
        { id:"quit", label:"QUIT TO TITLE", icon:"⏏", action:true },
      ]
    : [
        { id:"terminal", label:"TERMINAL", icon:">_" },
        { id:"browser", label:"BROWSER", icon:"◱" },
        { id:"netspace", label:"NETWORK SPACE", icon:"◇" },
        { id:"pc", label:"PC", icon:"⌂" },
        { id:"away", label:"STEP AWAY", icon:"⏏", action:true },
      ];
  mountDock(items, {
    terminal: intent => tool("terminal", intent),
    browser: intent => tool("browser", intent),
    notepad: intent => tool("notepad", intent),
    sop: intent => tool("sop", intent),
    netspace: intent => netspaceIntent(intent),
    pc: intent => pcIntent(intent),
    quit: () => quitToTitle(),
    away: () => stepAway(),
  });
  // mountDock resets state; a Network Space open before a remount stays open
  if (!S.act0 && el("netspace-overlay").children.length) markOpen("netspace", true);
}

function tool(app, intent) {
  sfx.click();
  const win = el("win-" + app);
  if (intent === "minimise") {
    if (win) win.classList.add("hidden");
    focusTop();
    return;
  }
  // tools float over the map: the map keeps its open state underneath
  ensureDesktop();
  if (el("win-" + app)) {
    el("win-" + app).classList.remove("hidden");
    raise(el("win-" + app));
  } else spawnWindow(app);
  markOpen(app, true);
  markActive(app);
}

function netspaceIntent(intent) {
  sfx.click();
  if (intent === "minimise") { minimiseNetspace(); focusTop(); return; }
  if (el("netspace-overlay").children.length) { showNetspace(); return; }
  if (S.act0) { openNetspace(ctx); return; }
  const first = !S.netspaceSeen;
  S.netspaceSeen = true; save();
  openNetspace(ctx);
  if (first) ctx.story.onNetspaceFirstOpen();
  ctx.changed("netspace");
}

function pcIntent(intent) {
  sfx.click();
  if (netspaceVisible()) minimiseNetspace();
  if (intent === "minimise") {
    el("desktop-overlay").classList.add("hidden");
    markActive(null);
    return;
  }
  if (!el("desk-body")) { openDesktop({ host: activeScenario.player }); return; }
  el("desktop-overlay").classList.remove("hidden");
  markOpen("pc", true);
  markActive("pc");
}

function stepAway() {
  sfx.click();
  if (netspaceVisible()) { closeNetspace(); closeDesktop({ reopen:false }); return; }
  closeDesktop();
}

function quitToTitle() {
  sfx.click();
  save();                          // a quit is not a reset: the save survives
  closeNetspace();
  clearWindows();
  const ov = el("desktop-overlay");
  ov.classList.add("hidden");
  ov.innerHTML = "";
  host = activeScenario.player;
  returnTo = null;
  unmountDock();
  el("game-screen").classList.add("hidden");
  el("title-screen").classList.remove("hidden");
}

// opts.reopen === false keeps the desktop's launch context (used when the
// shell's STEP AWAY leaves both surfaces for the physical room).
export function closeDesktop(opts = {}) {
  if (S.act0) return;   // Act 0 has no physical scene yet — the workstation is the act
  const back = returnTo === "netspace" && opts.reopen !== false;
  clearWindows();
  const ov = el("desktop-overlay");
  ov.classList.add("hidden");
  ov.innerHTML = "";
  markOpen("pc", false);
  markActive(null);
  host = activeScenario.player;
  returnTo = null;
  save();
  if (back) openNetspace(ctx);
}

// The desktop is not mounted (it was closed); a tool reopens it.
function ensureDesktop() {
  if (!el("desk-body")) { openDesktop({ host: activeScenario.player }); return; }
  el("desktop-overlay").classList.remove("hidden");
  if (!S.act0) markOpen("pc", true);
}

function raise(win) { win.style.zIndex = ++zTop; }

// Floating windows live in their own body-level layer so a map under them
// keeps its own DOM, camera and feed untouched.
function winLayer() {
  let layer = el("win-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "win-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function clearWindows() {
  const layer = el("win-layer");
  if (layer) layer.replaceChildren();
  for (const app of APPS) markOpen(app, false);
}

// The focused surface is the topmost visible window, else the map,
// else the workspace.
function focusTop() {
  if (netspaceVisible()) { markActive("netspace"); return; }
  let best = null, top = -Infinity;
  for (const app of APPS) {
    const win = el("win-" + app);
    if (!win || win.classList.contains("hidden")) continue;
    const z = Number(win.style.zIndex) || 0;
    if (z > top) { top = z; best = app; }
  }
  if (best) { markActive(best); return; }
  if (!S.act0 && el("desk-body") && !el("desktop-overlay").classList.contains("hidden")) {
    markActive("pc"); return;
  }
  markActive(null);
}

// After Network Space steps aside, the desktop owns the screen again.
export function focusDesktopSurface() {
  if (netspaceVisible()) return;
  focusTop();
}

function spawnWindow(app) {
  const body = el("desk-body");
  const win = document.createElement("div");
  win.className = "win workspace-win";
  win.id = "win-" + app;
  const w = 620, h = 410;
  const offset = (zTop % 4) * 22;
  win.style.width = w+"px"; win.style.height = h+"px";
  win.style.left = Math.max(12, Math.min(body.clientWidth-w-16, 90+offset)) + "px";
  win.style.top  = Math.max(12, Math.min(body.clientHeight-h-92, 52+offset/2)) + "px";
  raise(win);
  const barTitle = "C:\\\\ " + (APP_TITLES[app] || "APP");
  win.innerHTML = `
    <div class="win-bar">
      <div class="wb-dot"></div>
      <div class="wb-title">${barTitle} · ${host}</div>
      <div class="wb-close">✕</div>
    </div>
    <div class="win-body"></div>`;
  winLayer().appendChild(win);

  win.addEventListener("mousedown", () => { raise(win); markActive(app); });
  win.querySelector(".wb-close").onclick = () => {
    sfx.click();
    if (win._flush) win._flush();
    win.remove();
    markOpen(app, false);
    focusTop();
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
