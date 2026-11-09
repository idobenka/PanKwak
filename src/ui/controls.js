// ui/controls.js — the ONE sound + language controls bar (CATS-112).
//
// Every page — the intro story page, the welcome card, the in-game HUD, and the end
// postcard — presents the same controls, in the same place: pinned to the TOP-RIGHT
// corner of the game box (the shared 900×600 window all four pages present in, CATS-104).
// One DOM element, built once, floating above every page (z-index above the overlays).
// This replaces the per-page variants: the story page's own bar, the welcome card's
// lang row + sound button, the postcard's below-card picker, the canvas-drawn HUD
// speaker cluster (CATS-94/102), and the page-level #lang-wrap dropdown that sat at the
// browser corner, outside the game box.
//
//   • SOUND   — a speaker button toggling the run's own audio object's mute (state and
//               behavior identical on every page: a mute on the intro page carries into
//               the run). Hovering the button reveals a VOLUME SLIDER (CATS-102's hover
//               affordance, now on every page, not just in-game) that drives setVolume.
//   • LANGUAGE — a <select> whose change routes through the shared onLocaleChange
//               callback (main.js's applyLocaleChange — persist + re-localize the live
//               UI with no reload); the open page re-localizes itself as before.
//
// The bar drives audio directly via a getAudio() accessor and reports locale changes via
// onLocaleChange — both injected once from main.js, so the module owns no game state.

import { t, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n.js';

// Locale → native display name (the convention every previous picker here used: a user
// who reads only Ukrainian finds "Українська", not "Ukrainian").
const LOCALE_NAMES = { en: 'English', uk: 'Українська' };

// The speaker glyphs (box + sound cone; struck through when muted) — the same inline SVG
// the story page and welcome card already used, so the control looks identical to before.
const SPEAKER_ON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M11 5 6 9H3v6h3l5 4z" fill="#fff"/>'
  + '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="#fff" '
  + 'stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
const SPEAKER_OFF_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M11 5 6 9H3v6h3l5 4z" fill="#fff"/>'
  + '<path d="M16 9.5l5 5M21 9.5l-5 5" stroke="#fff" stroke-width="1.8" '
  + 'stroke-linecap="round"/></svg>';

let barEl = null;        // the controls bar container
let soundBtnEl = null;   // the speaker (mute) button
let sliderWrapEl = null; // the hover-revealed volume slider
let sliderEl = null;     // the <input type=range>
let langSelectEl = null; // the language <select>
let getAudioCb = null;   // set by mount(); returns the game's audio object
let onLocaleChangeCb = null; // set by mount(); persist + propagate a locale change
let curLocale = DEFAULT_LOCALE;

// Keys the game reads as movement/steering (input.js KEYMAP + restart). A control may
// only stopPropagation for keys IT natively consumes — never for these, or a click on
// the bar would blind the keyboard until the player clicks the canvas again.
const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyR',
]);

