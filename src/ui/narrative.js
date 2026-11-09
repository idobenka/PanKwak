// ui/narrative.js — draws the charm-pass output from systems/narrative.js.
//
// Two surfaces (CATS-57):
//   1. drawBeatFeed — the transient in-play lines (stretch entries, gift milestones, fish
//      flavor, dragonfly-wandered-off). They fade in/out in the lower grass shore band (CATS-85:
//      kept off the lake so the stacked lines never sit on the water), above the loss readout.
//      Pure draw: reads world.narrative.snapshot().
//   2. drawArrival — the headline smile beat over the 'won' / 'arrived_empty' overlay. The
//      spec is present → fern-reaches → dragonfly-loop → settle; graybox is fine, it just has
//      to land. CATS-134: the beat carries NO authored text anymore — the end overlays show
//      titles only; this is the staged scene (the empty-handed illustration + the warm halo).
//
// Nothing here mutates game state. This module is pure draw and stays locale-agnostic.

import { getTexture } from '../assets.js';
import { lakeMidY } from '../geometry.js';

// Phase timings for the arrival smile (seconds). The beat is staged so each move reads on its
// own before the next begins; the whole thing lands inside the postcard's WARM_BEAT window.
const ARRIVAL = {
  present: 0.9,   // 0.0–0.9  Mr. Kwak holds out the gift
  reach: 1.4,     // 0.9–1.4  Fern reaches toward it
  loop: 2.3,      // 1.4–2.3  the dragonfly loops once
  settle: 3.0,    // 2.3–3.0  it settles on the bloom / Fern's palm
  hold: 6.0,      // 3.0–6.0  held so the player reads the line + feels the smile
};

// --- in-play beat feed -------------------------------------------------------
// CATS-114: the feed lines sit on a wooden board (assets/sprites/hud/) so the italic text
// reads over the textured grass — placeholder art with a canvas-primitive fallback, same
// degrade rule as every other sprite.
const BOARD_SRC = 'assets/sprites/hud/narrative_board.placeholder.svg';
// CATS-114 follow-up: the board is a FIXED SIZE — 4/5 of the game box width, always 3 line
// slots tall — never resized to the current text. Lines occupy the BOTTOM slots first, so a
// new line appears at the bottom of the board and older ones rotate up.
// CATS-114 follow-up 2: the board is ALWAYS VISIBLE — no fade, no blink. It draws even when
// the feed is empty, at full opacity; a line leaves only by being pushed off the top slot
// (systems/narrative.js FEED_MAX shift), never by timing out.
const BOARD_WIDTH_FRACTION = 4 / 5;
const BOARD_SLOTS = 3;

