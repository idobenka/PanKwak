// ui/hintbox.js — the instruction hint box (CATS-129), the START PAUSE between the
// welcome card (CATS-80) and the run.
//
// The ask: "At the start, pause and show the instruction hint box, and only continue
// after clicking any button." The welcome card's Start press no longer begins the run
// itself — it opens this box while the world stays held at status 'idle' (main.js also
// suppresses the idle→playing auto-start while the box is up, so no stray keystroke,
// drag, or tilt sample can begin the run early). The run begins on the box's own advance
// gesture: any click on the overlay, or any key press outside the shared controls bar.
//
// Same advance contract as the story page (CATS-110/112): the keydown listener captures
// at the window level and stops the event, so the advancing keystroke never reaches
// input.js (no phantom steering) — and it shields the gesture from main.js's window-level
// audio-unlock listeners. That shielding is harmless here: the Start press already
// unlocked audio and started the bed before this box opened, and unlock() is an
// idempotent no-op once running.
//
// The instruction is the box's whole content: the GOAL as the headline (the one thing a
// player must understand — same copy as the in-game onboarding hint), the controls line
// beneath it, the two hazard lines (koi nibble the bouquet / dragonflies slip the jar),
// and a breathing continue affordance to close. Drawn in the letter-card family (rounded,
// the welcome card's inks) so all pre-run pages read as one object — but held over the
// game with a light scrim and a translucent card (CATS-129 follow-up): the pause is brief
// and the lake art behind it stays readable. Re-localized in place by relabelHintBox when
// the shared controls bar changes language while the box is open.
//
// Like the story page and the welcome card, the box is NOT re-shown on replay (Play
// again / R): returning players skip straight back into the run.

import { t, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n.js';

let overlayEl = null;   // the hint box container
let goalEl = null;      // the goal headline (re-localized per language switch)
let controlsEl = null;  // the controls line
let hazardsEl = null;   // the two hazard lines (koi + dragonflies)
let continueEl = null;  // the "click or press any key" affordance
let onBeginCb = null;   // set by show(); the advance gesture calls it once
let advanced = false;   // one-shot latch: the begin gesture fires exactly once

// Build the overlay once. Re-localized by relabel() when the player switches language
// while the box is open.
function build(locale) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;

  const el = document.createElement('div');
  el.id = 'hintbox-overlay';
  el.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex',
    'align-items:center', 'justify-content:center',
    'background:rgba(8,12,24,0.25)', 'z-index:40',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'padding:16px',
  ].join(';');

  // The box — the letter-card family's border + radius, but a compact centered card (not
  // the full window box) held at LOW opacity: a light scrim + a translucent cream card so
  // the lake art behind the pause stays visible (CATS-129 follow-up ask). Follow-up 2:
  // the blur deepened to 5px so the art behind reads as soft context, not competing
  // detail — that plus the text shadow below keeps the copy legible over any art.
  const card = document.createElement('div');
  card.className = 'hintbox-card';
  card.style.cssText = [
    'box-sizing:border-box', 'max-width:620px',
    'background:rgba(244,240,214,0.55)', 'border-radius:18px',
    'border:4px solid rgba(226,217,184,0.75)',
    'box-shadow:0 12px 40px rgba(0,0,0,0.22)',
    'backdrop-filter:blur(5px)',
    'padding:30px 44px 26px', 'text-align:center', 'cursor:pointer',
  ].join(';');

  // The goal — the headline instruction, in the title face. pre-line so the Ukrainian
  // copy's embedded line break lands where the copy asked for it (follow-up 2).
  const goal = document.createElement('p');
  goal.dataset.i18n = 'goalHint';
  goal.textContent = t('goalHint', loc);
  goal.style.cssText = ['margin:0 0 14px', 'font-size:24px', 'line-height:1.3',
    'color:#7d4f26', "font-family:'Fredoka',system-ui,sans-serif", 'font-weight:600',
    'white-space:pre-line',
    'text-shadow:0 1px 2px rgba(244,240,214,0.85)'].join(';');
  card.appendChild(goal);
  goalEl = goal;

  // The controls line — secondary, quieter. Same pre-line + a touch darker for legibility.
  const controls = document.createElement('p');
  controls.dataset.i18n = 'controlHint';
  controls.textContent = t('controlHint', loc);
  controls.style.cssText = ['margin:0 0 10px', 'font-size:15px', 'line-height:1.5',
    'color:#16324f', 'white-space:pre-line',
    'text-shadow:0 1px 2px rgba(244,240,214,0.85)'].join(';');
  card.appendChild(controls);
  controlsEl = controls;

  // The two hazard lines — the koi nibbling the bouquet and the dragonflies slipping the
  // jar. Quiet and slightly darker so they read as flavor, not warnings.
  const hazards = document.createElement('p');
  hazards.dataset.i18n = 'hintHazards';
  hazards.textContent = t('hintHazards', loc);
  hazards.style.cssText = ['margin:0', 'font-size:16px', 'line-height:1.55',
    'color:#582734', 'white-space:pre-line',
    'text-shadow:0 1px 2px rgba(244,240,214,0.85)'].join(';');
  card.appendChild(hazards);
  hazardsEl = hazards;

  // The continue affordance — breathing, the same gentle fade cycle as the story page's
  // hint, so the paused box still reads as alive without demanding anything.
  const cont = document.createElement('p');
  cont.dataset.i18n = 'hintBoxContinue';
  cont.textContent = t('hintBoxContinue', loc);
  cont.style.cssText = ['margin:18px 0 0', 'font-size:13px', 'font-style:italic',
    'color:#6d6444', 'animation:hintboxBreathe 2.2s ease-in-out infinite'].join(';');
  card.appendChild(cont);
  continueEl = cont;

  el.appendChild(card);

  const style = document.createElement('style');
  style.textContent = '@keyframes hintboxBreathe{0%,100%{opacity:1}50%{opacity:0.45}}';
  el.appendChild(style);

  document.body.appendChild(el);
  overlayEl = el;
}

