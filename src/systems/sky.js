// systems/sky.js — the sky-landscape timer readout: sun arc + drifting clouds.
//
// Replaces the flat sunset bar (CATS-47). The SUN is a pure function of timer progress — no
// state of its own — so it is computed in render from `arcFrac = 1 − progress`. The CLOUDS
// drift independently of the timer (ambient weather, not a clock signal), so they DO carry
// state: position advances in the fixed-timestep update() here (deterministic, pause-safe),
// never off performance.now() in render. On reset() the clouds re-seed from the same config
// the constructor reads, so a new run starts clean (no CATS-36 stuck-state regression).
//
// Sun/cloud look follows the Asset Designer recipe (assets/sprites/sky/README.md, CATS-51):
//   sun   = halo (stacked low-alpha arcs, fixed warm-white) → disc (pal.sun) → core (fixed).
//           CATS-79: the sun is now stamped from the sun.svg ASSET (authored at exactly these
//           ratios) with the disc circle repainted in place each frame; the parametric recipe
//           stays as the pre-decode fallback. At the arc's two ends — where the sun sits on
//           the horizon behind the shore-strip treeline — the disc fill blends toward a
//           saturated warm gold (sun.horizonGlow) so the start/finish reads carry more hue.
//   cloud = puffsPerCloud overlapping ellipses on a crest, warm-white at clouds.alpha; the
//           crest puff gets the lighter liftTint (the one warm-light-bias accent).
// Draw order is load-bearing: clouds BEFORE the sun every frame, so the sun (the only clock)
// can never be occluded — by CLOUDS. The shore-strip treeline (drawn later in render.js's
// world pass) DOES occlude the sun's horizon positions by design (CATS-79: sun behind trees).

import { getTexture } from '../assets.js';

// Deterministic per-cloud seed offsets so the band looks scattered without using Math.random
// (the fixed-timestep loop must be deterministic). Spread clouds across the VIEWPORT width and
// vary their base y within the upper ~70% of the band. CATS-68: keyed off camera.viewportWidth
// (the window), not world.width (which is now the 4260-px world length) — clouds must spread
// across what's on screen.
function seedClouds(cfg) {
  const clouds = [];
  const cc = cfg.skyLandscape.clouds;
  const w = cfg.camera.viewportWidth;
  for (let i = 0; i < cc.count; i++) {
    const frac = cc.count === 1 ? 0.5 : i / (cc.count - 1);
    clouds.push({
      // spread evenly across the world width, offset so none starts exactly on an edge
      x: frac * (w - 40) + 20,
      // base y as a fraction of the band height, kept in the upper ~70% (never kiss waterline)
      yFrac: 0.30 + (i % 2 === 0 ? 0.0 : 0.18),
      // shared drift direction — every cloud drifts the same way so the sky reads as one
      // breeze (CATS-72: no cloud goes backwards)
      dir: 1,
    });
  }
  return clouds;
}

export function createSky(cfg) {
  const state = { clouds: seedClouds(cfg) };

  function reset() {
    state.clouds = seedClouds(cfg);
  }

  // Advance cloud drift by dt seconds. Called from the fixed-timestep step() (game.js), NOT
  // from render — keeps drift deterministic and pause-safe. Clouds wrap around the screen edge
  // (a cloud leaving one side re-enters the other) so the band always looks populated.
  function update(dt) {
    const cc = cfg.skyLandscape.clouds;
    const w = cfg.camera.viewportWidth; // CATS-68: clouds wrap across the viewport, not the world
    const margin = 60; // let a cloud drift partly off-screen before it wraps
    for (const c of state.clouds) {
      c.x += c.dir * cc.driftSpeed * dt;
      if (c.x > w + margin) c.x = -margin;
      else if (c.x < -margin) c.x = w + margin;
    }
  }

  return { state, reset, update };
}

// --- pure draw helpers (no mutation) ---

