// systems/decor.js — CATS-123: decoration objects scattered on the grass banks.
//
// The whole ground band is one seamless shore_grass tile; this pass stamps small
// hand-drawn objects (flowers, stones, tufts, berries, mushrooms) onto the banks so the
// shore reads as a lived-in place, not a repeating texture. Three pools, three x-zones:
//   • lake/grass  — the mid-lake banks, between the two shore approaches
//   • lake/start  — the home-shore approach (the left cap), clear of the CATS-105 home
//                   scene stamp's footprint
//   • lake/finish — the party-shore approach (the right cap + festive band), likewise
//                   clear of the finish scene stamp
//   • party ring  — CATS-143: dense lake/finish objects ON + around the centered finish
//                   scene stamp, drawn AFTER the art (overArt style), pulsing softly
//
// Placement is a pure hash of (per-run seed, zone, cell): WITHIN a run the scatter is a
// fixed feature of the world — identical every frame, no per-frame cost or flicker — but
// EVERY replay reshuffles it (game.js reset() calls rerollDecor()), so no two runs show
// the same meadow. Only the cells inside the camera window are visited per frame. Same
// draw-only pattern as systems/sky.js; the one piece of state (runSeed) lives here, not
// in the sim.
//
// Vertical placement: a slot carries a band-position FRACTION (t), not a final y — the
// bottom edge is resolved at draw time, where the decoded sprite's height is known, and
// clamped so the object sits fully on its bank (never poking into the sky band above or
// the water below). Tall objects end up biased toward the lake edge, short ones scatter
// anywhere on the band — which reads naturally (taller growth nearer the waterline).

import { getTexture } from '../assets.js';
import { lakeMidY, finishShoreRect } from '../geometry.js';

// The per-run shuffle seed. Rolled ONLY in rerollDecor() (called from game.js reset(),
// i.e. page load + every Play-again/R restart) — never per frame, never in a draw path.
let runSeed = 1;

// New shuffle for a new run: every replay lays the meadow out again.
export function rerollDecor() {
  runSeed = (1 + Math.floor(Math.random() * 0x7fffffff)) | 1;
}

