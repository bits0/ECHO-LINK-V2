// ============================================================
// ECHO//LINK — simulated terminal: help · ipconfig · ping · clear · exit
// Output is honest: failures print what real tools print.
// ============================================================
import { ping, ipconfig, helpText } from "./net.js";
import { sfx } from "./audio.js";
import { save } from "./state.js";
import { activeScenario } from "./scenario.js";

// host = the machine this terminal belongs to; PC-C unless told otherwise.
export function openTerminal(body, ctx, host = activeScenario.player) {
  const prompt = `${host} C:\\Users\\tech>`;
  body.innerHTML = `<div class="term"><div class="term-out"></div>
    <div class="term-input-row"><span class="term-prompt">${prompt}</span>
    <input class="term-input" spellcheck="false" autocomplete="off"/></div></div>`;

  const term = body.querySelector(".term");
  const out = body.querySelector(".term-out");
  const input = body.querySelector(".term-input");
  const history = []; let hIdx = -1;

  print([{text:`ECHO//LINK field terminal · ${host} — type 'help' for commands.`, cls:"t-dim"},{text:"",cls:""}]);
  setTimeout(()=>input.focus(), 50);
  term.addEventListener("click", () => input.focus());

  function print(lines) {
    for (const l of lines) {
      const div = document.createElement("div");
      div.className = "t-line " + (l.cls||"");
      div.textContent = l.text;
      out.appendChild(div);
    }
    term.scrollTop = term.scrollHeight;
  }

  function printDelayed(lines, done) {
    let i = 0;
    (function next(){
      if (i >= lines.length) { if (done) done(); return; }
      const l = lines[i++];
      const div = document.createElement("div");
      div.className = "t-line " + (l.cls||"");
      div.textContent = l.text;
      out.appendChild(div);
      term.scrollTop = term.scrollHeight;
      if (l.cls === "t-green" && l.text.startsWith("Reply")) sfx.type();
      setTimeout(next, l.delay ? Math.min(l.delay, 600) : 40);
    })();
  }

  function exec(raw) {
    const cmd = raw.trim();
    print([{ text:`${prompt} ${cmd}`, cls:"t-white" }]);
    if (!cmd) return;
    const [c, ...args] = cmd.split(/\s+/);
    const target = args[0];

    switch (c.toLowerCase()) {
      case "help": print(helpText()); break;
      case "clear": out.innerHTML = ""; break;
      case "exit": {
        const win = body.closest(".win");
        if (win) { win.remove(); break; }
        body.closest(".ns-terminal")?.classList.add("hidden");
        break;
      }
      case "ipconfig": print(ipconfig(host)); break;
      case "ping": {
        if (!target) { print([{text:"Usage: ping <name-or-ip>", cls:"t-dim"}]); break; }
        const lines = ping(target, host);
        printDelayed(lines, () => {
          // story verification belongs to the player's machine, not any desk PC
          if (host === activeScenario.player) ctx.story.onPingResult(target, lines);
          save();
        });
        break;
      }
      default:
        print([{text:`'${c}' is not recognized. Type 'help'.`, cls:"t-dim"}]);
    }
  }

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const v = input.value; input.value = "";
      history.push(v); hIdx = history.length;
      sfx.type(); exec(v);
    } else if (e.key === "ArrowUp") {
      if (hIdx > 0) input.value = history[--hIdx]; e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (hIdx < history.length - 1) input.value = history[++hIdx]; else { hIdx = history.length; input.value = ""; }
      e.preventDefault();
    }
    e.stopPropagation(); // don't trigger game hotkeys while typing
  });
}
