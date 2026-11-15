// ============================================================
// ECHO//LINK — the shell dock: one taskbar for the whole game
// It is the only owner of #shell-dock. Tools are surfaces, not
// buttons: every item carries closed / open / active.
// ============================================================

const el = id => document.getElementById(id);

let items = [];
let handlers = {};
let openIds = new Set();
let activeId = null;

// items: [{ id, label, icon, action? }] — an action item runs its
// handler and never takes a state (QUIT TO TITLE, STEP AWAY).
export function mountDock(nextItems, nextHandlers = {}) {
  items = nextItems;
  handlers = nextHandlers;
  openIds = new Set();
  activeId = null;

  let dock = el("shell-dock");
  if (!dock) {
    dock = document.createElement("div");
    dock.id = "shell-dock";
    dock.className = "shell-dock";
    document.body.appendChild(dock);
  }
  dock.classList.remove("hidden");
  const nodes = [];
  for (const item of items) {
    if (item.action) {
      // the action is set apart: a rule and a margin, never a state
      const divider = document.createElement("span");
      divider.className = "dock-divider";
      divider.setAttribute("aria-hidden", "true");
      nodes.push(divider);
    }
    const btn = document.createElement("button");
    btn.className = "dock-item";
    btn.id = "dock-" + item.id;
    btn.dataset.dock = item.id;
    if (item.action) btn.classList.add("dock-action");

    const icon = document.createElement("span");
    icon.textContent = item.icon;
    const dot = document.createElement("i");
    dot.className = "dock-dot";
    dot.setAttribute("aria-hidden", "true");
    btn.append(icon, item.label, dot);

    btn.onclick = () => {
      if (item.action) { handlers[item.id]?.("run"); return; }
      const intent = activeId === item.id ? "minimise" : openIds.has(item.id) ? "focus" : "open";
      handlers[item.id]?.(intent);
    };
    nodes.push(btn);
  }
  dock.replaceChildren(...nodes);
}

export function unmountDock() {
  const dock = el("shell-dock");
  if (dock) {
    dock.classList.add("hidden");
    dock.replaceChildren();
  }
  items = [];
  handlers = {};
  openIds = new Set();
  activeId = null;
}

// open = the surface exists (a minimised window is still open)
export function markOpen(id, open) {
  if (open) openIds.add(id);
  else openIds.delete(id);
  const btn = el("dock-" + id);
  if (!btn) return;
  btn.classList.toggle("is-open", open);
  if (!open && activeId === id) markActive(null);
}

export function markActive(id) {
  activeId = id || null;
  for (const item of items) {
    const btn = el("dock-" + item.id);
    if (!btn) continue;
    const on = item.id === activeId;
    btn.classList.toggle("is-active", on);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  }
}