// Sun position from progress: x sweeps left→right, y traces a sine half-arc (low→peak→low).
// arcFrac = 1 − progress: 0 at start (left horizon) → 0.5 at noon (peak) → 1 at end (right).
// The x-travel is inset by the halo radius so the sun (disc + halo) stays fully on-screen at
// both horizons — at dawn/sunset the sun must read clearly as "on the horizon," not half-clipped
// off the frame edge. The Game Designer's "left = lots of time, right = sunset" read is preserved.
export function sunPosition(cfg, progress) {
  const arcFrac = 1 - progress;
  const sun = cfg.skyLandscape.sun;
  const waterline = cfg.skyLandscape.height;
  const lift = sun.arcLift * cfg.skyLandscape.height;
  const inset = sun.radius * sun.glow.radiusMul; // keep disc + halo inside the frame
  // CATS-68: the sun arcs across the VIEWPORT (camera.viewportWidth), not the world. The sun is
  // the clock and is screen-anchored (CATS-66 §3.1) — keying xSpan off the now-4260 world.width
  // would make it barely move across a run and break the "left=lots of time, right=sunset" read.
  const xSpan = cfg.camera.viewportWidth - inset * 2;
  return {
    x: inset + arcFrac * xSpan,
    y: waterline - lift * Math.sin(Math.PI * arcFrac),
  };
}

// CATS-79: the horizon hue boost. At arcFrac 0 or 1 the sun sits ON the horizon — the START
// and FINISH of a run — where the disc itself is hidden behind the shore-strip treeline and
// only the halo peeks between the treetops. In that window the whole sun warms toward
// sun.horizonGlow.tint (a saturated sunrise/sunset gold): the disc fill blends toward it and
// the halo arcs get a matching low-alpha overlay, peaking AT the horizon and easing to 0 by
// `window` (a fraction of the arc) into the climb. Pure function of arcFrac — no state.
function horizonGlowMix(cfg, arcFrac) {
  const hg = cfg.skyLandscape.sun.horizonGlow;
  const edge = Math.min(arcFrac, 1 - arcFrac); // 0 at either horizon, 0.5 at noon
  if (edge >= hg.window) return 0;
  return (1 - edge / hg.window) * hg.strength;
}

// Blend the day-cycle disc fill toward the horizon glow tint by the mix above. Accepts the
// rgb()/hex mix paletteForProgress returns (same parse as the cloud lerp below).
function discFillFor(cfg, pal, arcFrac) {
  const mix = horizonGlowMix(cfg, arcFrac);
  if (mix <= 0) return pal.sun;
  return lerpHex(pal.sun, cfg.skyLandscape.sun.horizonGlow.tint, mix);
}

