// ============================================================
// ECHO//LINK — main: boot, navigation, input, HUD
// ============================================================
import { S, resetState, save, loadSave, hasSave, savedIsLab, clearSave, currentObjective, objectiveDone, OBJECTIVES, setupCabling, getSettings, setSetting } from "./state.js";
import { SCENES } from "./scenes.js";
import { setScenario, SCENARIOS, CHAPTER1, CHAPTER1_LAB } from "./scenario.js";
import { sfx, ambience } from "./audio.js";
import { initDevice, openDevice, closeDevice, openPatchPanel, openOutlet, cableInHand, dropHand } from "./device.js";
import { initDesktop, openDesktop, closeDesktop } from "./desktop.js";
import { closeNetspace } from "./netspace.js";
import { initPhone, wirePhoneButton, openPhone, closePhone, togglePhone, refreshBadge, renderTab } from "./phone.js";
import { initStory, story, letterbox } from "./story.js";

const el = id => document.getElementById(id);
const $ = s => document.querySelector(s);

// ---------------- toast ----------------
let toastTimer = null;
function toast(text, cls="") {
  const t = el("toast");
  t.textContent = text;
  t.className = cls ? "toast-" + cls : "";
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3600);
}

// ---------------- objective bar ----------------
let lastObjectiveId = null;
function updateObjectiveBar() {
  const bar = el("objective-bar");
  if (S.mechanicsMode) {
    bar.classList.remove("hidden", "obj-flash");
    el("objective-text").textContent = "MECHANICS LAB — inspect, power, cable, verify";
    lastObjectiveId = "lab";
    return;
  }
  const cur = currentObjective();
  if (!cur) { bar.classList.add("hidden"); lastObjectiveId = null; return; }
  bar.classList.remove("hidden");
  el("objective-text").textContent = cur.text;
  if (lastObjectiveId && lastObjectiveId !== cur.id) {
    bar.classList.remove("obj-flash");
    void bar.offsetWidth;
    bar.classList.add("obj-flash");
  }
  lastObjectiveId = cur.id;
}

// ---------------- navigation ----------------
let navigating = false;
function paintScene(scene) {
  const layers = el("scene-layers");
  layers.innerHTML = SCENES[scene].svg();
  layers.classList.remove("scene-fade");
  void layers.offsetWidth;
  layers.classList.add("scene-fade");
  el("location-bar").textContent = SCENES[scene].label;
  ambience.setScene(scene);
}
function navigate(scene, instant=false) {
  if (navigating || !SCENES[scene]) return;
  const move = () => {
    S.scene = scene; save();
    paintScene(scene);
    sfx.step();
    story.onEnterScene(scene);
    updateObjectiveBar();
  };
  if (!instant && S.scene !== scene) {
    navigating = true;
    el("transition-veil").classList.add("on");
    setTimeout(() => {
      move();
      requestAnimationFrame(() => {
        el("transition-veil").classList.remove("on");
        navigating = false;
      });
    }, 190);
  } else move();
}

function refreshScene() { paintScene(S.scene); }

// hotspot interaction (event delegation)
el("scene-layers").addEventListener("click", e => {
  if (navigating) return;
  const hs = e.target.closest(".hotspot");
  if (!hs) return;
  const id = hs.dataset.hs;
  sfx.click();

  if (id.startsWith("door:")) {
    const dest = id.slice(5);
    if (dest === "exit") {
      if (!S.mechanicsMode) {
        if (!S.jobAccepted) { toast("The job first. Your phone is waiting.", "amber"); return; }
        if (!S.finalChatDone) { toast("Not yet — there's still work on this floor.", "amber"); return; }
      }
      navigate("home"); return;
    }
    navigate(dest); return;
  }
  if (id === "device:panel") { openPatchPanel(); return; }
  if (id.startsWith("outlet:")) { openOutlet(id.slice(7)); return; }
  if (id.startsWith("device:")) {
    const name = id.slice(7);
    openDevice(name); return;
  }
  if (id === "home:laptop") {
    if (S.mechanicsMode) toast("Report flow disabled in Mechanics Lab.", "amber");
    else openPhone("jobs");
    return;
  }
});
el("scene-layers").addEventListener("mouseover", e => {
  const hs = e.target.closest(".hotspot");
  const lab = el("hotspot-label");
  if (hs) { lab.textContent = "▸ " + hs.dataset.label; lab.classList.remove("hidden"); sfx.hover(); }
  else lab.classList.add("hidden");
});
el("scene-layers").addEventListener("mouseleave", () => el("hotspot-label").classList.add("hidden"));

// gentle parallax — the room breathes with the cursor
$("#viewport").addEventListener("mousemove", e => {
  const cx = (e.clientX / innerWidth - .5), cy = (e.clientY / innerHeight - .5);
  el("scene-layers").style.transform = `translate(${cx*-16}px, ${cy*-10}px)`;
});

// ---------------- changed events from interactions ----------------
function changed(reason, arg) {
  story.onChanged(reason, arg);
  refreshScene();          // LEDs / monitors update
  renderTabIfOpen();
  updateObjectiveBar();
  save();
}
function renderTabIfOpen() {
  if (!el("phone-overlay").classList.contains("hidden")) renderTab();
}

// ---------------- shared context ----------------
const ctx = {
  toast, updateObjectiveBar, navigate, changed,
  story,
  netspaceAnimate: null,   // set by Network Space while open
  openDesktop: opts => openDesktop(opts),
  closeDesktop: opts => closeDesktop(opts),
  showEnd,
};
initDevice(ctx);
initDesktop(ctx);
initPhone(ctx);
initStory(ctx);
wirePhoneButton();

