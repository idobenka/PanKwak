// systems/timer.js — the soft sunset clock + day-cycle palette shift.
//
// Per the design doc: the sunset is the SOFT deadline. It drains slowly; running out is a
// soft "the party will wait" fail, NEVER a hard death-clock. The palette shifts along a
// dawn→noon→sunset→dusk arc as time drains — mood only, conveyed as a piecewise blend between
// the four config palette anchors (CATS-49). The sun + clouds live in render.js; here we only
// resolve the color blend a given progress resolves to.

export function createTimer(cfg) {
  const sunsetDuration = () => cfg.sunset.duration;
  const state = {
    remaining: sunsetDuration(), // seconds
    total: sunsetDuration(),
    expired: false,
  };

  function reset() {
    state.total = sunsetDuration();
    state.remaining = state.total;
    state.expired = false;
  }

  // Advance by dt seconds. Returns the fractional progress 0..1 (1 = full daylight left).
  function update(dt) {
    if (state.expired) return progress();
    state.remaining -= dt;
    if (state.remaining <= 0) {
      state.remaining = 0;
      state.expired = true;
    }
    return progress();
  }

  function progress() {
    return state.total > 0 ? state.remaining / state.total : 0;
  }

  return { state, reset, update, progress };
}

// Blend one channel between two hex stops by t in 0..1.
function lerpHex(h1, h2, t) {
  const a = hexToRgb(h1);
  const b = hexToRgb(h2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// Blend all four channels (sky/water/sun/ambient) of two stops by t in 0..1.
function lerpStop(c1, c2, t) {
  return {
    sky: lerpHex(c1.sky, c2.sky, t),
    water: lerpHex(c1.water, c2.water, t),
    sun: lerpHex(c1.sun, c2.sun, t),
    ambient: lerpHex(c1.ambient, c2.ambient, t),
  };
}

// Map a 1.0→0.0 daylight progress to a palette color via a piecewise lerp across the four
// anchors (dawn 0.90 → noon 0.50 → sunset 0.10 → dusk 0.00). Progress is held at dawn above
// its anchor and clamped to dusk below it. Return shape is the EXTENDED {sky, water, sun,
// ambient}; the two original {water, sky} keys are preserved so existing callers (render.js,
// hud.js) reading only pal.sky/pal.water keep working unchanged (CATS-49 §4).
export function paletteForProgress(cfg, p) {
  const stops = cfg.palette;
  const a = cfg.palette.anchors;
  // Anchors are strictly descending along progress; ordered high→low for the segment search.
  const ordered = [
    { p: a.dawn, c: stops.dawn },
    { p: a.noon, c: stops.noon },
    { p: a.sunset, c: stops.sunset },
    { p: a.dusk, c: stops.dusk },
  ];
  if (p >= a.dawn) return { ...stops.dawn };          // hold dawn at the very start
  if (p <= a.dusk) return { ...stops.dusk };           // warm twilight at expiry
  let lo = ordered[0], hi = ordered[1];
  for (let i = 0; i < ordered.length - 1; i++) {
    if (p <= ordered[i].p && p >= ordered[i + 1].p) { lo = ordered[i]; hi = ordered[i + 1]; break; }
  }
  const t = (p - lo.p) / (hi.p - lo.p || 1);           // 0 at lo, 1 at hi
  return lerpStop(lo.c, hi.c, t);
}
