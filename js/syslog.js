// SYSLOG — the event log. Array order is render order; newest at the bottom.
import { S } from "./state.js";
import { pinLog, removePin } from "./act0.js";

export function openSyslog(body) {
  body.innerHTML = `
    <div class="syslog">
      <div class="syslog-pins hidden" id="syslog-pins"></div>
      <div class="syslog-list" id="syslog-list"></div>
    </div>`;
  const pins = body.querySelector("#syslog-pins");
  const list = body.querySelector("#syslog-list");

  function draw() {
    list.replaceChildren();
    if (!S.logs.length) {
      const empty = document.createElement("div");
      empty.className = "syslog-empty";
      empty.textContent = "No events.";
      list.append(empty);
    }
    S.logs.forEach((l, i) => {
      const row = document.createElement("div");
      row.className = "syslog-line";
      for (const [cls, text] of [["sl-ts", l.ts], ["sl-dev", l.device], ["sl-msg", l.message]]) {
        const cell = document.createElement("span");
        cell.className = cls;
        cell.textContent = text;
        row.append(cell);
      }
      row.onclick = () => { pinLog(i); draw(); };
      list.append(row);
    });

    pins.replaceChildren();
    pins.classList.toggle("hidden", !S.pins.length);
    S.pins.map((p, i) => ({ p, i })).reverse().forEach(({ p, i }) => {
      const row = document.createElement("div");
      row.className = "syslog-pin";
      row.textContent = `${p.ts} · ${p.message}`;
      row.onclick = () => { removePin(i); draw(); };
      pins.append(row);
    });

    list.scrollTop = list.scrollHeight;
  }
  draw();
}
