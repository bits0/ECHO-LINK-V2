// NOTEPAD — one scratch pad, bound to S.notepad.
import { S, save } from "./state.js";

export function openNotepad(body) {
  const ta = document.createElement("textarea");
  ta.className = "notepad";
  ta.spellcheck = false;
  ta.value = S.notepad;
  body.append(ta);
  let timer = null;
  const flush = () => { S.notepad = ta.value; clearTimeout(timer); save(); };
  ta.oninput = () => {
    S.notepad = ta.value;
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  ta.onblur = flush;
  ta.focus();
  return flush;
}
