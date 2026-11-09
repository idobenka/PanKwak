// render.js — canvas-primitive renderer.
//
// "Ugly graybox is fine, canvas primitives only, no art, no menus" (Phase 1 spec — still
// graybox; Phase 1 is "the loop is complete," not "the loop is pretty"). This file only
// DRAWS: it reads world state and paints. The in-play readout lives in ui/hud.js and the
// overlay states live in ui/screens.js; this file calls both.

import { tierMeta } from './entities/fish.js';
import { paletteForProgress } from './systems/timer.js';
import { drawSky } from './systems/sky.js';
import { drawHud, hudControlsLeftEdge } from './ui/hud.js';
import { drawOverlay } from './ui/screens.js';
import { drawBeatFeed, drawArrival } from './ui/narrative.js';
import { getTexture } from './assets.js';
import { chordHalf, lakeMidY, swimBoundsAt, finishShoreRect } from './geometry.js';
import { drawGrassDecor, drawFinishDecor, drawFinishEdgeDecor, rand2 } from './systems/decor.js';

// CATS-114 follow-up 2: the most recent camLeft (world-x at screen x=0), so world-space
// draws can convert to screen-x for HUD overlap checks. Set each frame in render().
let currentCamLeft = 0;

export function render(ctx, cfg, world) {
  const vw = cfg.camera.viewportWidth;
  const vh = cfg.camera.viewportHeight;
  const pal = paletteForProgress(cfg, world.timer.progress());
  const waterline = cfg.skyLandscape.height;

  // ── (A) SCREEN-SPACE PRE-PASS: things that do NOT scroll with the camera ──
  // Sky fill (the clock band) + sky-landscape (sun arc, clouds) stay anchored to the viewport:
  // the sun is the CLOCK, it must never scroll away (CATS-66 §3.1).
  // CATS-79: the sun paints HERE, in the screen-space pre-pass, so the shore-strip treeline
  // (drawShoreStrip, later in the world pass) draws OVER it — at the arc's two ends (start/
  // finish) the sun sinks behind the trees by design. Do NOT move the sun into the world pass
  // or after the strip; only clouds must stay under the sun, the treeline must stay above it.
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, 0, vw, waterline);
  // The whole ground band (below the sky strip) is a green grass field — the textured shore that
  // now shows on all four sides of the narrower lake. The lake is a stadium "hole" of water cut
  // into this field (drawn under the camera, in world coords). Solid fallback fills first so a
  // not-yet-decoded texture never leaves a bare sky-bleed gap.
  drawGrassField(ctx, cfg, pal, /*screenSpace=*/true);
  drawSky(ctx, cfg, world.sky, world.timer.progress(), pal);

  // ── (B) CAMERA TRANSFORM (render-only, CATS-66 §2) ──
  // A single ctx.translate so the boat sits at a lead-biased position inside the viewport, then
  // clamped so the camera never scrolls past either shore. Pure view transform — the sim never
  // sees it. save()/restore() brackets everything drawn in world coordinates.
  const camLeft = computeCameraLeft(cfg, world);
  currentCamLeft = camLeft;
  ctx.save();
  ctx.translate(-camLeft, 0);

  // ── (C) WORLD DRAW: everything in world coordinates ──
  // The grass field scrolls in world space (so it + the far-shore festive stamp move as one with
  // the water hole), then the stadium water shape is cut out of it. Entities + the flag lines sit
  // on top of the water.
  drawGrassField(ctx, cfg, pal, /*screenSpace=*/false);
  drawFarShoreFestive(ctx, cfg);
  // CATS-105: the start/finish scene stamps — Mr. Kwak's home + garden on the left bank, the
  // party + lanterns + flower garden on the right bank. UNDER the water fill so the lake
  // hole keeps its crisp edge and the art reads as sitting on the grass, never on water.
  drawShoreArt(ctx, cfg);
  // CATS-123: the grass-bank decoration objects (flowers, stones, tufts, berries,
  // mushrooms) on the banks around the lake — under the water fill so anything that
  // kisses the waterline is occluded by the lake edge (they read as sitting on the
  // grass, never floating on water). Only the camera-visible cells are visited.
  drawGrassDecor(ctx, cfg, camLeft);
  drawWaterFill(ctx, cfg, pal);
  // CATS-74: the grass-bank strip along the landscape bottom, so the sky-landscape timer band
  // blends into one continuous bank surface with the vertical shore banks. Drawn in world space
  // (inside the camera transform) so the strip + banks scroll as one (lake README §7).
  drawShoreStrip(ctx, cfg);

  // CATS-143 (round 2): the finish scene stamp — anchored by finishShoreRect clear of the
  // lake's right cap (dry ground only) and vertically centered on the lake's mid line,
  // still bounds-checked so the whole stamp is visible in the arriving frame. Drawn after
  // the water fill + strip, before the entities (flowers and dragonflies are collectibles;
  // the art must never hide them). The dense party-ring decor and the sparkle twinkle ride
  // on top.
  drawFinishShoreArt(ctx, cfg);
  drawFinishDecor(ctx, cfg, camLeft);
  drawFinishEdgeDecor(ctx, cfg, camLeft); // r3: a few random mushrooms hugging the art's edge
  drawFinishSparkles(ctx, cfg);

  // --- stretch boundary guides (dev aid during the graybox pass) ---
  if (cfg.debug.showStretchGuides) {
    drawStretchGuides(ctx, cfg);
  }

  // --- backstroke-flag progression lines at the stretch boundaries (labeled) ---
  drawProgressionFlags(ctx, cfg, world);

  // --- far-shore destination marker ---
  // CATS-143: the little party flag that stood at shoreX is GONE ("remove a flag on the
  // finish") — the centered finish scene art + its festive ring now carry the destination
  // read on their own.

  // --- flowers ---
  for (const f of world.flowers) {
    if (f.collected) continue;
    drawFlower(ctx, f, cfg);
  }

  // --- dragonflies ---
  for (const d of world.dragonflies) {
    if (d.collected) continue;
    drawDragonfly(ctx, d, cfg);
  }

  // --- fish ---
  for (const fishy of world.fish) {
    drawFish(ctx, fishy, cfg);
  }

  // --- CATS-113: the wake trace — fading foam marks where the frog swam ---
  // World-space, on the water under the boat + fish so it reads as foam on the surface. Each
  // mark swells a touch then dissolves; the trail reads as the dotted wake behind the boat.
  drawWake(ctx, cfg, world);

  // --- CATS-60 visual-effect layer ---
  // On the water surface, drawn after the fish + ambient ripple so a spawn reads on top of the
  // water but beneath the boat (the boat, drawn next, stays the readable silhouette). Same faint-
  // ring / soft-glow family as the fish ripple in drawFish. No-op until a sibling sub-issue spawns.
  drawEffects(ctx, cfg, world);

  // --- boat (flashes while post-fish-hit invulnerable) ---
  drawBoat(ctx, world.boat, cfg, world.invulnTimer > 0, world);

  // --- CATS-128 follow-up: escaped dragonflies flying away from the frog ---
  // Drawn AFTER the boat so a takeoff reads in front of Mr. Kwak, not behind his pad.
  drawEscapedDragonflies(ctx, cfg, world);

  ctx.restore();
  // ── back to screen space ──

  // ── (D) SCREEN-SPACE HUD + OVERLAYS (drawn after restore, never scroll) ──
  // CATS-114 follow-up: the beat feed's wooden board is drawn FIRST — the static 4/5-width
  // board now spans most of the lower grass band, so the HUD's loss readout must paint over
  // it (not be buried under it).
  drawBeatFeed(ctx, cfg, world);

  drawHud(ctx, cfg, world);

  // --- overlay states ---
  if (world.status !== 'playing') {
    drawOverlay(ctx, cfg, world);
    // CATS-57: the arrival smile beat rides on top of the won/empty overlay.
    if (world.status === 'won' || world.status === 'arrived_empty') {
      drawArrival(ctx, cfg, world);
    }
  }
}