// ---------------- hints (amber dot) ----------------
el("amber-dot").onclick = () => {
  sfx.notify();
  const [text] = story.currentHint();
  el("hint-text").textContent = text;
  el("hint-card").classList.remove("hidden");
  const [, hasMore] = story.currentHint();
  el("hint-more").style.display = hasMore ? "" : "none";
};
el("hint-more").onclick = () => {
  story.advanceHint(); sfx.click();
  const [text, hasMore] = story.currentHint();
  el("hint-text").textContent = text;
  el("hint-more").style.display = hasMore ? "" : "none";
};
el("hint-close").onclick = () => { sfx.click(); el("hint-card").classList.add("hidden"); };

// ---------------- pause ----------------
let paused = false;
function setPaused(v) {
  paused = v;
  el("pause-overlay").classList.toggle("hidden", !v);
  ambience.duck(v);
}
el("pause-resume").onclick = () => { sfx.click(); setPaused(false); };
el("pause-mute").onclick = () => {
  S.muted = !S.muted; save();
  el("pause-mute").textContent = "SOUND: " + (S.muted ? "OFF" : "ON");
  el("title-mute").textContent = "SOUND: " + (S.muted ? "OFF" : "ON");
  ambience.sync();
};
el("pause-restart").onclick = () => {
  if (!confirm("Restart Chapter 1 from the beginning? Your save will be erased.")) return;
  clearSave(); location.reload();
};
el("pause-quit").onclick = () => { save(); location.reload(); };

// ---------------- keyboard ----------------
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "Tab") { e.preventDefault(); if (!paused && !S.mechanicsMode) togglePhone(); }
  if (e.key === "Escape") {
    if (cableInHand()) { dropHand(); return; }   // a connector in hand is dropped first
    if (!el("phone-overlay").classList.contains("hidden")) { closePhone(); return; }
    if (!el("hint-card").classList.contains("hidden")) { el("hint-card").classList.add("hidden"); return; }
    if (!el("netspace-overlay").classList.contains("hidden")) { closeNetspace(); return; }
    if (!el("desktop-overlay").classList.contains("hidden")) { closeDesktop(); return; }
    if (el("title-screen").classList.contains("hidden")) setPaused(!paused);
  }
});

// ---------------- ending ----------------
function showEnd() {
  S.ended = true; clearSave();
  const mins = Math.max(1, Math.round((Date.now() - S.stats.startTime) / 60000));
  el("end-stats").innerHTML =
    `pings sent — <b>${S.stats.pings}</b><br/>connections restored — <b>${S.stats.fixes}</b><br/>time on site — <b>${mins} min</b>`;
  el("end-overlay").classList.remove("hidden");
  ambience.duck(true);
  sfx.success();
}
el("end-restart").onclick = () => { clearSave(); location.reload(); };

// ---------------- boot ----------------
function startGame(fresh, mechanics=false) {
  if (fresh) {
    // The scenario must be selected before state is created: a fresh state
    // seeds its roster from the active scenario.
    setScenario((mechanics ? CHAPTER1_LAB : CHAPTER1).id);
    resetState();
    S.started = true;
    S.mechanicsMode = mechanics;
    setupCabling();
    if (mechanics) {
      S.jobAccepted = true;   // physical access is unlocked; narrative jobs are bypassed
      // Lab starts with a live network: everything powered on so links can be
      // inspected first, then broken deliberately with the power toggles.
      for (const name of Object.keys(S.devices)) {
        S.devices[name].power = true;
        if (!S.poweredOn.includes(name)) S.poweredOn.push(name);
      }
    }
    save();
  } else {
    // Resuming a save: run the night it was saved in, not whichever one
    // happens to be active.
    setScenario(S.scenarioId in SCENARIOS ? S.scenarioId
      : (S.mechanicsMode ? CHAPTER1_LAB.id : CHAPTER1.id));
  }
  lastObjectiveId = null;
  el("title-screen").classList.add("hidden");
  el("game-screen").classList.remove("hidden");
  el("amber-dot").classList.toggle("hidden", S.mechanicsMode);
  el("phone-button").classList.toggle("hidden", S.mechanicsMode);
  el("pause-restart").textContent = S.mechanicsMode ? "RESTART LAB" : "RESTART CHAPTER";
  el("pause-mute").textContent = "SOUND: " + (S.muted ? "OFF" : "ON");
  el("title-mute").textContent = "SOUND: " + (S.muted ? "OFF" : "ON");
  navigate(S.scene, true);
  refreshBadge();
  updateObjectiveBar();
  if (fresh && !S.mechanicsMode) story.onGameStart();
}

el("btn-start").onclick = () => { sfx.click(); if (hasSave() && !confirm("Start over? Your existing save will be erased.")) return; startGame(true, false); };
el("btn-lab").onclick = () => { sfx.click(); if (hasSave() && !confirm("Start a fresh Mechanics Lab? Your existing save will be erased.")) return; startGame(true, true); };
el("btn-continue").onclick = () => { if (loadSave()) { sfx.click(); startGame(false, S.mechanicsMode); } };
el("title-settings").onclick = () => {
  el("set-ns-remember").checked = !!getSettings().nsRememberView;
  el("settings-overlay").classList.remove("hidden");
};
el("settings-close").onclick = () => el("settings-overlay").classList.add("hidden");
el("set-ns-remember").onchange = e => setSetting("nsRememberView", e.target.checked);
el("title-mute").onclick = () => {
  S.muted = !S.muted;
  el("title-mute").textContent = "SOUND: " + (S.muted ? "OFF" : "ON");
  ambience.sync();
};

if (hasSave() && savedIsLab()) el("btn-continue").disabled = false;

// title ambient: gentle mark pulse is CSS; nothing else needed