// A pointer interaction finished on a control — hand focus back to the page so the next
// arrow/WASD press steers the frog (input.js listens on window). Focus set by KEYBOARD
// (Tab + Enter/Space) stays on the control: the button remains fully keyboard-operable.
function returnFocusAfterPointer() {
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

function build(locale) {
  const el = document.createElement('div');
  el.id = 'game-controls';
  el.style.cssText = [
    'position:absolute', 'top:12px', 'right:12px', 'z-index:60',
    'display:flex', 'align-items:center', 'gap:8px',
    'background:rgba(10,14,26,0.62)', 'border-radius:10px', 'padding:6px 8px',
    'user-select:none',
  ].join(';');

  // --- sound: speaker button + hover-revealed volume slider ---
  // The slider sits LEFT of the speaker in one hover cluster (pointer can travel from
  // icon to track without the reveal blinking away). range's own drag does the work —
  // no pointer-capture math needed, unlike the old canvas slider.
  const soundCluster = document.createElement('div');
  soundCluster.className = 'controls-sound';
  soundCluster.style.cssText = ['position:relative', 'display:flex',
    'align-items:center'].join(';');

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'controls-volume';
  // Hidden by clipping to width 0; revealed on cluster hover. width transitions so the
  // reveal eases; overflow:hidden keeps the track invisible while collapsed.
  sliderWrap.style.cssText = ['width:0', 'overflow:hidden',
    'transition:width 0.15s ease'].join(';');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.setAttribute('aria-label', 'volume');
  slider.style.cssText = ['width:96px', 'height:20px', 'margin:0', 'cursor:pointer',
    'accent-color:#f3c969', 'display:block'].join(';');
  slider.addEventListener('input', () => {
    const audio = getAudioCb && getAudioCb();
    if (!audio) return;
    audio.setVolume(Number(slider.value));
  });
  // While the slider has FOCUS its native behavior consumes the arrows (adjusting the
  // thumb) — stop those from reaching the game so a keyboard-focus drag of the thumb
  // doesn't also steer the boat. Game keys (WASD/R) still pass through: the slider
  // ignores them, and stopping them would blind the game for no benefit. The slider
  // only keeps focus after a KEYBOARD interaction — a pointer drag hands focus back
  // (pointerup below), so the arrows return to steering the moment the thumb drops.
  slider.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.code) && e.key !== ' ') e.stopPropagation();
  });
  slider.addEventListener('pointerup', () => returnFocusAfterPointer());
  sliderWrap.appendChild(slider);
  soundCluster.appendChild(sliderWrap);

  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'controls-sound-btn';
  soundBtn.style.cssText = ['border:none', 'border-radius:8px', 'width:34px', 'height:30px',
    'padding:0', 'cursor:pointer', 'flex:0 0 auto',
    'background:rgba(255,255,255,0.14)',
    'display:flex', 'align-items:center', 'justify-content:center'].join(';');
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const audio = getAudioCb && getAudioCb();
    if (!audio) return;
    audio.setMuted(!audio.isMuted());
    // Unmuting is an "I want to hear it" gesture — if the bed's intent was parked, the
    // audio module flushes it on the unlock/resume path; nudging startBed here is
    // idempotent and covers the story page's first-gesture-was-the-mute-press case.
    if (!audio.isMuted()) audio.startBed();
    paint();
    // A pointer click parks DOM focus on the button; hand it back so the next arrow/WASD
    // press steers the frog instead of the button. UIEvent.detail is 0 for keyboard
    // activation — those keep focus so the button stays keyboard-operable.
    if (e.detail > 0) returnFocusAfterPointer();
  });
  // The button natively consumes Space/Enter (it activates) — stop those from also
  // reaching the page, but let every game key through: the button ignores them, and
  // stopping them would blind the game for no benefit.
  soundBtn.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') e.stopPropagation();
  });
  soundCluster.appendChild(soundBtn);

  // Hover anywhere in the cluster (icon OR revealed slider) keeps the slider open.
  soundCluster.addEventListener('pointerenter', () => { sliderWrap.style.width = '100px'; });
  soundCluster.addEventListener('pointerleave', () => { sliderWrap.style.width = '0'; });

  el.appendChild(soundCluster);

  // --- language select ---
  // CATS-112 follow-up: the opened popup's <option>s need EXPLICIT colors — the closed
  // control is white text on the bar's dark translucent pill, but the native popup list
  // ignores translucent backgrounds and paints the OS default white, leaving white text
  // on white. Give each option a solid dark background + light text so the dropdown list
  // reads like the control itself.
  const langSelect = document.createElement('select');
  for (const code of SUPPORTED_LOCALES) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = LOCALE_NAMES[code] || code;
    if (code === locale) opt.selected = true;
    opt.style.cssText = ['background:#0b1020', 'color:#dfe6f5'].join(';');
    langSelect.appendChild(opt);
  }
  langSelect.style.cssText = ['background:rgba(255,255,255,0.14)', 'color:#fff',
    'border:1px solid rgba(255,255,255,0.25)', 'border-radius:8px',
    'padding:4px 6px', 'font:inherit', 'font-size:13px', 'cursor:pointer'].join(';');
  langSelect.addEventListener('change', (e) => {
    curLocale = langSelect.value;
    if (typeof onLocaleChangeCb === 'function') onLocaleChangeCb(curLocale);
    paint();
    // Picking a language is a done-in-one-pointer-gesture action — hand focus back so
    // play continues without a re-click. detail 0 = keyboard-driven; those keep focus.
    if (e.detail > 0) returnFocusAfterPointer();
  });
  // An OPEN select consumes the arrows natively (it browses its options) — stop those
  // from also steering the boat. Game keys pass through untouched.
  langSelect.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.code) && e.key !== ' ') e.stopPropagation();
  });
  el.appendChild(langSelect);

  barEl = el;
  soundBtnEl = soundBtn;
  sliderWrapEl = sliderWrap;
  sliderEl = slider;
  langSelectEl = langSelect;
}

// Refresh the glyphs, labels, and slider position from live state (mute, volume, locale).
function paint() {
  const audio = getAudioCb && getAudioCb();
  const muted = !!(audio && audio.isMuted());
  const loc = SUPPORTED_LOCALES.includes(curLocale) ? curLocale : DEFAULT_LOCALE;
  if (soundBtnEl) {
    soundBtnEl.innerHTML = muted ? SPEAKER_OFF_SVG : SPEAKER_ON_SVG;
    soundBtnEl.title = t('soundToggle', loc);
    soundBtnEl.setAttribute('aria-label', t('soundToggle', loc));
    soundBtnEl.setAttribute('aria-pressed', String(muted));
  }
  if (sliderEl && audio) sliderEl.value = String(audio.getVolume());
}

// mount(hostEl, locale, getAudio, onLocaleChange) — build the bar once and append it
// INSIDE the game box's host element (position:absolute pins it to that box's top-right
// corner — the host must be position:relative, which #wrap's inner box is). Safe to call
// again from any page: the bar is one shared element, only re-localized.
export function mountControls(hostEl, locale, getAudio, onLocaleChange) {
  if (!hostEl) return;
  if (!barEl) build(locale);
  getAudioCb = typeof getAudio === 'function' ? getAudio : null;
  onLocaleChangeCb = typeof onLocaleChange === 'function' ? onLocaleChange : null;
  if (barEl.parentElement !== hostEl) hostEl.appendChild(barEl);
  setControlsLocale(locale);
  barEl.style.display = 'flex';
  paint();
}

// setControlsLocale(locale) — sync the select + labels after a locale change made
// elsewhere (main.js's applyLocaleChange is the same path the select itself fires).
export function setControlsLocale(locale) {
  curLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  if (langSelectEl) langSelectEl.value = curLocale;
  paint();
}

// repaintControls() — re-read audio state into the glyph/slider. For state changed by
// other affordances (the M key, +/− keyboard volume) so the bar never shows stale state.
export function repaintControls() {
  paint();
}