export function drawBeatFeed(ctx, cfg, world) {
  const snap = world.narrative && world.narrative.snapshot();
  const feedLines = (snap && snap.feed) || [];

  const cx = cfg.camera.viewportWidth / 2; // CATS-68: screen-space → viewport
  // CATS-85: anchor the feed in the LOWER grass shore band so the stacked lines never cross
  // onto the lake. The lake bottom is midY + lakeHalfHeight; sit the whole stack below it.
  const lineHeight = 20;
  const lakeBottom = lakeMidY(cfg) + cfg.world.lakeHalfHeight;

  // Static board bounds: 4/5 of the viewport wide, 3 slots tall, pinned just below the lake
  // edge (CATS-85: the board's content stays off the water).
  const padY = 12;
  const bw = cfg.camera.viewportWidth * BOARD_WIDTH_FRACTION;
  const bh = BOARD_SLOTS * lineHeight + padY * 2 - (lineHeight - 15);
  const bx = cx - bw / 2;
  const by = lakeBottom + 5;

  // plank floor first (solid warm brown), then the SVG plank art if decoded.
  // CATS-114 follow-up 2: constant alpha — the board never fades.
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#8a5a33';
  roundRectPath(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 3;
  ctx.stroke();
  const board = getTexture(BOARD_SRC);
  if (board && board instanceof HTMLImageElement) {
    ctx.save();
    roundRectPath(ctx, bx, by, bw, bh, 10);
    ctx.clip();
    ctx.drawImage(board, bx, by, bw, bh);
    ctx.restore();
  } else {
    // canvas-primitive fallback: plank seams, so the board still reads as boards
    ctx.strokeStyle = 'rgba(107,68,35,0.8)';
    ctx.lineWidth = 1.6;
    const seamGap = 26;
    for (let sy = by + seamGap; sy < by + bh - 6; sy += seamGap) {
      ctx.beginPath();
      ctx.moveTo(bx + 8, sy);
      ctx.lineTo(bx + bw - 8, sy);
      ctx.stroke();
    }
  }

  // Lines occupy the bottom slots first: the newest line sits in the BOTTOM slot; each older
  // line rotates up one slot. A line is pushed OFF the top slot only when a newer line
  // overflows the board (systems/narrative.js FEED_MAX shift) — never by timing out.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const firstSlot = BOARD_SLOTS - feedLines.length; // 0 when the board is full
  for (let i = 0; i < feedLines.length; i++) {
    const b = feedLines[i];
    const slot = firstSlot + i;
    const y = by + padY + 7.5 + slot * lineHeight;
    ctx.globalAlpha = b.alpha;
    ctx.font = 'italic 15px system-ui, sans-serif';
    ctx.fillStyle = toneColor(b.tone);
    ctx.fillText(b.text, cx, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function toneColor(tone) {
  // losses read warm-gentle, milestones a soft gold, fish a muted teal — never red/harsh
  if (tone === 'loss') return '#f3c98f';
  if (tone === 'milestone') return '#f3d98a';
  if (tone === 'fish') return '#9fd6c8';
  if (tone === 'collect') return '#cfe6b8';
  return '#e6eefc';
}

// --- arrival smile beat ------------------------------------------------------
// Drawn over the end overlay. The overlay (screens.js) shows the title; CATS-134 removed the
// authored text band — this is the staged scene only (illustration + warm halo).
export function drawArrival(ctx, cfg, world) {
  const snap = world.narrative && world.narrative.snapshot();
  if (!snap || !snap.arrival) return;
  const a = snap.arrival;

  drawArrivalScene(ctx, cfg, a.clock, a.won);
}

// The staged arrival scene. CATS-129 follow-up: the WON beat is TEXT-ONLY — the
// `arrival_smile.svg` illustration is gone (the ask: "we do not show it. Only text"), so
// the won overlay carries the title alone. The EMPTY case keeps `arrival_smile_empty.svg`
// (Mr. Kwak's apologetic grin + Fern touched + dragonfly still lands) — R7 is built into
// that art by construction, NEVER a frown/defeat image. Drawn screen-space, over the end
// overlay. A not-yet-decoded / missing illustration degrades to nothing (the overlay's
// title + the warm halo still land).
function drawArrivalScene(ctx, cfg, clock, won) {
  const vw = cfg.camera.viewportWidth;
  const vh = cfg.camera.viewportHeight;

  if (!won) {
    const img = getTexture('assets/sprites/arrival/arrival_smile_empty.svg');
    // the scene eases up to full presence across the present→settle window, so nothing snaps
    const reveal = easeInOut(clamp01(clock / (ARRIVAL.present + ARRIVAL.reach + ARRIVAL.loop)));
    if (img && img instanceof HTMLImageElement && reveal > 0.001) {
      // letterbox the 320×200 illustration into the central band, a touch above center so
      // the overlay's affordance lines at the bottom stay clear.
      const targetH = vh * 0.5;
      const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 320 / 200;
      const targetW = targetH * aspect;
      const x = (vw - targetW) / 2;
      const y = (vh - targetH) / 2 - 40;
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.drawImage(img, x, y, targetW, targetH);
      ctx.restore();
    }
  }

  // a soft warm halo once the smile has landed (the "felt" beat)
  const loopEnd = ARRIVAL.present + ARRIVAL.reach + ARRIVAL.loop;
  if (clock >= loopEnd + ARRIVAL.settle * 0.5) {
    const haloA = clamp01((clock - (loopEnd + ARRIVAL.settle * 0.5)) / 0.8) * 0.18;
    const grad = ctx.createRadialGradient(
      vw / 2, vh / 2 - 40, 8,
      vw / 2, vh / 2 - 40, 180,
    );
    grad.addColorStop(0, `rgba(255,233,168,${haloA})`);
    grad.addColorStop(1, 'rgba(255,233,168,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);
  }
}

// --- text + math helpers -----------------------------------------------------
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function easeInOut(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
