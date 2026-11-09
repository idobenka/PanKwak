// ui/storypage.js — the opening story page (CATS-110), the FIRST screen of a fresh
// playthrough, shown before the welcome card (CATS-80).
//
// CATS-110: the page is now FULL-BLEED ART — one intro story painting that already
// carries the whole story text baked in (intro_story_ua.png / intro_story_en.png,
// 1536×1024 = the exact 3:2 of the game's 900×600 window). No rendered title, no
// paragraphs: the art IS the page, at full game box size. Per-locale art — Ukrainian
// sees the Ukrainian painting, English the English one.
//
// The music begins with the page: main.js parks the ambient bed's intent at load
// (CATS-112), so in browsers that permit autoplay the bed starts on its own; where the
// autoplay policy blocks it, the FIRST gesture — the page-turn click/key itself — starts
// it (this page fires the unlock itself: its stopPropagation shields that gesture from
// main.js's window-level unlock listeners, CATS-112 follow-up). The sound + language
// controls are the SHARED bar (ui/controls.js, CATS-112), floating top-right of the game
// box over this page's art — this page no longer builds its own.
//
// Any click or keyboard press OUTSIDE the controls turns the page (advances to the
// welcome card, where names are chosen and Start begins the run). One page only.
//
// Naming: the end-of-game share card owns "postcard" (ui/postcard.js), the name-entry
// card owns "welcome" (ui/welcome.js). This is the STORY page — overlay id
// `story-overlay`, art in assets/sprites/story/.

import { t, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n.js';

// CATS-110: per-locale intro art. The painting carries the full story text, so the
// file IS the localization — uk gets the Ukrainian art, en the English art. 1536×1024,
// exactly the 3:2 of the 900×600 window: the image fills the card edge to edge with
// no cropping (object-fit:cover is a safety net for aspect drift, not a normal path).
const ART_BY_LOCALE = {
  uk: 'assets/sprites/story/intro_story_ua.png',
  en: 'assets/sprites/story/intro_story_en.png',
};

let overlayEl = null;   // the story page container
let artEl = null;       // the full-bleed intro painting
let hintEl = null;      // the "click to begin" hint, re-localized per language switch
let onAdvanceCb = null; // set by show(); a click/keypress outside the controls calls it once
let getAudioCb = null;  // set by show(); the page-turn gesture unlocks + starts the bed
let advanced = false;   // one-shot latch: the advance gesture fires exactly once

// Build the overlay once. Re-localized by relabel() when the player switches language
// while the page is open.
function build(locale) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;

  const el = document.createElement('div');
  el.id = 'story-overlay';
  el.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex',
    'align-items:center', 'justify-content:center',
    'background:rgba(8,12,24,0.86)', 'z-index:40',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'padding:16px',
  ].join(';');

  // ---- the story card: the SAME 1000px 3:2 box as the game canvas (CATS-104; 900→1000
  // by CATS-122) ----
  // The art fills it edge to edge (CATS-110); the card's radius clips the corners.
  // CATS-122 follow-up: max-height:92vh dropped — the game canvas has no height clamp,
  // so on short windows the clamped card rendered smaller than the game page.
  const card = document.createElement('div');
  card.className = 'story-card';
  card.style.cssText = [
    'position:relative',
    'box-sizing:border-box',
    'width:min(1000px,96vw)', 'aspect-ratio:3/2',
    'overflow:hidden',
    'border-radius:18px',
    'box-shadow:0 12px 40px rgba(0,0,0,0.5)',
    'cursor:pointer',
  ].join(';');

  // The full-bleed intro painting. It IS the page.
  const art = document.createElement('img');
  art.className = 'story-art';
  art.src = artSrcFor(loc);
  art.alt = t('storyArtAlt', loc);
  art.draggable = false;
  art.style.cssText = ['position:absolute', 'inset:0', 'width:100%', 'height:100%',
    'object-fit:cover', 'display:block'].join(';');
  card.appendChild(art);
  artEl = art;

  // The continue hint — the single affordance, floating bottom-center over the art.
  // A gentle breathing fade keeps the page alive without demanding anything.
  const hint = document.createElement('div');
  hint.dataset.i18n = 'storyContinue';
  hint.textContent = t('storyContinue', loc);
  hint.style.cssText = ['position:absolute', 'left:0', 'right:0', 'bottom:14px',
    'z-index:2', 'margin:0', 'font-size:14px', 'font-style:italic',
    'color:#fff', 'text-align:center', 'letter-spacing:0.4px',
    'text-shadow:0 1px 6px rgba(0,0,0,0.65)',
    'pointer-events:none',
    'animation:storyBreathe 2.2s ease-in-out infinite'].join(';');
  card.appendChild(hint);
  hintEl = hint;

  el.appendChild(card);

  // The @keyframes for the hint's breathing fade. Scoped by id on the sheet so a second
  // build (there is none today) can't duplicate it.
  const style = document.createElement('style');
  style.textContent = '@keyframes storyBreathe{0%,100%{opacity:1}50%{opacity:0.45}}';
  el.appendChild(style);

  document.body.appendChild(el);
  overlayEl = el;
}

