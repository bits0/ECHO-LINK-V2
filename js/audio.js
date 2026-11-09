// ============================================================
// ECHO//LINK — WebAudio synth + restrained location ambience
// No audio files or network requests; everything is synthesized.
// ============================================================
import { S } from "./state.js";

let ctx = null;
let typeStep = 0;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, type="sine", gain=0.06, when=0) {
  if (S.muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, a.currentTime + when);
    g.gain.linearRampToValueAtTime(gain, a.currentTime + when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + when); o.stop(a.currentTime + when + dur + 0.05);
  } catch(e) {}
}

export const sfx = {
  click:   () => tone(660, .07, "triangle", .04),
  hover:   () => tone(440, .045, "sine", .02),
  step:    () => { tone(180, .09, "sine", .05); },
  type:    () => { typeStep = (typeStep + 1) % 7; tone(880 + typeStep*20, .03, "square", .015); },
  notify:  () => { tone(740, .12, "sine", .06); tone(988, .16, "sine", .06, .12); },
  success: () => { tone(523, .14, "sine", .06); tone(659, .14, "sine", .06, .11); tone(784, .22, "sine", .06, .22); },
  fix:     () => { tone(392, .1, "triangle", .05); tone(523, .16, "triangle", .05, .09); },
  error:   () => tone(196, .18, "sawtooth", .03),
  power:   () => { tone(120, .25, "sine", .07); tone(240, .3, "sine", .04, .1); },
};

// Each room has a distinct, very quiet spectral signature.
const PROFILES = {
  hallway: { hum:55,  overtone:110, noise:420,  gain:.032 },
  server:  { hum:72,  overtone:144, noise:920,  gain:.052 },
  office:  { hum:60,  overtone:180, noise:560,  gain:.030 },
  home:    { hum:48,  overtone:96,  noise:300,  gain:.022 },
};
let room = null;
let bed = null;
let ducked = false;
let stopTimer = null;

function noiseBuffer(a) {
  // Deterministic noise keeps the sound identical between visits.
  const length = a.sampleRate * 2;
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 1042;
  for (let i=0; i<length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = ((seed / 4294967296) * 2 - 1) * .32;
  }
  return buffer;
}

function killBed() {
  if (!bed) return;
  const old = bed;
  bed = null;
  try { old.master.gain.setTargetAtTime(0, ctx.currentTime, .08); } catch(e) {}
  setTimeout(() => {
    for (const n of old.nodes) { try { n.stop(); } catch(e) {} try { n.disconnect(); } catch(e) {} }
    try { old.master.disconnect(); } catch(e) {}
  }, 450);
}

function startBed() {
  if (!room || S.muted || bed) return;
  try {
    const a = ac(), p = PROFILES[room] || PROFILES.hallway;
    const master = a.createGain();
    master.gain.setValueAtTime(0, a.currentTime);
    master.gain.linearRampToValueAtTime(ducked ? p.gain*.25 : p.gain, a.currentTime + .8);
    master.connect(a.destination);
    const nodes = [];

    for (const [freq, level] of [[p.hum,.34],[p.overtone,.09]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = freq; g.gain.value = level;
      o.connect(g); g.connect(master); o.start(); nodes.push(o);
    }
    const noise = a.createBufferSource(), filter = a.createBiquadFilter(), ng = a.createGain();
    noise.buffer = noiseBuffer(a); noise.loop = true;
    filter.type = "lowpass"; filter.frequency.value = p.noise; filter.Q.value = .5;
    ng.gain.value = room === "server" ? .22 : .10;
    noise.connect(filter); filter.connect(ng); ng.connect(master); noise.start(); nodes.push(noise);
    bed = { master, nodes };
  } catch(e) {}
}

export const ambience = {
  setScene(scene) {
    if (room === scene) return;
    room = scene;
    clearTimeout(stopTimer);
    killBed();
    if (!S.muted) stopTimer = setTimeout(startBed, 220);
  },
  sync() {
    clearTimeout(stopTimer);
    if (S.muted) killBed();
    else if (!bed) startBed();
  },
  duck(value) {
    ducked = value;
    if (!bed || !ctx) return;
    const p = PROFILES[room] || PROFILES.hallway;
    try { bed.master.gain.setTargetAtTime(value ? p.gain*.25 : p.gain, ctx.currentTime, .12); } catch(e) {}
  },
};