// CATS-66 §2 — the render-only follow-camera. camLeft is the world-x that maps to screen x=0.
// Boat-targeted with a rightward lead bias (player sees more of where they're going), then
// clamped so the camera never scrolls past the home shore (left) or past the win line (right).
// Read-only on the sim: derived purely from boat.state.x. Optional render-side smoothing
// (camera.smoothing, default 0 = off) eases camLeft toward its target; it never feeds back into
// the sim.
//
// CATS-98 (review follow-up) — follow through the finish, then a small push. The right clamp is
// where the camera stops when the BOAT stops: maxLeft puts the boat at its leadFraction screen
// position exactly at shoreX, so the camera moves with the frog for the WHOLE crossing — the
// same lead framing as mid-lake, no end-of-lake freeze with the frog drifting to the screen
// edge. Then, on the finish (won / arrived_empty), the camera eases a little FURTHER past that
// stop so the party shore — flag, festive bank, the ground past the win line — fills the frame.
// Render-only like everything else here: driven by the arrival clock (advanced on the fixed
// timestep in narrative.update), never the sim.
let _smoothedCamLeft = null; // persisted across frames for the optional smoothing lerp
function computeCameraLeft(cfg, world) {
  const { camera, world: w } = cfg;
  const boatX = world.boat.state.x;
  const target = boatX - camera.leadFraction * camera.viewportWidth;
  // Clamp so the camera never scrolls past the home shore (left) or tracks the boat past the
  // win line (right). maxLeft = shoreX − leadFraction·viewportWidth is the camLeft at which the
  // boat sits at leadFraction exactly when it reaches shoreX, so the follow runs all the way to
  // the finish (CATS-98 review follow-up). minLeft = −homeLead lets the camera pan slightly
  // past x=0 so tracking starts on the FIRST stroke instead of after leadFraction·viewportWidth
  // px of frozen frame (CATS-88). The shore-visibility invariant (both shores never on
  // screen at once) is NOT enforced by this clamp — it's the viewportWidth < shoreSpan
  // inequality asserted in config.js; the clamp only governs framing at the two ends.
  const minLeft = -(camera.homeLead || 0);
  const maxLeft = w.shoreX - camera.leadFraction * camera.viewportWidth;
  let clamped = Math.max(minLeft, Math.min(maxLeft, target));

  // CATS-98 finish push — see the block comment above. Eased on the arrival clock so the glide
  // is deterministic and lands in step with the staged smile beat (not wall-clock).
  const pan = camera.arrivalPan;
  if (pan && (world.status === 'won' || world.status === 'arrived_empty')) {
    const dest = w.shoreX - pan.shoreAtFraction * camera.viewportWidth;
    const aSnap = world.narrative && world.narrative.snapshot().arrival;
    let t = 1;
    if (pan.seconds > 0 && aSnap) {
      const k = Math.min(1, aSnap.clock / pan.seconds);
      t = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOut cubic
    }
    clamped = clamped + (dest - clamped) * t;
  }

  if (!camera.smoothing || camera.smoothing <= 0) {
    _smoothedCamLeft = clamped;
    return clamped;
  }
  // ease the persisted value toward the clamped target (render-side only)
  if (_smoothedCamLeft === null) _smoothedCamLeft = clamped;
  const t = Math.max(0, Math.min(1, camera.smoothing));
  _smoothedCamLeft += (clamped - _smoothedCamLeft) * t;
  return _smoothedCamLeft;
}