function artSrcFor(locale) {
  return ART_BY_LOCALE[locale] || ART_BY_LOCALE[DEFAULT_LOCALE];
}

// Turn the page exactly once: hide, release the listeners, fire the callback.
function advance() {
  if (advanced || !overlayEl) return;
  advanced = true;
  window.removeEventListener('keydown', onKeydown, true);
  overlayEl.removeEventListener('pointerdown', onPointerdown);
  overlayEl.style.display = 'none';
  if (typeof onAdvanceCb === 'function') onAdvanceCb();
}

// CATS-112 follow-up: the page-turn gesture is the player's FIRST gesture, and these
// handlers stopPropagation — which shields it from main.js's window-level unlock
// listeners. Without this, the bed only began on whatever gesture came SECOND (a
// language pick, a mute toggle). Fire the unlock + parked-intent flush here so the
// music begins with the page-turn itself. Both no-op once running.
function startMusic() {
  const audio = getAudioCb && getAudioCb();
  if (!audio) return;
  audio.unlock();
  audio.startBed();
}

function onKeydown(e) {
  // Keystrokes belonging to the shared controls bar (the select's arrows/Enter, the
  // slider's arrows) are the control's, not the page's — this listener captures at the
  // window level, so only a target check can exempt them.
  const target = e.target;
  if (target && target.closest && target.closest('#game-controls')) return;
  e.preventDefault();
  e.stopPropagation();
  startMusic();
  advance();
}

function onPointerdown(e) {
  e.preventDefault();
  e.stopPropagation();
  startMusic();
  advance();
}

// Re-resolve the art + hint for a new locale (a language change while the page is open —
// the shared controls bar's select). The art file IS the story text, so the swap is the
// re-localization.
function relabel(locale) {
  if (!overlayEl) return;
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  if (artEl) {
    artEl.src = artSrcFor(loc);
    artEl.alt = t('storyArtAlt', loc);
  }
  if (hintEl) hintEl.textContent = t('storyContinue', loc);
}

// relabelStoryPage(locale) — main.js's applyLocaleChange fans a locale change out to every
// open overlay; this is the story page's leg.
export function relabelStoryPage(locale) {
  relabel(locale);
}

// ---- public show/hide ----
// show(locale, onAdvance, getAudio): builds (or re-localizes) the overlay, then displays
// it. onAdvance is called once, on the first click or key press outside the controls.
// getAudio returns the game's audio object — the page-turn gesture uses it to fire the
// autoplay unlock + parked bed start itself (CATS-112 follow-up). The sound + language
// controls are the shared bar (ui/controls.js) — not this page's. (pointer gestures on
// the bar can't reach this overlay's listener: the bar is DOM above it, so pointerdown on
// the bar never bubbles here — only the keydown guard above is needed.)
export function showStoryPage(locale, onAdvance, getAudio) {
  if (!overlayEl) build(locale);
  else relabel(locale);
  onAdvanceCb = typeof onAdvance === 'function' ? onAdvance : null;
  getAudioCb = typeof getAudio === 'function' ? getAudio : null;
  advanced = false;
  overlayEl.style.display = 'flex';
  window.addEventListener('keydown', onKeydown, true);
  overlayEl.addEventListener('pointerdown', onPointerdown);
}

export function hideStoryPage() {
  if (!overlayEl) return;
  window.removeEventListener('keydown', onKeydown, true);
  overlayEl.removeEventListener('pointerdown', onPointerdown);
  overlayEl.style.display = 'none';
}

export function isStoryPageVisible() {
  return !!(overlayEl && overlayEl.style.display !== 'none');
}
