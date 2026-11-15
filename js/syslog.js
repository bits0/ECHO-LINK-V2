// SYSLOG — Network Space's event feed. Severity and payload are data on every
// log entry; only the short card title is derived from the message text.
import { S } from "./state.js";

const CHIPS = ["ALL", "CRIT", "WARN+", "L0", "L1", "L2", "L3"];

const TITLES = [
  [/^heartbeat interval drift/, "heartbeat drift"],
  [/^heartbeat lost/, "heartbeat lost"],
  [/^heartbeat ok/, "heartbeat ok"],
  [/^log ingest backlog/, "log backlog"],
  [/^clock resync/, "clock resync"],
  [/^log rotation/, "log rotation"],
  [/^mgmt link/, "mgmt link down"],
  [/^trunk to /, "trunk down"],
  [/^uplink to /, "uplink down"],
  [/^link down/, "link down"],
  [/^link up/, "link up"],
  [/^interface /, "interface down"],
  [/^iscsi session .* reset/, "iscsi reset"],
  [/^iscsi session /, "iscsi session"],
  [/^fabric login lost/, "fabric login lost"],
  [/^fabric login ok/, "fabric login"],
  [/^camera feed lost/, "camera feed lost"],
  [/^door bus offline/, "door bus offline"],
  [/^dhcp lease renewal failed/, "dhcp lease failed"],
  [/^dhcp lease ok/, "dhcp lease"],
  [/^port .* link up/, "link up"],
  [/^stp topology change/, "stp change"],
  [/^stp root/, "stp root"],
  [/^bgp keepalive/, "bgp keepalive"],
  [/^battery self-test/, "battery self-test"],
  [/^serial port/, "serial port"],
  [/^unreachable/, "unreachable"],
  [/^console lead/, "console lead"],
];
const titleOf = m => (TITLES.find(([re]) => re.test(m)) || [null, m.split(/\s+/).slice(0, 3).join(" ")])[1];

const h = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export function mountSyslogFeed(root, opts = {}) {
  const onSource = opts.onSource || (() => {});
  let chip = "ALL", frozen = false, newCount = 0, lastLen = S.logs.length, stick = true;

  root.innerHTML = `
    <div class="nf-head">
      <div class="nf-counts" id="nf-counts"></div>
      <div class="nf-chips">${CHIPS.map(c => `<button class="nf-chip${c === "ALL" ? " on" : ""}" data-chip="${c}">${c}</button>`).join("")}</div>
      <button class="nf-freeze" id="nf-freeze">FREEZE</button>
      <button class="nf-new hidden" id="nf-new">0 NEW</button>
    </div>
    <div class="nf-scroll" id="nf-scroll"><div class="nf-list" id="nf-list"></div></div>`;
  const counts = root.querySelector("#nf-counts");
  const list = root.querySelector("#nf-list");
  const scroller = root.querySelector("#nf-scroll");
  const freezeBtn = root.querySelector("#nf-freeze");
  const newPill = root.querySelector("#nf-new");

  // stick to the newest card only while the player is at the bottom
  scroller.addEventListener("scroll", () => {
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 40;
    if (stick && !frozen) {
      newCount = 0;
      newPill.classList.add("hidden");
    }
  });

  const keep = log => chip === "ALL" ? true
    : chip === "CRIT" ? log.sev === "CRIT"
    : chip === "WARN+" ? log.sev !== "INFO"
    : log.payload && log.payload.layer === chip;

  // an entry is new for one animation's worth of time after it lands
  const isFresh = log => !!log.arrivedAt && Date.now() - log.arrivedAt < 400;

  function drawCounts() {
    const n = { INFO: 0, WARN: 0, CRIT: 0 };
    for (const log of S.logs) n[log.sev] = (n[log.sev] || 0) + 1;
    counts.replaceChildren(
      h("span", "nf-i", `INFO ${n.INFO}`),
      h("span", "nf-sep", "·"),
      h("span", "nf-w", `WARN ${n.WARN}`),
      h("span", "nf-sep", "·"),
      h("span", "nf-c", `CRIT ${n.CRIT}`),
    );
  }

  function cardFor(log) {
    const card = h("div", "sys-card " + log.sev.toLowerCase());
    if (log.arrivedAt) card.dataset.arrivedAt = String(log.arrivedAt);
    if (isFresh(log)) card.classList.add("is-new");
    const top = h("div", "sc-top");
    top.append(h("span", "sc-title", titleOf(log.message)), h("span", "sc-sev", log.sev));
    const meta = h("div", "sc-meta");
    const src = h("button", "sys-src", log.device);
    src.onclick = () => onSource(log.device);
    meta.append(src, h("span", "sc-ts", log.ts));
    const row = h("div", "sc-msgrow");
    const detail = h("button", "sc-detail", "DETAIL");
    const payload = h("div", "sc-payload hidden");
    for (const [k, v] of Object.entries(log.payload || {})) {
      const kv = h("div", "sc-kv");
      kv.append(h("span", "k", k), h("span", "v", String(v)));
      payload.append(kv);
    }
    detail.onclick = () => {
      detail.textContent = payload.classList.toggle("hidden") ? "DETAIL" : "HIDE";
    };
    row.append(h("span", "sc-msg", log.message), detail);
    card.append(top, meta, row, payload);
    return card;
  }

  function draw() {
    const keepTop = scroller.scrollTop;
    drawCounts();
    list.replaceChildren(...S.logs.filter(keep).map(cardFor));
    scroller.scrollTop = stick && !frozen ? scroller.scrollHeight : keepTop;
  }

  function tick() {
    for (const card of list.querySelectorAll(".sys-card.is-new")) {
      if (Date.now() - Number(card.dataset.arrivedAt) >= 400) card.classList.remove("is-new");
    }
    if (stick && !frozen) scroller.scrollTop = scroller.scrollHeight;
    if (S.logs.length === lastLen) return;
    if (!stick || frozen) {
      newCount += S.logs.length - lastLen;
      newPill.textContent = `${newCount} NEW`;
      newPill.classList.remove("hidden");
    }
    lastLen = S.logs.length;
    draw();
  }

  function unfreeze() {
    frozen = false;
    stick = true;
    newCount = 0;
    freezeBtn.classList.remove("on");
    newPill.classList.add("hidden");
    scroller.scrollTop = scroller.scrollHeight;
  }

  freezeBtn.onclick = () => {
    frozen = !frozen;
    freezeBtn.classList.toggle("on", frozen);
    if (frozen) {
      newCount = 0;
      newPill.classList.add("hidden");
    } else unfreeze();
  };
  newPill.onclick = () => {
    if (frozen) return unfreeze();
    stick = true;
    newCount = 0;
    newPill.classList.add("hidden");
    scroller.scrollTop = scroller.scrollHeight;
  };

  root.querySelector(".nf-chips").addEventListener("click", e => {
    const btn = e.target.closest(".nf-chip");
    if (!btn) return;
    chip = btn.dataset.chip;
    for (const c of root.querySelectorAll(".nf-chip")) c.classList.toggle("on", c === btn);
    draw();
  });

  draw();
  const timer = setInterval(tick, 150);
  return {
    refresh: () => { lastLen = S.logs.length; draw(); },
    destroy: () => clearInterval(timer),
  };
}
