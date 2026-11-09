// ui/hud.js — bouquet + jar counts, stretch chip.
//
// Extracted from render.js so the in-play readout is its own reviewable unit (architecture
// §"Proposed project structure": ui/hud.js owns the always-on HUD). The goal/controls
// teaching text moved to the CATS-129 start hint box (ui/hintbox.js) — the in-play
// duplicate is gone.
//
// The timer readout itself is no longer here — the flat sunset bar was replaced by the
// sky-landscape sun arc + clouds, drawn in render.js via systems/sky.js (CATS-47). The sun's
// left↔right position IS the clock now, so this file only holds the non-clock HUD readouts.
//
// The sound + language controls are the SHARED bar (ui/controls.js, CATS-112), floating
// top-right of the game box over the canvas — the on-canvas speaker cluster CATS-94/102
// drew here is gone. This file is back to pure readouts.
//
// All visible text is localized (CATS-54): read from cfg.text.* (resolved once at bootstrap).
import { t, SUPPORTED_LOCALES } from '../i18n.js';
import { getTexture } from '../assets.js';

// Draws the full HUD onto the main ctx. Pure draw — no mutation of game state.
//
// CATS-68 follow-up: the lake is now narrower with green grass shores above AND below the water.
// CATS-114: the three game controls (bouquet, jar, steering meter) moved UP off the lake's top
// edge onto the upper grass band itself — the band between the sky strip and the waterline.
// CATS-130: the column moved top-LEFT → top-RIGHT (under the shared controls bar, which it
// now clears vertically), both fonts grew, and the steering
// ("sharpness of movement") line was REMOVED per user ask — only 💐 bouquet + 🫙 jar remain.
// CATS-129 follow-up 2: the bottom band's loss readout (a debug-flavored duplicate of what
// the counts already show) is gone too. Text gets a dark halo (stroke) so it reads
// over the textured grass at every day-cycle stop.
//
// CATS-130 follow-up 2: the count column sits on the narrative board's wooden plank art
// (assets/sprites/hud/, CATS-114) — both readouts share one visual family.
//
// CATS-114 follow-up: every HUD label renders at ONE size (HUD_FONT) — Jar and Bouquet read
// as one family — and the leading emoji is drawn separately at a larger size (ICON_FONT) so
// the icons carry the scan-read. CATS-130: both sizes bumped; CATS-130 follow-up settled on
// 20/24 after the 24/30 pass read too heavy.
const HUD_FONT = '20px system-ui, sans-serif';
const ICON_FONT = '24px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';

// CATS-130 follow-up 2: the count column sits on the SAME wooden plank board art as the
// narrative feed (assets/sprites/hud/, CATS-114) so both readouts share one visual family.
// Same degrade rule as narrative.js: plank floor + SVG art, canvas-primitive seams if the
// SVG is missing — art never breaks the loop.
const BOARD_SRC = 'assets/sprites/hud/narrative_board.placeholder.svg';
const BOARD_PAD_X = 12;  // text → board side edge
const BOARD_PAD_TOP = 8; // text top → board top

// CATS-130: the LEFT edge of the controls column from the most recent drawHud — the column
// now anchors top-RIGHT, so world-space draws (the progression-flag labels in render.js) and
// the stretch chip read this to hide anything that would scroll under it. One frame stale at
// most (drawHud runs after the world pass), which is invisible — the column width changes
// only when counts/locale change.
let _hudLeftEdge = 0;
export function hudControlsLeftEdge() {
  return _hudLeftEdge;
}

// Draws "<emoji> <label+count>" with the emoji at icon size and the text at label size.
function fillHudLine(ctx, emojiText, text, x, y) {
  ctx.font = ICON_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const emojiW = emojiText ? ctx.measureText(emojiText).width + 5 : 0;
  if (emojiText) fillTextHalo(ctx, emojiText, x, y, '#ffffff');
  ctx.font = HUD_FONT;
  fillTextHalo(ctx, text, x + emojiW, y + 3, '#ffffff');
  return emojiW + ctx.measureText(text).width;
}

// CATS-130: right-anchored variant — measures the line first, then draws it so it ENDS at
// rightX. The column hugs the game box's right edge; icons stay left of their label.
function fillHudLineRight(ctx, emojiText, text, rightX, y) {
  ctx.font = ICON_FONT;
  const emojiW = emojiText ? ctx.measureText(emojiText).width + 5 : 0;
  ctx.font = HUD_FONT;
  const textW = ctx.measureText(text).width;
  return fillHudLine(ctx, emojiText, text, rightX - emojiW - textW, y);
}

