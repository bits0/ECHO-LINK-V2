// ============================================================
// ECHO//LINK — device CLIs (switch / router). Read-only.
// A device reports only what it can observe: carrier per port,
// its own VLAN plan, its own addressing, line state. It cannot
// see the hidden in-wall run and never calls a printed label wrong.
// Output is derived live from the same functions the inspector uses.
// ============================================================
import { S } from "./state.js";
import { activeScenario } from "./scenario.js";
import { switchInterfaces, routerInterfaces } from "./net.js";
import { sfx } from "./audio.js";

const line = (text = "", cls = "") => ({ text, cls });

function help(host) {
  const show = host === activeScenario.switch
    ? line("  show interfaces status   Per-port link state and VLAN")
    : line("  show ip interface brief  Interface addressing and line state");
  return [
    line("Commands:", "t-white"),
    show,
    line("  help                     Show this list"),
    line("  clear                    Clear the screen"),
    line("  exit                     Close the console, back to the inspector"),
    line(""),
    line("Read-only session — configuration is disabled.", "t-dim"),
  ];
}

// switch ports: connected / notconnect / disabled is all a switch can see
function switchStatus() {
  const rows = switchInterfaces().map(p => {
    const status = p.state === "active" ? "connected"
                 : p.state === "down" ? "disabled"
                 : "notconnect";
    const speed = p.state === "active" ? p.speed : "auto";
    return line(
      p.label.padEnd(8) +
      "".padEnd(22) +
      status.padEnd(13) +
      String(p.vlan).padEnd(6) +
      speed.padEnd(7) +
      "10/100/1000BaseTX"
    );
  });
  return [
    line(`Switch port state — ${activeScenario.switch}`, "t-white"),
    line(""),
    line("Port    Name                  Status       Vlan  Speed  Type", "t-dim"),
    ...rows,
  ];
}

function routerBrief() {
  const rows = routerInterfaces().map(p => {
    const addressed = p.id === "LAN1";
    const ip = addressed ? activeScenario.gatewayIp : "unassigned";
    const ok = addressed ? "YES" : "NO";
    const method = addressed ? "manual" : "unset";
    let status = "down", proto = "down";
    if (p.state === "active") { status = "up"; proto = "up"; }
    else if (p.id === "MGMT") status = "administratively down";
    return line(
      p.label.padEnd(11) +
      ip.padEnd(16) +
      ok.padEnd(5) +
      method.padEnd(8) +
      status.padEnd(22) +
      proto
    );
  });
  return [
    line(`Interface status — ${activeScenario.router}`, "t-white"),
    line(""),
    line("Interface  IP-Address      OK?  Method  Status                Protocol", "t-dim"),
    ...rows,
  ];
}

// Pure command evaluation for tests and for the console shell below.
export function cliCommand(host, raw) {
  const d = S.devices[host];
  if (!d) return { lines: [line(`% Unknown device: ${host}`, "t-amber")] };
  const cmd = raw.trim();
  if (!cmd) return { lines: [] };
  const t = cmd.toLowerCase().split(/\s+/);
  if (t[0] === "help")  return { lines: help(host) };
  if (t[0] === "clear") return { clear: true, lines: [] };
  if (t[0] === "exit")  return { exit: true, lines: [] };
  if (t[0] === "show") {
    if (!d.power) return { lines: [line("% No response from the device — it has no power.", "t-amber")] };
    if (host === activeScenario.switch && t[1] === "interfaces" && t[2] === "status")
      return { lines: switchStatus() };
    if (host === activeScenario.router && t[1] === "ip" && t[2] === "interface" && t[3] === "brief")
      return { lines: routerBrief() };
  }
  return { lines: [line("% Invalid input detected. Type 'help' for commands.", "t-amber")] };
}

// Mount the console inside the device overlay. `exit` hands control back
// to the inspector via opts.onExit.
export function openCli(body, host, opts = {}) {
  const d = S.devices[host];
  const prompt = host + ">";
  body.innerHTML = `
  <div class="cli-frame">
    <div class="cli-bar"><span>CONSOLE</span><b>${host}</b><span class="cli-tag">READ-ONLY · TYPE help</span></div>
    <div class="cli-body">
      <div class="term">
        <div class="term-out"></div>
        <div class="term-input-row"><span class="term-prompt">${prompt}</span>
        <input class="term-input" spellcheck="false" autocomplete="off"/></div>
      </div>
    </div>
  </div>`;

  const term = body.querySelector(".term");
  const out = body.querySelector(".term-out");
  const input = body.querySelector(".term-input");
  const history = []; let hIdx = -1;

  function print(lines) {
    for (const l of lines) {
      const div = document.createElement("div");
      div.className = "t-line " + (l.cls || "");
      div.textContent = l.text;
      out.appendChild(div);
    }
    term.scrollTop = term.scrollHeight;
  }

  print([
    line(`ECHO//LINK console — ${host} · ${d.role}`, "t-dim"),
    ...(d.power ? [] : [line("% Device has no power. Interface state is unavailable.", "t-amber")]),
    line(""),
  ]);
  setTimeout(() => input.focus(), 50);
  term.addEventListener("click", () => input.focus());

  function exitConsole() { if (opts.onExit) opts.onExit(); }

  function exec(raw) {
    const cmd = raw.trim();
    print([line(`${prompt} ${cmd}`, "t-white")]);
    const res = cliCommand(host, cmd);
    if (res.clear) { out.innerHTML = ""; return; }
    if (res.lines.length) print(res.lines);
    if (res.exit) exitConsole();
  }

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const v = input.value; input.value = "";
      history.push(v); hIdx = history.length;
      sfx.type(); exec(v);
    } else if (e.key === "Escape") {
      exitConsole();
    } else if (e.key === "ArrowUp") {
      if (hIdx > 0) input.value = history[--hIdx]; e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (hIdx < history.length - 1) input.value = history[++hIdx]; else { hIdx = history.length; input.value = ""; }
      e.preventDefault();
    }
    e.stopPropagation(); // don't trigger game hotkeys while typing
  });
}