// A stable 2-int hash → [0,1). The same (a,b) always yields the same value, so within
// one run the scatter never flickers; folding runSeed into `a` makes each run a fresh
// shuffle of the same world. Exported — render.js's finish-shore sparkles reuse it for
// their hash-stable positions (CATS-143).
export function rand2(a, b) {
  let h = (Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

// The three decorated x-zones (world coords). The themed zones sit INSIDE the lake span,
// offset from homeX / shoreX so they never land on the CATS-105 scene stamps.
export function decorZones(cfg) {
  const d = cfg.decor;
  const inset = d.zoneInset;
  const w = d.zoneWidth;
  const gap = d.zoneGap;
  return {
    start: {
      from: cfg.world.homeX + inset,
      to: cfg.world.homeX + inset + w,
      style: d.start,
    },
    finish: {
      from: cfg.world.shoreX - inset - w,
      to: cfg.world.shoreX - inset,
      style: d.finish,
    },
    grass: {
      from: cfg.world.homeX + inset + w + gap,
      to: cfg.world.shoreX - inset - w - gap,
      style: d.grass,
    },
    // CATS-143: the party ring — dense finish-pool objects ON and around the finish scene
    // stamp, wrapping the whole arriving frame: from a margin left of the art across to
    // past the win line's right reveal (partyRightSpan), covering the top/bottom banks AND
    // (round 2) the open right-side meadow level with the lake (band 2 — the rightBank
    // style). overArt: drawn AFTER the finish art (drawFinishDecor), not in the under-water
    // pass.
    party: (() => {
      const fr = finishShoreRect(cfg);
      return {
        from: fr.left - d.partyMargin,
        to: cfg.world.shoreX + d.partyRightSpan,
        style: d.party,
      };
    })(),
  };
}

// One candidate slot, or null when the cell holds no object. band 0 = the upper bank
// (waterline..lake top edge), band 1 = the lower bank (lake bottom edge..viewport
// bottom). x is final; the vertical position is the fraction t (resolved at draw time).
// Pure — exported so the browser verification can count objects per camera window
// without touching the canvas.
export function decorSlot(cfg, style, zoneFrom, band, i, cellW) {
  const rnd = (k) => rand2(style.seed * 131 + k * 17 + band * 3 + runSeed * 53,
    i * 2 + band + k * 61);
  if (rnd(0) > style.fill) return null;
  const sprites = style.sprites;
  const sprite = sprites[Math.min(sprites.length - 1, Math.floor(rnd(1) * sprites.length))];
  const cw = cellW || style.cellWidth;
  const x = zoneFrom + (i + 0.12 + 0.76 * rnd(2)) * cw;
  const scale = cfg.decor.scaleMin + (cfg.decor.scaleMax - cfg.decor.scaleMin) * rnd(3);
  const flip = rnd(4) < 0.5;
  const t = rnd(5);
  return { sprite, x, scale, flip, t, band };
}

// The per-frame draw: every zone × both banks, only the cells the camera can see.
// A not-yet-decoded texture skips its object that frame (assets.js → null), the standard
// degrade rule — art never breaks the loop. Zones whose style is flagged overArt (the
// CATS-143 party ring) are NOT drawn here — they belong above the finish scene art and are
// drawn by drawFinishDecor in render.js's post-art pass.
export function drawGrassDecor(ctx, cfg, camLeft) {
  for (const zone of Object.values(decorZones(cfg))) {
    if (zone.style.overArt) continue;
    drawDecorZone(ctx, cfg, zone, camLeft);
  }
}

// CATS-143: the party ring pass — the overArt zone(s), called from render.js AFTER the
// finish scene stamp so the scattered objects read as standing on/around the party art,
// never buried under it.
export function drawFinishDecor(ctx, cfg, camLeft) {
  drawDecorZone(ctx, cfg, decorZones(cfg).party, camLeft);
}

// CATS-143 round 3: a few random mushrooms hugging the finish scene stamp's EDGE — one of
// the four borders (hash-picked), positioned along it (hash-jittered), bottom-anchored ON
// the edge line so each straddles the art/grass boundary: the stamp reads planted in the
// meadow. Hash folds runSeed → a fresh handful every replay, same contract as the zones;
// only drawn when the art rect is near the camera window (cheap bounds check).
export function drawFinishEdgeDecor(ctx, cfg, camLeft) {
  const es = cfg.decor.edgeScatter;
  if (!es || !es.count) return;
  const vw = cfg.camera.viewportWidth;
  const fr = finishShoreRect(cfg);
  if (fr.left > camLeft + vw + 80 || fr.left + fr.w < camLeft - 80) return;
  const tex = getTexture(es.sprite);
  if (!tex || !(tex instanceof HTMLImageElement)) return;
  const nw = tex.naturalWidth || 40;
  const nh = tex.naturalHeight || 48;
  const pulse = (cfg.decor.party && cfg.decor.party.pulse) || null;
  for (let k = 0; k < es.count; k++) {
    const rnd = (j) => rand2(es.seed * 17 + k * 29 + runSeed * 7, j * 101 + k * 13);
    const edge = Math.floor(rnd(0) * 4); // 0 top, 1 bottom, 2 left, 3 right
    const along = 0.08 + 0.84 * rnd(1);  // fraction along that border
    const scale = es.scaleMin + (es.scaleMax - es.scaleMin) * rnd(2);
    const w = nw * scale;
    const h = nh * scale;
    let x;
    let bottom;
    if (edge === 0) {
      x = fr.left + along * fr.w;
      bottom = fr.top + 2 + rnd(3) * 8;
    } else if (edge === 1) {
      x = fr.left + along * fr.w;
      bottom = fr.top + fr.h - 2 - rnd(3) * 8;
    } else if (edge === 2) {
      x = fr.left - 4 + rnd(3) * 12;
      bottom = fr.top + along * fr.h;
    } else {
      x = fr.left + fr.w + 4 - rnd(3) * 12;
      bottom = fr.top + along * fr.h;
    }
    ctx.save();
    ctx.translate(x, bottom);
    if (pulse) drawPulseGlow(ctx, pulse, { x, t: rnd(4) }, w, h, edge);
    if (rnd(5) < 0.5) ctx.scale(-1, 1);
    ctx.drawImage(tex, -w / 2, -h, w, h);
    ctx.restore();
  }
}

// One zone's camera-visible cells across its bands. Shared by the under-water pass and
// the over-art pass so placement rules (bands, clamping, hash scatter) stay identical.
// Bands 0/1 are the upper/lower grass banks; band 2 (CATS-143 round 2, rightBank styles
// only) is the RIGHT-SIDE meadow — the open ground past the lake, level with the water,
// where the whole vertical column is grass. A band-2 slot only draws where that ground
// actually exists: right of the lake's cap tip AND clear of the finish scene stamp (see
// slotIsDrawn — the same rule the verifier reads).
function drawDecorZone(ctx, cfg, zone, camLeft) {
  const vw = cfg.camera.viewportWidth;
  const vh = cfg.camera.viewportHeight;
  const waterline = cfg.skyLandscape.height;
  const lakeTop = lakeMidY(cfg) - cfg.world.lakeHalfHeight;
  const lakeBottom = lakeMidY(cfg) + cfg.world.lakeHalfHeight;
  const style = zone.style;
  const bands = style.rightBank ? [0, 1, 2] : [0, 1];
  for (const band of bands) {
    // band 2 may run finer cells than the banks (rightBankCellWidth) — the visible open
    // right-side ground is a narrow strip, so it needs a tighter lattice to read decorated
    const cellW = (band === 2 && style.rightBankCellWidth) || style.cellWidth;
    const n = Math.floor((zone.to - zone.from) / cellW);
    // one cell of margin either side covers x-jitter + sprite half-width bleed
    const iMin = Math.max(0, Math.floor((camLeft - zone.from) / cellW) - 1);
    const iMax = Math.min(n - 1, Math.ceil((camLeft + vw - zone.from) / cellW));
    for (let i = iMin; i <= iMax; i++) {
      const slot = decorSlot(cfg, style, zone.from, band, i, cellW);
      if (!slot) continue;
      if (!slotIsDrawn(cfg, slot)) continue;
      const tex = getTexture(slot.sprite);
      if (!tex || !(tex instanceof HTMLImageElement)) continue;
      const nw = tex.naturalWidth || 40;
      const nh = tex.naturalHeight || 48;
      const w = nw * slot.scale;
      const h = nh * slot.scale;
      // bottom edge: lerp across the band, then clamp so the object sits fully on the
      // bank (its top never crosses the waterline above or the lake edge below)
      let bottom;
      if (band === 0) {
        bottom = waterline + 4 + slot.t * (lakeTop + 2 - waterline - 4);
        bottom = Math.min(lakeTop + 2, Math.max(bottom, waterline + 2 + h));
      } else if (band === 1) {
        bottom = lakeBottom + 6 + slot.t * (vh - 6 - lakeBottom - 6);
        bottom = Math.min(vh - 2, Math.max(bottom, lakeBottom + 4 + h));
      } else {
        // the right-side meadow: the full column between the two banks is grass there
        bottom = lakeTop + 6 + slot.t * (lakeBottom - 4 - lakeTop - 6);
        bottom = Math.min(lakeBottom - 4, Math.max(bottom, lakeTop + 4 + h));
      }
      ctx.save();
      ctx.translate(slot.x, bottom);
      // CATS-143: a soft pulsing glow behind the object (styles that ask for it — the
      // lake/finish pools). Phase is staggered per object (x + band + t), so the meadow
      // glimmers out of sync, never as one synchronized flash. performance.now-driven —
      // pure cosmetic shimmer, same family as the boat's idle bob.
      if (style.pulse) drawPulseGlow(ctx, style.pulse, slot, w, h, band);
      if (slot.flip) ctx.scale(-1, 1);
      ctx.drawImage(tex, -w / 2, -h, w, h);
      ctx.restore();
    }
  }
}

// Would this slot actually be drawn? Bands 0/1 always; band 2 only on the open right-side
// ground — past the lake's cap tip (no water under it) and clear of the finish scene
// stamp's footprint (objects AROUND the art, not planted on its middle). Exported so the
// browser verifier counts exactly what the draw pass paints, from the shipped rule.
export function slotIsDrawn(cfg, slot) {
  if (slot.band !== 2) return true;
  if (slot.x < cfg.world.shoreX + 6) return false;
  const fr = finishShoreRect(cfg);
  return !(slot.x > fr.left - 24 && slot.x < fr.left + fr.w + 24);
}

// The glow itself: a warm radial halo centered on the sprite, alpha breathing with a slow
// sine. Drawn BEFORE the sprite so the object stays the readable silhouette and only its
// surroundings light up. Round 2: the radius is a config fraction (pulse.radius) of the
// sprite size — a smaller, tighter halo.
function drawPulseGlow(ctx, pulse, slot, w, h, band) {
  const t = performance.now() / 1000;
  const s = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * pulse.hz + slot.x * 0.35 + band * 2.1 + slot.t * 7);
  const r = Math.max(w, h) * (pulse.radius || 0.5) * (0.85 + 0.35 * s);
  const cy = -h / 2;
  const grad = ctx.createRadialGradient(0, cy, 0, 0, cy, r);
  grad.addColorStop(0, `rgba(${pulse.color},${(pulse.strength * s).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${pulse.color},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, Math.PI * 2);
  ctx.fill();
}
