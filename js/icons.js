// ============================================================
// ECHO//LINK — node card icons (authored SVGs, theme-adapted)
// The source SVGs carry their own palette; we re-tint the card to
// the blueprint theme and swap the status badge per device state.
// ============================================================

const RAW = {
  pc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect x="12" y="12" width="136" height="136" rx="25" fill="#202329" stroke="#606875" stroke-width="2"/><rect x="15" y="15" width="130" height="130" rx="22" fill="none" stroke="#303741"/><g fill="none" stroke="#E4E9EF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><rect x="38" y="45" width="84" height="57" rx="5"/><path d="M38 89h84M80 102v16M61 118h38"/></g><circle cx="137" cy="23" r="12" fill="#202329"/><circle cx="137" cy="23" r="7" fill="#4ADE80"/><circle cx="137" cy="23" r="10" fill="none" stroke="#4ADE80" stroke-opacity=".3" stroke-width="2"/></svg>`,
  switch: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none"><rect x="12" y="12" width="136" height="136" rx="25" fill="#202329" stroke="#606875" stroke-width="2"/><rect x="15" y="15" width="130" height="130" rx="22" stroke="#303741" stroke-width="1"/><g stroke="#E4E9EF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="43" y="60" width="74" height="40" rx="6"/><path d="M52 72h56M52 87h56" opacity=".28"/><path d="M57 79h8m10 0h8m10 0h8"/><path d="m61 51-8 7 8 7m38-14 8 7-8 7"/></g><circle cx="137" cy="23" r="12" fill="#202329"/><circle cx="137" cy="23" r="7" fill="#4ADE80"/><circle cx="137" cy="23" r="10" fill="none" stroke="#4ADE80" stroke-opacity=".3" stroke-width="2"/></svg>`,
  router: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect x="12" y="12" width="136" height="136" rx="25" fill="#202329" stroke="#606875" stroke-width="2"/><rect x="15" y="15" width="130" height="130" rx="22" fill="none" stroke="#303741"/><g fill="none" stroke="#E4E9EF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><rect x="43" y="74" width="74" height="29" rx="6"/><path d="M62 74V57M98 74V57M54 54Q62 46 70 54M90 54Q98 46 106 54M47 44Q62 29 77 44M83 44Q98 29 113 44"/><path d="M54 89h3m9 0h3m9 0h3"/></g><circle cx="137" cy="23" r="12" fill="#202329"/><circle cx="137" cy="23" r="7" fill="#4ADE80"/><circle cx="137" cy="23" r="10" fill="none" stroke="#4ADE80" stroke-opacity=".3" stroke-width="2"/></svg>`,
  server: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect x="12" y="12" width="136" height="136" rx="25" fill="#202329" stroke="#606875" stroke-width="2"/><rect x="15" y="15" width="130" height="130" rx="22" fill="none" stroke="#303741"/><g fill="none" stroke="#E4E9EF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><rect x="55" y="40" width="50" height="80" rx="5"/><path d="M55 66h50M55 93h50"/><circle cx="67" cy="53" r="2.5" fill="#E4E9EF" stroke="none"/><circle cx="67" cy="80" r="2.5" fill="#E4E9EF" stroke="none"/><circle cx="67" cy="106" r="2.5" fill="#E4E9EF" stroke="none"/><path d="M83 53h12M83 80h12M83 106h12"/></g><circle cx="137" cy="23" r="12" fill="#202329"/><circle cx="137" cy="23" r="7" fill="#4ADE80"/><circle cx="137" cy="23" r="10" fill="none" stroke="#4ADE80" stroke-opacity=".3" stroke-width="2"/></svg>`,
};

// re-tint the authored palette into the blueprint theme
function themed(src, glyph, badge) {
  return src
    .replaceAll("#202329", "#11151b")   // card face + badge backing
    .replaceAll("#606875", "#3d4552")   // card border
    .replaceAll("#303741", "#202833")   // inner hairline
    .replaceAll("#E4E9EF", glyph)       // the glyph strokes
    .replaceAll("#4ADE80", badge);      // the status badge
}

const cache = new Map();
const pending = new Set();

// Returns a cached HTMLImageElement for a node card.
// glyph/badge are CSS colors; the loop redraws, so async load is fine.
export function nodeIconImage(type, glyph, badge) {
  const key = `${type}|${glyph}|${badge}`;
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(themed(RAW[type] || RAW.pc, glyph, badge));
    cache.set(key, img);
  }
  return img;
}