export function drawHud(ctx, cfg, world) {
  const g = world.gifts.state;
  const vh = cfg.camera.viewportHeight;
  // The grass shore bands: [skyH .. lakeTop] on top, [lakeBottom .. vh] on bottom. The lake's
  // straight-body edges (from geometry.js) define where the grass is; the HUD rides the grass.
  const lakeTop = lakeBodyTop(cfg);
  // CATS-114: the controls column anchors inside the UPPER grass band, not at the lake edge.
  const bandTop = cfg.skyLandscape.height;
  // CATS-130: the column anchors top-RIGHT. It must clear the shared sound + language bar
  // (#game-controls, ui/controls.js) that floats over the box's top-right corner in DOM space:
  // the bar occupies the top ~46 CSS px (top:12 + height ~34) at the very right edge. The
  // canvas presents in a min(1000px, 96vw) box, so canvas units per CSS px is read from the
  // live layout (ctx.canvas.clientWidth); the Math.max guard keeps the column below the bar's
  // mapped bottom edge even when the box shrinks and the fixed-size bar grows relative to it.
  const barBottomCss = 12 + 34 + 10; // bar top (12) + its own height (~34) + gap
  const vw = cfg.camera.viewportWidth;
  const cssW = (ctx.canvas && ctx.canvas.clientWidth) || 1000;
  const canvasPerCss = vw / Math.max(cssW, 1);
  const rightX = vw - Math.round(16 * canvasPerCss);
  let y = Math.max(bandTop + 8, Math.round(barBottomCss * canvasPerCss) + 6);
  // CATS-130: the steering/sharpness readout is GONE — the user asked for the "sharpness of
  // movement" line removed. Only the bouquet + jar counts remain.

  // --- gift counts (top-right, on the upper grass band) ---
  // CATS-114 follow-up: bouquet, 🫙 jar; icon + uniform-size label per line. CATS-130
  // follow-up: the bouquet icon is 💐 (was 🪷) per user ask.
  const lineH = 30; // 24px icon + breathing room between lines
  const line1 = `${t('bouquetWord', cfg.locale)} ${g.flowers}`;
  const line2 = `${t('jarWord', cfg.locale)} ${g.dragonflies}`;
  // CATS-130 follow-up 2: the board width is STABLE per (font, catalog) — the max line width
  // across every locale, with 3-digit count headroom — so the plank never resizes when a
  // count ticks or the player switches language (same fixed-size rule as the narrative
  // board, CATS-114 follow-up). The text itself stays right-anchored inside it.
  const boardW = Math.max(...SUPPORTED_LOCALES.map((loc) => {
    ctx.font = ICON_FONT;
    const iconW = Math.max(ctx.measureText('💐').width, ctx.measureText('🫙').width) + 5;
    ctx.font = HUD_FONT;
    return iconW + Math.max(
      ctx.measureText(`${t('bouquetWord', loc)} 000`).width,
      ctx.measureText(`${t('jarWord', loc)} 000`).width,
    );
  })) + BOARD_PAD_X * 2;
  drawBoard(ctx, rightX - boardW, y - BOARD_PAD_TOP, boardW, lineH * 2 + BOARD_PAD_TOP + 4);
  fillHudLineRight(ctx, '💐', line1, rightX - BOARD_PAD_X, y);
  y += lineH;
  fillHudLineRight(ctx, '🫙', line2, rightX - BOARD_PAD_X, y);
  // CATS-130: publish the column's left edge (right-anchored lines start at rightX - width).
  // Follow-up 2: the plank's left edge — the whole board scrolls things out of its way.
  _hudLeftEdge = rightX - boardW;

  // --- stretch chip (which stretch we're in + progress across the lake) ---
  drawStretchChip(ctx, cfg, world, bandTop);
  // (left edge set above, before the chip, so the chip's overlap check reads this frame's value)

  // CATS-129 follow-up 2: the in-play goal/controls hint and the lower-left loss readout are
  // GONE — both duplicated the start hint box's teaching text / the count column. The HUD is
  // now purely the count column + stretch chip.
}

// CATS-130 follow-up 2: the wooden plank behind the count column — the same board art as the
// narrative feed (CATS-114), drawn plank-floor-first, then the SVG plank if decoded, else the
// canvas-primitive seam fallback. Constant alpha; it rides with the HUD, never fades.
function drawBoard(ctx, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#8a5a33';
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 3;
  ctx.stroke();
  const board = getTexture(BOARD_SRC);
  if (board && board instanceof HTMLImageElement) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.clip();
    ctx.drawImage(board, x, y, w, h);
    ctx.restore();
  } else {
    ctx.strokeStyle = 'rgba(107,68,35,0.8)';
    ctx.lineWidth = 1.6;
    const seamGap = 26;
    for (let sy = y + seamGap; sy < y + h - 6; sy += seamGap) {
      ctx.beginPath();
      ctx.moveTo(x + 8, sy);
      ctx.lineTo(x + w - 8, sy);
      ctx.stroke();
    }
  }
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

// The grass band edges align with the lake's straight-body water edges (from geometry.js).
function lakeBodyTop(cfg) {
  const skyH = cfg.skyLandscape.height;
  const mid = skyH + (cfg.camera.viewportHeight - skyH) / 2;
  return mid - cfg.world.lakeHalfHeight;
}

// Paint text with a soft dark stroke under the fill so it stays legible over the grass texture.
function fillTextHalo(ctx, text, x, y, fill) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20,40,28,0.6)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawStretchChip(ctx, cfg, world, bandTop) {
  // A small chip top-center naming the current stretch + dots for the 4-stretch progress.
  // CATS-114: anchored at the top of the upper grass band (under the sky strip), clear of the
  // water AND of the controls column.
  // CATS-114 follow-up: when the chip's own label box would overlap the HUD column (long UA
  // labels at small widths), the label is dropped and only the progress dots remain —
  // overlaps read worse than a missing word. CATS-130: the column now anchors top-RIGHT, so
  // the check compares the chip's right side against the column's LEFT edge.
  const label = world.stretchLabel || '';
  const total = cfg.stretch.labels.length;
  const idx = Math.min(world.stretchIndex, total - 1);
  const cx = cfg.camera.viewportWidth / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = "600 13px 'Fredoka', system-ui, sans-serif";
  const halfW = ctx.measureText(label).width / 2;
  const overlapsHud = (cx + halfW) > hudControlsLeftEdge() - 8;
  if (label && !overlapsHud) {
    fillTextHalo(ctx, label, cx, bandTop + 6, 'rgba(255,255,255,0.92)');
  }
  // dots
  const dotR = 4;
  const gap = 14;
  const startX = cx - ((total - 1) * gap) / 2;
  const y = bandTop + 26;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, y + dotR, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i <= idx ? '#f3c969' : 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
}