// Begin the run exactly once: hide, release the listeners, fire the callback.
function advance() {
  if (advanced || !overlayEl) return;
  advanced = true;
  window.removeEventListener('keydown', onKeydown, true);
  overlayEl.removeEventListener('pointerdown', onPointerdown);
  overlayEl.style.display = 'none';
  if (typeof onBeginCb === 'function') onBeginCb();
}

function onKeydown(e) {
  // Keystrokes belonging to the shared controls bar (the select's arrows/Enter, the
  // slider's arrows) are the control's, not the box's — the player is adjusting sound or
  // language, not beginning the run.
  const target = e.target;
  if (target && target.closest && target.closest('#game-controls')) return;
  e.preventDefault();
  e.stopPropagation();
  advance();
}

function onPointerdown(e) {
  e.preventDefault();
  e.stopPropagation();
  advance();
}

// Re-resolve the four lines for a new locale (the shared controls bar's select can
// change the language while the box is open — main.js fans the change out).
function relabel(locale) {
  if (!overlayEl) return;
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  if (goalEl) goalEl.textContent = t('goalHint', loc);
  if (controlsEl) controlsEl.textContent = t('controlHint', loc);
  if (hazardsEl) hazardsEl.textContent = t('hintHazards', loc);
  if (continueEl) continueEl.textContent = t('hintBoxContinue', loc);
}

// relabelHintBox(locale) — main.js's applyLocaleChange fan-out leg for this box.
// No-op if the box was never built.
export function relabelHintBox(locale) {
  relabel(locale);
}

// ---- public show/hide ----
// show(locale, onBegin): builds (or re-localizes) the overlay, then displays it. onBegin
// is called once, on the first click or key press outside the controls bar, and the box
// hides itself first — the callback only flips the run to 'playing'.
export function showHintBox(locale, onBegin) {
  if (!overlayEl) build(locale);
  else relabel(locale);
  onBeginCb = typeof onBegin === 'function' ? onBegin : null;
  advanced = false;
  overlayEl.style.display = 'flex';
  window.addEventListener('keydown', onKeydown, true);
  overlayEl.addEventListener('pointerdown', onPointerdown);
}

export function hideHintBox() {
  if (!overlayEl) return;
  window.removeEventListener('keydown', onKeydown, true);
  overlayEl.removeEventListener('pointerdown', onPointerdown);
  overlayEl.style.display = 'none';
}

export function isHintBoxVisible() {
  return !!(overlayEl && overlayEl.style.display !== 'none');
}