// CATS-66 §1/§3.2 — the oval's vertical chord at a given world-x. Half-height of the visible
// water: 0 at the caps (homeX / shoreX), lakeHalfHeight mid-lake, following a sine cap-to-cap.
// The grass field — the green ground that fills everything below the sky-landscape band. The
// lake is a stadium "hole" of water cut into it (drawn on top), so this field is what shows as
// the shore on all four sides (round left/right caps + flat upper/lower edges). Tiled with the
// Asset Designer's shore_grass texture (96×96, seamless both axes). `screenSpace` true = the
// screen-anchored pre-pass (covers the whole viewport band); false = the world-space fill that
// scrolls with the camera (so it + the far-shore festive stamp move as one with the water hole).
// A solid fallback color is always painted first so a not-yet-decoded SVG never leaves a gap.
function drawGrassField(ctx, cfg, pal, screenSpace) {
  const waterline = cfg.skyLandscape.height;
  const vh = cfg.camera.viewportHeight;
  const vw = cfg.camera.viewportWidth;
  // world space spans the whole lake + a margin either side so the field never thins at edges.
  const wx0 = cfg.world.homeX - 2000;
  const wx1 = cfg.world.shoreX + 2000;
  const fillRect = () => {
    if (screenSpace) ctx.fillRect(0, waterline, vw, vh - waterline);
    else ctx.fillRect(wx0, waterline, wx1 - wx0, vh - waterline);
  };
  // fallback floor color = the grass base tint, so a not-yet-decoded SVG never leaves a gap.
  ctx.fillStyle = '#3a7d4f';
  fillRect();
  const tex = getTexture(cfg.shores.grassTile);
  if (!tex || !(tex instanceof HTMLImageElement)) return;
  const pat = ctx.createPattern(tex, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.fillStyle = pat;
  fillRect();
  ctx.restore();
}

// The far (party) shore: over-stamp the festive grass tile in a band around the finish so the
// destination lights up (warm + party-light dots) as Mr. Kwak approaches. Drawn in world space before
// the water hole, so the festival reads on the grass the water reveals at the right cap.
// CATS-98: the band must extend far enough PAST shoreX to cover the widest post-shore reveal the
// camera ever makes — the finish push settle ((1 − shoreAtFraction)·viewportWidth) OR the follow
// camera's pre-finish window ((1 − leadFraction)·viewportWidth, the ground visible past the win
// line while the camera still tracks the boat), whichever is wider, + a buffer — so the arriving
// frame shows festive bank to the viewport's right edge, not festive-then-plain grass.
// CATS-143 (round 2): the transition is now a long, patchy BLEND. Fixed-width strips of the
// SAME pattern (one transform → tiles never shift; only the mix moves) carry:
//   • a smoothstep ramp that only reaches full strength AT the finish scene art — plain
//     meadow for most of the approach, "fully festive only around the finish_shore";
//   • a smooth sinusoidal PATCH dither layered over the whole band (ramp and full region
//     alike), so regular grass shows through here and there — dimension, not a flat
//     festive slab. Peak blend is capped (festiveMaxAlpha < 1) so even at full strength
//     the plain texture stays faintly present.
function drawFarShoreFestive(ctx, cfg) {
  const tex = getTexture(cfg.shores.festiveTile);
  if (!tex || !(tex instanceof HTMLImageElement)) return;
  const waterline = cfg.skyLandscape.height;
  const vh = cfg.camera.viewportHeight;
  const reach = cfg.shores.festiveReach;
  const pan = cfg.camera.arrivalPan;
  const widest = Math.max(1 - cfg.camera.leadFraction, pan ? 1 - pan.shoreAtFraction : 0);
  const pastShore = widest * cfg.camera.viewportWidth + 200;
  const x0 = cfg.world.shoreX - reach;
  const xEnd = cfg.world.shoreX + pastShore;
  const xFull = Math.max(x0, finishShoreRect(cfg).left); // full strength only at the art
  const bandH = vh - waterline;
  const maxA = cfg.shores.festiveMaxAlpha ?? 0.92;
  const patchDepth = cfg.shores.festivePatchDepth ?? 0.38;
  const stripW = Math.max(12, cfg.shores.festiveBlendStripWidth || 40);
  const pat = ctx.createPattern(tex, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.fillStyle = pat;
  const strips = Math.ceil((xEnd - x0) / stripW);
  for (let i = 0; i < strips; i++) {
    const sx = Math.round(x0 + stripW * i);
    const sw = Math.round(x0 + stripW * (i + 1)) - sx;
    if (sw <= 0) continue;
    const mid = sx + sw / 2;
    // ramp: 0 at the band's far edge → 1 at the art's left edge (smoothstep)
    const t = Math.max(0, Math.min(1, (mid - x0) / (xFull - x0)));
    const ramp = t * t * (3 - 2 * t);
    // patch: two nested sines → organic, non-repeating grassy patches through the band
    const patch = 0.5 + 0.5 * Math.sin(mid * 0.021 + 2.6 * Math.sin(mid * 0.0093));
    const a = maxA * ramp * (1 - patchDepth * patch);
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    ctx.fillRect(sx, waterline, sw, bandH);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// CATS-105 — the start scene stamp (placeholder art). One 1:1 drawImage, in world space on
// the grass bands, UNDER the water fill (so the lake edge stays crisp and the art never
// reads as floating on water):
//   • home_shore.png   (360×520) — right edge anchored at homeX; fills the visible left
//     bank at push-off (camera minLeft −240 → shows x ≥ −240; the stamp covers −300..60).
//     Reads as Mr. Kwak's home: lily-pad-roof cottage, warm window, stepping stones, berry
//     bushes + mushrooms.
// Spans the full ground band (waterline..viewportHeight), matching the authored viewBox
// 1:1. A missing/failed SVG load degrades to plain grass (assets.js → null).
// CATS-143: the FINISH stamp no longer draws here — it moved to drawFinishShoreArt, drawn
// AFTER the water fill at its centered finishShoreRect anchor (see the call-site comment
// in render() for why the order flipped).
function drawShoreArt(ctx, cfg) {
  const waterline = cfg.skyLandscape.height;
  const vh = cfg.camera.viewportHeight;
  const { homeX } = cfg.world;
  const art = cfg.shores.art || {};
  const home = getTexture(art.homeShore);
  if (home && home instanceof HTMLImageElement) {
    const w = home.naturalWidth || 360;
    const h = home.naturalHeight || (vh - waterline);
    ctx.drawImage(home, homeX - w, waterline, w, h);
  }
}

// CATS-74 — the grass-bank strip across the landscape bottom (lake README §7, Option A). The
// sky-landscape timer band meets the water at the waterline; this stamps the Asset Designer's
// 96×40 strip so the band's lower edge reads as a continuous bank with the vertical shore banks
// (same palette + same 96-wide horizontal period → seamless). Drawn in world space (caller is
// inside the camera transform) so it scrolls with the banks. Anchor so a tile boundary lands on
// the waterline (no half-row). A not-yet-decoded texture degrades to nothing (the grass field
// already fills this band below the waterline). The strip is preloaded in main.js but was never
// drawn until this — this is the CATS-74 wiring the merged work left open.
// CATS-79: this strip draws AFTER the sky pass, so its treeline occludes the sun at the arc's
// two horizon ends — the sun starts and finishes a run BEHIND the trees. Load-bearing order.
function drawShoreStrip(ctx, cfg) {
  const tex = getTexture('assets/sprites/lake/shore_strip.png');
  if (!tex || !(tex instanceof HTMLImageElement)) return;
  const stripH = tex.naturalHeight || cfg.skyLandscape.height;
  const waterline = cfg.skyLandscape.height;
  const yTop = waterline - stripH;
  const pat = ctx.createPattern(tex, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.fillStyle = pat;
  // translate so a tile boundary lands exactly on the waterline (no cropped half-row at the seam)
  ctx.translate(0, yTop - Math.floor(yTop / stripH) * stripH);
  // span the world (home..far shore + margin either side) so the strip never thins at the edges
  ctx.fillRect(cfg.world.homeX - 2000, waterline - stripH, cfg.world.shoreX - cfg.world.homeX + 4000, stripH);
  ctx.restore();
}

// CATS-68 follow-up — the water as a filled stadium shape (flat body + semicircular caps). The
// top/bottom edges follow ±chordHalf(x) across [homeX, shoreX]; the semicircle caps are the
// "round" left/right shores, the flat mid is bounded by the upper/lower shore bands. Drawn over
// the grass field so grass shows around the hole. The fill SOURCE is pal.water (the tint source,
// per assets/sprites/lake/README.md §1) — CATS-69 swaps in a neutral surface overlay here.
function drawWaterFill(ctx, cfg, pal) {
  const { homeX, shoreX } = cfg.world;
  const midY = lakeMidY(cfg);
  // Uniform fine sampling: the caps are semicircles (need ~15px steps to read smooth) and the
  // body is flat, so a fine step everywhere is cheap and avoids hand-tracing the cap arcs.
  const step = 15;
  ctx.beginPath();
  ctx.moveTo(homeX, midY);
  for (let x = homeX; x <= shoreX; x += step) {
    ctx.lineTo(x, midY - chordHalf(cfg, x));
  }
  ctx.lineTo(shoreX, midY);
  for (let x = shoreX; x >= homeX; x -= step) {
    ctx.lineTo(x, midY + chordHalf(cfg, x));
  }
  ctx.closePath();
  ctx.fillStyle = pal.water; // the tint source — keeps doing the day→dusk mood shift (lake README §1)
  ctx.fill();

  // CATS-69: stamp the Asset Designer's neutral water_surface texture on top as a low-alpha
  // repeat overlay (per lake README §1). The SVG carries no own base color — only lighter +
  // slightly-darker marks that modulate whatever pal.water is this frame, so the tint reads
  // through unchanged. Re-fills the SAME stadium path with the texture pattern. Lives in world
  // space (this is inside the camera transform). A missing texture degrades to the base fill.
  const wtex = getTexture('assets/sprites/lake/water_surface.png');
  if (wtex && wtex instanceof HTMLImageElement) {
    const wpat = ctx.createPattern(wtex, 'repeat');
    if (wpat) {
      ctx.fillStyle = wpat;
      ctx.fill();
    }
  }
}

// Far-shore destination marker — REMOVED (CATS-143, "remove a flag on the finish"): the
// centered finish scene art + the festive ring now carry the destination read on their own.

// CATS-143 — the finish scene stamp. One 1:1 drawImage at finishShoreRect: clear of the
// lake's right cap (left edge at shoreX + finishGap), vertically centered on the lake's mid
// line, bounds-checked into the final (post-finish-push) frame. After the water fill +
// shore strip, before the entities (collectibles must stay visible). Round 2 moved the
// stamp OFF the lake entirely — it no longer covers the cap; the round cap reads as the
// water's own edge again. A missing/failed load degrades to the festive grass underneath.
function drawFinishShoreArt(ctx, cfg) {
  const art = cfg.shores.art || {};
  const finish = getTexture(art.finishShore);
  if (!finish || !(finish instanceof HTMLImageElement)) return;
  const r = finishShoreRect(cfg);
  ctx.drawImage(finish, r.left, r.top, r.w, r.h);
}

// CATS-143 — a twinkle of sparkles over the finish scene art. Hash-stable positions (same
// rand2 as the decor scatter, seeded per index — fixed within a run, identical every
// frame), each star with its own period + phase so the glimmer reads as light playing on
// the party, never a synchronized flash. Wall-clock shimmer only (performance.now), the
// same cosmetic family as the boat's idle bob. Degrades to nothing until the art decodes —
// no art, no twinkle.
function drawFinishSparkles(ctx, cfg) {
  const art = cfg.shores.art || {};
  const tex = getTexture(art.finishShore);
  if (!tex || !(tex instanceof HTMLImageElement)) return;
  const sk = cfg.shores.finishSparkle;
  if (!sk || !sk.count) return;
  const r = finishShoreRect(cfg);
  const t = performance.now() / 1000;
  ctx.save();
  for (let i = 0; i < sk.count; i++) {
    const s = Math.sin((t / (sk.periodMin + (sk.periodMax - sk.periodMin) * rand2(i, 431))
      + rand2(i, 73)) * Math.PI * 2);
    if (s <= 0) continue; // dark gap between twinkles — a glimmer, not a strobe
    const px = r.left + (0.08 + 0.84 * rand2(i, 977)) * r.w + Math.sin(t * 0.7 + i * 1.7) * 2;
    const py = r.top + (0.08 + 0.84 * rand2(i, 131)) * r.h + Math.cos(t * 0.6 + i * 2.3) * 2;
    const sz = sk.size * (0.75 + 0.45 * s);
    // s³ (was s²): a softer swell-and-dissolve — longer quiet gaps, gentler peak
    ctx.globalAlpha = sk.alpha * s * s * s;
    ctx.fillStyle = sk.colors[i % sk.colors.length];
    // four-point star (two crossing slivers) — the same shape family as the fx sparkle
    ctx.beginPath();
    ctx.moveTo(px, py - sz * 2);
    ctx.lineTo(px + sz * 0.5, py - sz * 0.5);
    ctx.lineTo(px + sz * 2, py);
    ctx.lineTo(px + sz * 0.5, py + sz * 0.5);
    ctx.lineTo(px, py + sz * 2);
    ctx.lineTo(px - sz * 0.5, py + sz * 0.5);
    ctx.lineTo(px - sz * 2, py);
    ctx.lineTo(px - sz * 0.5, py - sz * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// CATS-68 follow-up — backstroke-flag progression lines. At each stretch boundary a taut vertical
// line spans the swim-able water column with small triangular pennants hanging off it (the "line
// of flags"), labeled with the stretch the boat is entering. Lives in world space so it scrolls.
// Labels reuse cfg.stretch.labels (the localized Stretch-based progression labels).
function drawProgressionFlags(ctx, cfg, world) {
  const home = cfg.world.homeX;
  const span = cfg.world.shoreX - home;
  const labels = cfg.stretch.labels;
  const p = cfg.progression;
  for (let i = 0; i < cfg.stretch.bounds.length; i++) {
    const x = home + cfg.stretch.bounds[i] * span;
    const bounds = swimBoundsAt(cfg, x, 0);
    const top = bounds.top;
    const bottom = bounds.bottom;
    if (bottom - top < 24) continue; // too pinched (near a cap) to draw a line
    // taut vertical line
    ctx.save();
    ctx.strokeStyle = p.lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    // pennants, alternating sides down the line
    const n = p.pennants;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const py = top + (bottom - top) * t;
      const side = k % 2 === 0 ? 1 : -1;
      const color = p.pennantColors[k % p.pennantColors.length];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + side * p.pennantW, py + p.pennantH * 0.5);
      ctx.lineTo(x, py + p.pennantH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // label = the stretch the boat ENTERS past this boundary (labels[i+1]); on the grass above
    // the waterline so it stays clear of the flags + the swim lane.
    // CATS-114 follow-up 2: the label sits at y≈154 in the lake body — the same vertical
    // band as the HUD controls column — and as the camera scrolls it slides under
    // it ("Dragonfly Bend" over the jar line). Drawn inside the camera transform,
    // so convert to screen-x (subtract camLeft) and SKIP the text whenever its measured span
    // would touch the HUD column. The flag line + pennants stay. CATS-130: the column moved
    // top-RIGHT, so the check is now the label's right side vs the column's LEFT edge.
    const label = labels[i + 1];
    if (label) {
      const waterline = cfg.skyLandscape.height;
      const labelY = Math.max(waterline + 12, top - 16);
      ctx.save();
      ctx.font = 'bold 12px system-ui, sans-serif';
      const screenX = x - currentCamLeft;
      const halfW = ctx.measureText(label).width / 2;
      const hudZoneLeft = hudControlsLeftEdge() - 10;
      const collides = screenX + halfW > hudZoneLeft;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (!collides) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(20,40,28,0.55)';
        ctx.strokeText(label, x, labelY);
        ctx.fillStyle = p.labelColor;
        ctx.fillText(label, x, labelY);
      }
      ctx.restore();
    }
  }
}

function drawStretchGuides(ctx, cfg) {
  const home = cfg.world.homeX;
  const span = cfg.world.shoreX - home;
  const vh = cfg.camera.viewportHeight;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1;
  for (const b of cfg.stretch.bounds) {
    const x = home + b * span;
    ctx.beginPath();
    ctx.moveTo(x, cfg.skyLandscape.height);
    ctx.lineTo(x, vh);
    ctx.stroke();
  }
  ctx.restore();
}

// Draw an SVG sprite centered at (cx, cy) at the given pixel WIDTH, preserving the image's
// natural aspect ratio (square sprites stay square; the fish sprites, which are wider than
// tall, keep their shape). The caller's translate is already applied; this sizes + centers.
function drawSpriteCentered(ctx, img, cx, cy, widthPx) {
  const nw = img.naturalWidth || img.width || widthPx;
  const nh = img.naturalHeight || img.height || widthPx;
  const h = widthPx * (nh / nw);
  ctx.drawImage(img, cx - widthPx / 2, cy - h / 2, widthPx, h);
}

function drawFlower(ctx, f, cfg) {
  const bob = Math.sin(f.bobPhase) * (cfg.behavior.flower.bobAmp || 1.5);
  // CATS-97: soft border fade — the flower melts away as it rests against the shore.
  if (f.fadeAlpha != null && f.fadeAlpha < 1) ctx.globalAlpha = Math.max(0, f.fadeAlpha);
  const tex = getTexture(cfg.sprites.flower);
  if (tex && tex instanceof HTMLImageElement) {
    // Sprite footprint ≈ the graybox bloom diameter (≈ 2.8× radius). Faces up.
    drawSpriteCentered(ctx, tex, f.x, f.y + bob, f.radius * 2.8);
    ctx.globalAlpha = 1;
    return;
  }
  // Fallback graybox primitive (kept so a not-yet-decoded SVG never leaves a bare gap).
  ctx.save();
  ctx.translate(f.x, f.y + bob);
  ctx.fillStyle = '#f2d3e0';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * f.radius * 0.7, Math.sin(a) * f.radius * 0.7, f.radius * 0.6, f.radius * 0.4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8b24c';
  ctx.beginPath();
  ctx.arc(0, 0, f.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawDragonfly(ctx, d, cfg) {
  // CATS-97: soft border fade (only ever active at the home-shore drift sink).
  if (d.fadeAlpha != null && d.fadeAlpha < 1) ctx.globalAlpha = Math.max(0, d.fadeAlpha);
  // CATS-113: ±10° rock around own center while moving — driven by the vertical velocity's
  // sign/magnitude (the dragonfly's visible motion axis) through a slow phase so the tilt eases
  // in and out instead of snapping to velocity. Render-only; never touches the sim.
  const wob = cfg.behavior.motionWobble;
  // flitPhase advances at 6 rad/s → seconds = flitPhase/6; × 2π·Hz = the rock's phase in rad.
  const dPhase = (d.flitPhase / 6) * Math.PI * 2 * wob.wobbleHz;
  const tilt = Math.sin(dPhase) * wob.wobbleDeg * Math.PI / 180
    * Math.max(-1, Math.min(1, (d.vy || 0) / 40));
  const tex = getTexture(cfg.sprites.dragonfly);
  if (tex && tex instanceof HTMLImageElement) {
    // Footprint ≈ 4× radius (wings read), faces left. A little vertical flit on top of the flee.
    const flit = Math.sin(d.flitPhase) * 2;
    ctx.save();
    ctx.translate(d.x, d.y + flit);
    ctx.rotate(tilt);
    drawSpriteCentered(ctx, tex, 0, 0, d.radius * 4);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  // Fallback graybox primitive.
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(tilt);
  ctx.strokeStyle = '#9be3c4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-d.radius, 0);
  ctx.lineTo(d.radius, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2, -d.radius);
  ctx.lineTo(-2, -d.radius * 2);
  ctx.moveTo(2, -d.radius);
  ctx.lineTo(2, -d.radius * 2);
  ctx.stroke();
  ctx.fillStyle = '#bff7dd';
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFish(ctx, fishy, cfg) {
  const meta = tierMeta(fishy.tier);
  // CATS-97: soft border fade — the fish melts away as it rests against the shore. Multiplied
  // into every absolute alpha below (the fish draw sets its own alphas; this scales them all).
  const fade = fishy.fadeAlpha != null ? Math.max(0, Math.min(1, fishy.fadeAlpha)) : 1;
  // CATS-113: ±10° rock around own center while moving. Fish motion is dominated by the
  // vertical wander (vy) on top of the shared leftward drift, so the tilt follows vy's sign and
  // strength through a slow phase (never a snap) — nose dips when diving, lifts when rising.
  // Render-only; the sim never reads it.
  const wob = cfg.behavior.motionWobble;
  // wanderPhase advances at 1.5 rad/s → seconds = wanderPhase/1.5; × 2π·Hz = the rock's phase.
  const fPhase = (fishy.wanderPhase / 1.5) * Math.PI * 2 * wob.wobbleHz;
  const tilt = Math.sin(fPhase) * wob.wobbleDeg * Math.PI / 180
    * Math.max(-1, Math.min(1, (fishy.vy || 0) / 40));
  // Fish swim BELOW the lake surface: render them semi-transparent (underwater) with a soft
  // surface ripple, so it reads that the boat floats ABOVE them and the two never "touch"
  // (CATS-43). The bump is a stun, not a hard collision.
  ctx.save();
  ctx.translate(fishy.x, fishy.y);
  ctx.rotate(tilt);

  // surface ripple — a faint ring where the fish disturbs the water
  ctx.globalAlpha = 0.22 * fade;
  ctx.strokeStyle = '#dff3ff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, fishy.radius * 1.7, fishy.radius * 1.0, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // the fish sprite, faded as if seen through water (kept faded so the above/below layering reads)
  const src = cfg.sprites.fish[fishy.tier] || cfg.sprites.fish[0];
  const tex = getTexture(src);
  if (tex && tex instanceof HTMLImageElement) {
    // Sprite already faces LEFT (toward the boat). Footprint width ≈ 2.4× radius (body spans the
    // original ellipse diameter; the tail extends past, as the graybox tail did).
    ctx.globalAlpha = 0.8 * fade;
    drawSpriteCentered(ctx, tex, 0, 0, fishy.radius * 2.4);
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  // Fallback graybox primitive (faded body + tail + eye), matching the original orientation.
  ctx.globalAlpha = 0.55 * fade;
  ctx.fillStyle = meta.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, fishy.radius, fishy.radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(fishy.radius * 0.8, 0);
  ctx.lineTo(fishy.radius * 1.5, -fishy.radius * 0.6);
  ctx.lineTo(fishy.radius * 1.5, fishy.radius * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-fishy.radius * 0.4, -fishy.radius * 0.2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10202a';
  ctx.beginPath();
  ctx.arc(-fishy.radius * 0.4, -fishy.radius * 0.2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// CATS-113 — the wake trace. Each mark is a soft foam ellipse at the boat's past positions:
// fades in quickly, holds, then dissolves. Drawn in the same faint pale family as the fish
// ripple + effect rings so it reads as water foam, never as a UI line. Age-driven only (the
// marks age on the fixed timestep in game.js), so the draw is a pure function of age/lifetime.
function drawWake(ctx, cfg, world) {
  const marks = world.wake;
  if (!marks || marks.length === 0) return;
  const life = cfg.wake.lifetime;
  ctx.save();
  for (const m of marks) {
    const p = m.age / life; // 0..1
    if (p >= 1) continue;
    // fade in fast, hold, dissolve slowly; swell slightly as it ages (water spreading)
    const alpha = (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85) * 0.35;
    if (alpha <= 0) continue;
    const r = 5 + p * 6;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(223,243,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// CATS-128 follow-up — the escaped-dragonfly fly-away. One transient dragonfly per slipped
// count: flies away from the frog — always LEFT, toward the home shore (CATS-132) — with a
// living flit arc, fading out over the last third of its life so it reads as drifting out
// of view — the loss is "it flew away," never a vanish (R9). Uses the SAME dragonfly
// sprite/footprint as the live ones so the read is instant. Pure draw: position/age live on
// the world (moved on the fixed timestep in game.js); only the flit shimmer rides
// performance.now.
function drawEscapedDragonflies(ctx, cfg, world) {
  const list = world.escapedDragonflies;
  if (!list || list.length === 0) return;
  const esc = cfg.escapedDragonfly;
  const tex = getTexture(cfg.sprites.dragonfly);
  const radius = cfg.spawn.dragonflyRadius;
  // heading faces the flight direction (sprite faces LEFT, so rotate 180°-compensated)
  for (const d of list) {
    const p = d.age / esc.seconds; // 0..1
    if (p >= 1) continue;
    // fade in fast (a beat of recognition), hold, then fade out over the last third
    const alpha = p < 0.12 ? p / 0.12 : (p > 0.66 ? 1 - (p - 0.66) / 0.34 : 1);
    const wobble = Math.sin(d.flitPhase) * esc.wobbleAmp;
    const heading = Math.atan2(d.vy, d.vx);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(d.x + Math.cos(heading + Math.PI / 2) * wobble,
                  d.y + Math.sin(heading + Math.PI / 2) * wobble);
    // the sprite faces LEFT (−x): rotate so LEFT maps onto the flight direction
    ctx.rotate(heading + Math.PI);
    if (tex && tex instanceof HTMLImageElement) {
      drawSpriteCentered(ctx, tex, 0, 0, radius * 4);
    } else {
      // Fallback graybox (mirrors the live dragonfly primitive)
      ctx.strokeStyle = '#9be3c4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -radius);
      ctx.lineTo(-2, -radius * 2);
      ctx.moveTo(2, -radius);
      ctx.lineTo(2, -radius * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawBoat(ctx, boat, cfg, invuln, world) {
  const r = cfg.boat.radius;
  const sq = 1 + boat.state.squash * 0.3;

  // The boat floats ABOVE the water — a soft shadow on the surface sells the layering
  // (CATS-43). Drawn at the boat's position, untranslated by the stun shake.
  ctx.save();
  ctx.translate(boat.state.x, boat.state.y);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#0a1a2a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.9, r * 1.5, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // STUN wobble: a bounded, eased spin + tiny shake. Magnitude = stunFraction (1→0), so the
  // reaction peaks on impact and gently settles as control returns — "no sharp movements."
  // Purely cosmetic offsets derived from the stun clock; the sim position is untouched.
  const fh = cfg.fishHit;
  const frac = boat.state.stunFraction || 0;
  let shakeX = 0;
  let shakeY = 0;
  let spinRad = 0;
  if (frac > 0) {
    // frame-time-free phase: drive off the (wall-clock) rAF timestamp via performance.now
    const t = performance.now() / 1000;
    const phase = t * Math.PI * 2 * fh.wobbleHz;
    const wob = Math.sin(phase);
    // ease envelope: sin(π·frac) ramps 0→1→0 across the stun, so the wobble is nothing on
    // impact, peaks mid-stun, and settles to rest — never a snap in or out.
    const ease = Math.sin(Math.PI * frac);
    shakeX = wob * fh.shakeMaxPx * ease;
    shakeY = Math.cos(phase) * fh.shakeMaxPx * 0.6 * ease;
    // smooth sinusoidal rock (no sign-flip discontinuity), bounded by spinMaxDeg
    spinRad = wob * (fh.spinMaxDeg * Math.PI / 180) * ease;
  }

  // CATS-128 follow-up (rev 2): the bump hop — after a recorded shore bump the whole
  // ensemble (pad + Mr. Kwak) bounces off the surface like a ball: hopCount parabolic
  // hops, each lower (peak ×bounciness²) and quicker (duration ×bounciness) than the
  // last. hopTimer/hopTotal drive it; the sim position never moves, and the water shadow
  // (drawn above at the sim position) stays put so the lift reads as a real jump.
  const hopCfg = cfg.boat.wallBump.bumpHop;
  let hopLift = 0;
  if (hopCfg && boat.state.hopTimer > 0 && boat.state.hopTotal > 0) {
    const k = hopCfg.bounciness;
    const p = 1 - boat.state.hopTimer / boat.state.hopTotal; // 0→1 across the full bounce
    // per-hop duration weights 1, k, k², … (a real ball's air time scales with its speed)
    let weights = 0;
    for (let i = 0; i < hopCfg.hopCount; i++) weights += Math.pow(k, i);
    let seg = hopCfg.hopCount - 1, u = 1; // default: settled on the surface (float tail)
    let acc = 0;
    for (let i = 0; i < hopCfg.hopCount; i++) {
      const w = Math.pow(k, i) / weights;
      if (p < acc + w) { seg = i; u = (p - acc) / w; break; }
      acc += w;
    }
    u = Math.max(0, Math.min(1, u));
    // parabolic arc: 0 at lift-off and landing, peak at mid-hop; peak ×k² per bounce
    hopLift = hopCfg.firstHopPx * Math.pow(k, 2 * seg) * 4 * u * (1 - u);
  }

  ctx.save();
  // idle bob: a slow cosmetic float on the water so the boat reads as afloat even when still
  // (CATS-81 "make objects animated"). Damped to ~0 while stunned so the stun shake (added
  // above) stays the readable motion. Render-only — the sim position is untouched.
  const idleBob = Math.sin(performance.now() / 520) * (frac > 0 ? (1 - frac) : 1) * 1.4;
  ctx.translate(boat.state.x + shakeX, boat.state.y + shakeY + idleBob - hopLift);
  ctx.rotate(spinRad);
  // post-fish-hit grace: pulse alpha so it reads as "briefly safe," not "ghost"
  if (invuln) ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 70);
  // lily-pad boat: green ellipse (kept as a canvas primitive — matches the palette exactly,
  // per assets/HANDOFF.md)
  // ctx.fillStyle = '#4caf6f';
  // ctx.beginPath();
  // ctx.ellipse(0, 0, r * 1.3 / sq, r * sq, 0, 0, Math.PI * 2);
  // ctx.fill();
  // ctx.fillStyle = '#3a8f57';
  // ctx.beginPath();
  // ctx.ellipse(0, 0, r * 0.9 / sq, r * 0.7 * sq, 0, 0, Math.PI * 2);
  // ctx.fill();

  // Mr. Kwak the frog (CATS-76): a sprite, pose-keyed off the boat/world state. idle default;
  // steer-lean while steering (mirrored for left); clutch when a fish is close (the candy-
  // guarding gag). Falls back to the graybox dot if the SVG isn't decoded yet.
  const sp = cfg.sprites.frog;
  const steerVy = boat.state.vy || 0;
  const fishNear = !!(world && world.fish && world.fish.some(
    (f) => f.x > boat.state.x - 30 && f.x < boat.state.x + 70 &&
           Math.abs(f.y - boat.state.y) < (f.radius + r + 18),
  ));
  let poseSrc = sp.idle;
  let mirror = false;
  if (fishNear) {
    poseSrc = sp.clutch;
  } else if (Math.abs(steerVy) > 14) {
    poseSrc = sp.steer;
    mirror = steerVy > 0; // leaning down; mirror for up
  }

  const pipTex = getTexture(poseSrc);
  if (pipTex && pipTex instanceof HTMLImageElement) {
    // base 64×64 → draw at ~2× boat radius, centered up on the pad where the graybox dot sat.
    // A gentle breath: a slow vertical scale so Mr. Kwak looks alive on the pad (CATS-81).
    const size = r * 2.5;
    const breath = 1 + Math.sin(performance.now() / 900) * 0.03;
    ctx.save();
    if (mirror) ctx.scale(-1, breath);
    else ctx.scale(1, breath);
    ctx.drawImage(pipTex, -size / 2, -r * 1.5, size, size);
    ctx.restore();
  } else {
    // Fallback graybox Mr. Kwak dot (rides the bump hop with the pad).
    ctx.save();
    ctx.translate(0, -r * 0.5);
    ctx.fillStyle = '#d6e68a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c2740';
    ctx.beginPath();
    ctx.arc(-3, -r * 0.1, 1.4, 0, Math.PI * 2);
    ctx.arc(3, -r * 0.1, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// CATS-60 — the visual-effect draw pass. Canvas primitives only (no art pipeline), same faint-ring
// / soft-glow family as the fish ripple in drawFish so effects read as ON the water surface. The
// phase 0..1 (age/lifetime) drives each type's fade: sparkle twinkle-out, shine glow-out, ripple
// lazy expand-and-fade. Adding a new effect type = a new case here + a spawn call (nothing more).
//
// Determinism note: only the cosmetic phase (a pure function of age, advanced on the fixed
// timestep) shapes the draw — like the boat's idle bob, render may add a performance.now shimmer,
// but aging/retiring never does.
function drawEffects(ctx, cfg, world) {
  const fx = world.fx;
  if (!fx || !fx.effects || fx.effects.length === 0) return;
  for (const e of fx.effects) {
    const p = fx.phaseOf(e); // 0..1
    if (p >= 1) continue;
    const f = EFFECT_DRAWERS[e.type];
    if (f) f(ctx, e, p, cfg);
  }
}

// A sparkle (dragonfly catch — the cute reward, CATS-61). Warm star-tickles that twinkle and fade,
// scattered around the spawn point. Cosmetic shimmer rides performance.now so a static capture
// still reads alive (mirror of the boat idle bob); aging/retire are fixed-timestep only.
function drawSparkle(ctx, e, p, cfg) {
  const pal = e.params.colors || ['#fff6c8', '#ffe08a', '#ffffff'];
  const count = e.params.count || 6;
  const reach = e.params.reach || 16;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(e.x, e.y);
  // fade in fast, out slow: a brief pop then a gentle dissolve
  const alpha = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
  ctx.globalAlpha = Math.max(0, alpha) * 0.95;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // each tickle drifts outward as the sparkle ages, with a small live shimmer
    const r = reach * (0.35 + 0.65 * p) + Math.sin(t * 6 + i) * 1.2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    const sz = (e.params.size || 1.6) * (1 - p * 0.5);
    ctx.fillStyle = pal[i % pal.length];
    ctx.beginPath();
    // four-point star (two crossing slivers) reads as a sparkle, not a blob
    ctx.moveTo(px, py - sz * 2);
    ctx.lineTo(px + sz * 0.5, py - sz * 0.5);
    ctx.lineTo(px + sz * 2, py);
    ctx.lineTo(px + sz * 0.5, py + sz * 0.5);
    ctx.lineTo(px, py + sz * 2);
    ctx.lineTo(px - sz * 0.5, py + sz * 0.5);
    ctx.lineTo(px - sz * 2, py);
    ctx.lineTo(px - sz * 0.5, py - sz * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// A soft water shine (flower pickup — the wholesome reward, CATS-61). A warm low halo on the
// surface that swells and dissolves. Reads as light catching the water where the flower was.
function drawShine(ctx, e, p, cfg) {
  const color = e.params.color || '#fff3d6';
  const maxR = e.params.radius || 22;
  // gentle swell: radius grows across the lifetime, alpha holds then fades
  const r = maxR * (0.4 + 0.6 * p);
  const alpha = (p < 0.35 ? 1 : 1 - (p - 0.35) / 0.65) * 0.5;
  if (alpha <= 0) return;
  ctx.save();
  const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,243,214,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A water-circle ripple (sharp-movement spill + fish meet, CATS-62). TONE-LOCKED (R9): a gentle,
// lazy expanding ring — calm, never a warning. No red, no jagged shape, no flash. Sits in the same
// faint-stroked family as the ambient fish ripple in drawFish. A contact burst (fish meet) passes a
// larger maxR via params to read as an amplification, not a replacement, of that ambient ripple.
function drawRipple(ctx, e, p, cfg) {
  const maxR = e.params.radius || 30;
  const width = e.params.width || 2;
  const color = e.params.color || 'rgba(223,243,255,0.8)';
  // lazy expand: the ring grows + fades together; never a snap
  const r = maxR * p;
  const alpha = (1 - p) * 0.7;
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, r, r * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  // an inner follow ring, offset in phase, so a single ripple reads as two lazy laps not one pop
  if (p > 0.3) {
    const r2 = maxR * (p - 0.3) / 0.7;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r2, r2 * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// The per-type dispatch table. Adding a new effect type = add one entry here + the spawn call.
const EFFECT_DRAWERS = {
  sparkle: drawSparkle,
  shine: drawShine,
  ripple: drawRipple,
};