// The halo-side of the boost: re-draw the three authored halo arcs in the glow tint at the
// same alphas the recipe uses, scaled by the mix. Filled circles (not rings), so the caller
// must paint them UNDER the disc — order matters.
function drawHorizonGlow(ctx, sun, x, y, mix) {
  if (mix <= 0) return;
  ctx.fillStyle = sun.horizonGlow.tint;
  for (const [mul, a] of [[2.6, 0.4], [2.0, 0.6], [1.5, 0.85]]) {
    ctx.globalAlpha = sun.glow.alpha * a * mix;
    ctx.beginPath();
    ctx.arc(x, y, sun.radius * mul, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Draw the sun. CATS-79: stamp the sun.svg asset (halo + disc + core at the authored ratios),
// then repaint the disc circle in place with the day-cycle fill (plus the horizon hue boost) —
// so the SVG carries the look (one asset source of truth) while pal.sun keeps driving the day
// cycle, exactly as the lake water does (base fill = the tint source, texture on top). Falls
// back to the CATS-51 parametric recipe while the SVG hasn't decoded, so the clock never
// disappears. `pal` is paletteForProgress()'s result; `arcFrac` is the sun's arc position
// (0 = left horizon/start, 1 = right horizon/finish).
function drawSun(ctx, cfg, x, y, pal, arcFrac) {
  const sun = cfg.skyLandscape.sun;
  const r = sun.radius;
  const discFill = discFillFor(cfg, pal, arcFrac);
  const mix = horizonGlowMix(cfg, arcFrac);
  const tex = sun.sprite ? getTexture(sun.sprite) : null;
  if (tex && tex instanceof HTMLImageElement) {
    // The SVG frames the disc at r=9 in a 48×48 viewBox; scale the WHOLE frame by r/9 so the
    // stamped halo reaches ≈2.6r, matching the recipe (48/2 = 24 ≈ 23.4). Centered on the arc.
    const frame = (tex.naturalWidth || 48) * (r / 9);
    ctx.drawImage(tex, x - frame / 2, y - frame / 2, frame, frame);
    // CATS-79 horizon hue: warm the halo arcs (the part that peeks past the treeline when the
    // disc itself is hidden) BEFORE the disc goes on top.
    drawHorizonGlow(ctx, sun, x, y, mix);
    // repaint the disc in place over the SVG's noon reference disc (the day-cycle color)…
    ctx.globalAlpha = 1;
    ctx.fillStyle = discFill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // …then the core back on top — the disc repaint covers the SVG's own core, and the core
    // is a FIXED-tint circle (identical to the SVG's), so redrawing it is pixel-exact.
    ctx.fillStyle = sun.core.tint;
    ctx.beginPath();
    ctx.arc(x, y, r * sun.core.radiusMul, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Fallback: the CATS-51 parametric recipe (halo → glow overlay → disc → core).
  for (const [mul, a] of [[2.6, 0.4], [2.0, 0.6], [1.5, 0.85]]) {
    ctx.globalAlpha = sun.glow.alpha * a;
    ctx.fillStyle = sun.glow.tint;
    ctx.beginPath();
    ctx.arc(x, y, r * mul, 0, Math.PI * 2);
    ctx.fill();
  }
  drawHorizonGlow(ctx, sun, x, y, mix);
  ctx.globalAlpha = 1;
  ctx.fillStyle = discFill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = sun.core.tint;
  ctx.beginPath();
  ctx.arc(x, y, r * sun.core.radiusMul, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Draw one cloud = puffsPerCloud overlapping ellipses along a shallow crest (center highest).
// Base tint at clouds.alpha; the crest puff is redrawn in the lighter liftTint. `tint` is the
// warm-white base lerped toward pal.ambient so clouds warm gently at sunset (CATS-51).
function drawCloud(ctx, cfg, x, yBase, tint) {
  const cc = cfg.skyLandscape.clouds;
  const puff = cc.puff;
  const radius = cfg.skyLandscape.height * puff.radiusMul;
  const radiusY = radius * puff.squash;
  const spacing = radius * 2 * (1 - puff.overlap);
  const n = cc.puffsPerCloud;
  const start = x - ((n - 1) * spacing) / 2;
  ctx.fillStyle = tint;
  ctx.globalAlpha = cc.alpha;
  for (let i = 0; i < n; i++) {
    const px = start + i * spacing;
    // crest: center puff highest (smallest y), edges dip — a shallow arc of offsets.
    const crest = Math.sin((i / (n - 1)) * Math.PI); // 0 at edges, 1 at center
    const py = yBase - crest * radiusY * 0.5;
    ctx.beginPath();
    ctx.ellipse(px, py, radius, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // crest puff accent — the single warm-light-bias, expressed as a lighter tint on top.
  ctx.fillStyle = cc.liftTint;
  ctx.beginPath();
  ctx.ellipse(start + ((n - 1) / 2) * spacing, yBase - radiusY * 0.5, radius * 0.7, radiusY * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Draw the full sky-landscape readout: clouds first, then the sun on top (load-bearing order).
// `pal` is paletteForProgress()'s result; pal.sun is the disc fill, pal.ambient warms the cloud tint.
export function drawSky(ctx, cfg, sky, progress, pal) {
  const cc = cfg.skyLandscape.clouds;
  // warm the cloud base tint toward the ambient wash so clouds shift with the day cycle
  const cloudTint = lerpHex(cc.tint, pal.ambient, 0.5);
  for (const c of sky.state.clouds) {
    const yBase = c.yFrac * cfg.skyLandscape.height;
    drawCloud(ctx, cfg, c.x, yBase, cloudTint);
  }
  const arcFrac = 1 - progress;
  const pos = sunPosition(cfg, progress);
  drawSun(ctx, cfg, pos.x, pos.y, pal, arcFrac);
}

function lerpHex(h1, h2, t) {
  const a = toRgb(h1);
  const b = toRgb(h2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// Accept either '#rrggbb' or 'rgb(r,g,b)' — paletteForProgress returns hex at the dawn/dusk
// clamps and rgb() at blended progress, so the cloud tint must parse whichever it gets.
function toRgb(c) {
  if (c.startsWith('rgb')) {
    return c.match(/\d+/g).map(Number);
  }
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
