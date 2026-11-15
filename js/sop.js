// SOP — read-only procedure pages with a title/body search.
import { S } from "./state.js";

export function openSop(body) {
  const wrap = document.createElement("div");
  wrap.className = "sop";
  const input = document.createElement("input");
  input.className = "sop-search";
  input.placeholder = "search procedures";
  input.spellcheck = false;
  input.addEventListener("keydown", e => e.stopPropagation());
  const list = document.createElement("div");
  list.className = "sop-list";
  wrap.append(input, list);
  body.append(wrap);

  function draw() {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren();
    const pages = S.sop.filter(p => !q || (p.title + "\n" + p.body).toLowerCase().includes(q));
    if (!pages.length) {
      const empty = document.createElement("div");
      empty.className = "sop-empty";
      empty.textContent = "No matching procedure.";
      list.append(empty);
    }
    for (const p of pages) {
      const page = document.createElement("div");
      page.className = "sop-page";
      const title = document.createElement("div");
      title.className = "sop-title";
      title.textContent = p.title;
      const text = document.createElement("pre");
      text.className = "sop-body";
      text.textContent = p.body;
      page.append(title, text);
      list.append(page);
    }
  }
  input.oninput = draw;
  draw();
  input.focus();
}
