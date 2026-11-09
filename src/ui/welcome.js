// ui/welcome.js — the welcome card, the SECOND screen a player sees (CATS-80), after
// the intro story page (CATS-110).
//
// Letter aesthetic (CATS-111 final wording): image on the left; on the right, THE LETTER
// ITSELF — the invitation Mr. Kwak received, set mid-page in a handwriting face — then the
// lead-in ("Mr. Kwak immediately knew who had sent the letter. What about you?…") above the
// single MANDATORY name field, with the "(Recipient's name)" placeholder hint, and the
// "Compose the letter>>" button (a regular basic button).
//
// The player's frog is a FIXED character (Mr. Kwak / Пан Квак) — no input field for him.
// Start stays disabled until a name is typed; a blank value still falls back to the
// canonical default deep in the run (canonicalName in config.js), but the UI never lets one
// through.
//
// The sound + language controls are the SHARED bar (ui/controls.js, CATS-112), floating
// top-right of the game box over this card — the card no longer carries its own row.
//
// Naming collision: the end-of-game share card already owns the word "postcard"
// (src/ui/postcard.js, assets/sprites/postcard/). This is the WELCOME card — overlay id
// `welcome-overlay`, art in assets/sprites/welcome/. (One shared exception: the postmark
// PNG lives under assets/sprites/postcard/ and is drawn by BOTH cards.)
//
// All copy is i18n (CATS-54): every visible string is a catalog entry in both en and uk. No
// inline strings.

import { t, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n.js';
import {
  defaultFrogName, defaultFernName, NAME_MAX_LEN, canonicalName,
} from '../config.js';

// Stable placeholder asset paths (CATS-80). The user drops final art at these exact paths
// later — a file drop, not a code change. Documented in assets/sprites/welcome/README.md.
const LEFT_IMG = 'assets/sprites/welcome/welcome_left.placeholder.png';
// CATS-125 follow-up: the stamp is the SAME opaque PNG postmark the final postcard draws
// (assets/sprites/postcard/postmark.placeholder.png) — one shared postmark asset for both
// cards; swapping that single file re-skins both. (The welcome card's old SVG stamp and the
// retired postcard_frame.svg were removed in the CATS-137 unused-asset cleanup.)
const STAMP_IMG = 'assets/sprites/postcard/postmark.png';
// CATS-111 final wording: the custom compose-button art, per locale (the label text is drawn
// over it). Same stable-path + file-swap convention; the final art replaces these files.
// CATS-111 final pass: the old-paper texture of the letter page (the right column). One
// locale-neutral texture; the cream base color beneath it is the graceful fallback.
const PAPER_IMG = 'url("assets/sprites/welcome/welcome_paper.placeholder.png")';

let overlayEl = null;      // the welcome card container
let onStartCb = null;      // set by show(); the Start button calls it with (fixed frogName, typed fernName)
let curLocale = DEFAULT_LOCALE; // the locale the card is currently rendered in
// CATS-82: the rules line names both frogs, so on a language switch relabel() must rebuild it
// from the still-typed field value (canonical-defaulted if blank), not the catalog literal.
let rulesToEl = null;      // the To name field the rules line mirrors
let startBtnEl = null;     // disabled until the mandatory name is typed

// Build the overlay once. Localized at build time + re-localized by relabel() if the player
// changes language while the card is open (the shared controls bar's select — see main.js).
function build(locale) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  curLocale = loc;
  injectHintStyle();

  const el = document.createElement('div');
  el.id = 'welcome-overlay';
  el.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex',
    'align-items:center', 'justify-content:center',
    'background:rgba(8,12,24,0.86)', 'z-index:40',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'padding:16px',
  ].join(';');

  // ---- the postcard-back card ----
  const card = document.createElement('div');
  card.className = 'welcome-card';
  card.style.cssText = [
    'display:flex', 'flex-direction:row',
    // CATS-104 follow-up: the SAME window box as the game canvas (3:2; 900→1000 wide by
    // CATS-122) — the story page, this card, and the game all present at one size, so the
    // frame never jumps at the borders when a page turns. border-box so the 4px border is
    // INSIDE the 1000px. CATS-122 follow-up: max-height:92vh dropped to match the game
    // canvas (it clamped this card shorter than the game page on short windows).
    'box-sizing:border-box',
    'width:min(1000px,96vw)', 'aspect-ratio:3/2',
    'background:#f4f0d6', 'border-radius:18px',
    'border:4px solid #e2d9b8',
    'box-shadow:0 12px 40px rgba(0,0,0,0.5)',
    'overflow:hidden',
  ].join(';');

  // LEFT COLUMN — the illustration (placeholder for now; user provides the final image).
  const left = document.createElement('div');
  left.className = 'welcome-left';
  left.style.cssText = ['flex:0 0 46%', 'background:#d8cba0', 'min-height:360px',
    'display:flex', 'align-items:center', 'justify-content:center'].join(';');
  const leftImg = document.createElement('img');
  leftImg.src = LEFT_IMG;
  leftImg.alt = t('welcomeLeftAlt', loc);
  leftImg.style.cssText = ['width:100%', 'height:100%', 'object-fit:cover', 'display:block'].join(';');
  // Missing placeholder asset → the cream wash still reads as the postcard back; never breaks.
  leftImg.onerror = () => { leftImg.style.display = 'none'; };
  left.appendChild(leftImg);

  // RIGHT COLUMN — the letter page: the letter, lead-in + To field, With Love, compose
  // button. CATS-111 final pass: the column reads as OLD PAPER — a PNG texture behind the
  // content (stable path, file-swap convention; the user drops the final paper art there).
  // The cream base color stays under it, so a missing/failed PNG degrades to the plain
  // postcard-cream page and the card never breaks.
  const right = document.createElement('div');
  right.className = 'welcome-right';
  right.style.cssText = ['flex:1 1 54%', 'padding:22px 26px', 'display:flex',
    'flex-direction:column', 'position:relative', 'min-width:0',
    `background:${PAPER_IMG} center/cover no-repeat, #f4f0d6`].join(';');

  // Top-right stamp — the shared opaque PNG postmark (CATS-125 follow-up), small and angled
  // like real postage, same 64px width + 7° tilt the final postcard pins its postmark at.
  // CATS-127: pinned BELOW the shared sound+language bar (ui/controls.js) floating over this
  // same box's top-right corner — the old 16px top put the stamp under the language select.
  const stamp = document.createElement('img');
  stamp.src = STAMP_IMG;
  stamp.alt = t('welcomeStampAlt', loc);
  stamp.style.cssText = ['position:absolute', 'top:64px', 'right:18px',
    'width:100px', 'height:auto', 'transform:rotate(7deg)'].join(';');
  stamp.onerror = () => { stamp.style.display = 'none'; };
  right.appendChild(stamp);

  // THE LETTER (CATS-111 final wording) — the invitation Mr. Kwak received. It IS the page's
  // body text now: set in the handwriting face, vertically centered in the middle of the
  // right column, above the To lead-in. \n line breaks are load-bearing → white-space:pre-line.
  const rules = document.createElement('p');
  rules.dataset.i18n = 'welcomeRules';
  rules.textContent = t('welcomeRules', loc);
  rules.style.cssText = ['margin:0px 10px 10px 70px', 'font-size:16px', 'line-height:1.1',
    'color:#5d6a4a', 'max-width:50ch', 'white-space:pre-line',
    "font-family:'fangsong'",
    'font-style:italic', 'text-align:left',
    'flex:1 1 auto', 'display:flex', 'flex-direction:column',
    'justify-content:center'].join(';');
  right.appendChild(rules);

  // CATS-111 final wording: the LEAD-IN above the To field — "Mr. Kwak immediately knew who
  // had sent the letter. What about you? Who would you wish to send a letter like this to?"
  // A multi-line paragraph (white-space:pre-line), then the MANDATORY name field beneath it
  // with the "(Recipient's name)" placeholder hint. The field starts EMPTY and Start stays
  // disabled until a name is typed.
  const fieldsWrap = document.createElement('div');
  fieldsWrap.style.cssText = ['display:flex', 'flex-direction:column', 'gap:5px', 'margin:10px 10px 10px 80px','align-items: end;'].join(';');
  const leadIn = document.createElement('p');
  leadIn.dataset.i18n = 'welcomeTo';
  leadIn.textContent = t('welcomeTo', loc);
  leadIn.style.cssText = ['margin:0', 'font-size:13px', 'line-height:1.5',
    'color:#6b7556', 'white-space:pre-line'].join(';');
  fieldsWrap.appendChild(leadIn);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = '';
  input.maxLength = NAME_MAX_LEN;
  input.spellcheck = false;
  input.required = true;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', t('welcomeNameHint', loc));
  input.placeholder = t('welcomeNameHint', loc);
  input.style.cssText = ['width:100%', 'text-align:center', 'box-sizing:border-box', 'border:none',
    'border-bottom:2px solid #d8cba0', 'background:transparent', 'font-size:16px',
    'color:#1c2740', 'padding:0px 0px 3px 3px', 'margin:0px 0 25px 0', 'outline:none', 'font-family:inherit',
    // CATS-121: the focus/blur effects ease in instead of snapping.
    'transition:border-bottom-color 0.25s ease, background-color 0.25s ease'].join(';');
  // CATS-121: the focus effects — the warm underline PLUS a faint rose-gold tint behind the
  // text, so the focused field reads as gently highlighted, not just re-lined.
  input.addEventListener('focus', () => {
    input.style.borderBottomColor = '#9a6a3a';
    input.style.backgroundColor = 'rgba(154,106,58,0.06)';
  });
  input.addEventListener('blur', () => {
    input.style.borderBottomColor = '#d8cba0';
    input.style.backgroundColor = 'transparent';
  });
  fieldsWrap.appendChild(input);
  right.appendChild(fieldsWrap);

  rulesToEl = input;
  // CATS-111 follow-up #4: mandatory entry — Start enables only when the trimmed value is
  // non-empty.
  const syncStartEnabled = () => {
    const has = !!(rulesToEl.value && rulesToEl.value.trim());
    // CATS-121: the blinking glow is the "over here" beacon — it breathes only while the
    // field is empty; the moment a name is in, the beacon stops (the field got its answer).
    rulesToEl.classList.toggle('welcome-name-glow', !has);
    if (startBtnEl) {
      startBtnEl.disabled = has ? false : true;
      startBtnEl.style.opacity = has ? '1' : '0.45';
      startBtnEl.style.cursor = has ? 'pointer' : 'not-allowed';
    }
  };
  input.addEventListener('input', syncStartEnabled);
  syncStartEnabled();

  // The COMPOSE button (CATS-111 final wording): "Compose the letter>>" / "Скласти лист>>".
  // A regular basic button — solid green pill, no background art.
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.dataset.i18n = 'welcomeStart';
  startBtn.textContent = t('welcomeStart', loc);
  startBtn.style.cssText = ['border:none', 'border-radius:10px', 'padding:12px 24px',
    'font-size:16px', 'font-weight:700', 'cursor:pointer',
    'background:#4f9466', 'color:#fff', 'align-self:self-end',
    'transition:filter 0.15s'].join(';');
  startBtn.addEventListener('mouseenter', () => { if (!startBtn.disabled) startBtn.style.filter = 'brightness(1.08)'; });
  startBtn.addEventListener('mouseleave', () => { startBtn.style.filter = 'none'; });
  startBtn.addEventListener('click', () => {
    if (startBtn.disabled) return;
    const frogName = defaultFrogName(curLocale);
    const fernName = canonicalName(input.value, defaultFernName(curLocale));
    if (typeof onStartCb === 'function') onStartCb(frogName, fernName);
  });
  right.appendChild(startBtn);
  startBtnEl = startBtn;
  syncStartEnabled(); // the field starts empty — Start must render disabled on first paint

  card.appendChild(left);
  card.appendChild(right);
  el.appendChild(card);

  // Typing into the name field must NOT steer the boat or start the run. The input handler
  // chain in input.js keys off window keydown (arrows/WASD/R); stop those at the overlay so
  // keystrokes are captured by the text field instead of the game. Enter inside a field
  // submits the card — but only when the mandatory name is filled (a disabled Start no-ops).
  const swallowKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); startBtn.click(); return; }
    e.stopPropagation();
  };
  input.addEventListener('keydown', swallowKey);

  document.body.appendChild(el);
  overlayEl = el;
}

// Placeholder styling for the name field's hint: pencil-faint guide text, clearly not a value.
// CATS-121: the blinking glow — a soft rose-gold halo under the field, breathing while the
// field is empty (the class is toggled by syncStartEnabled). Two keyframe tracks so the
// underline and the halo pulse together on one 1.6s cycle. The halo spreads from the
// field's own box via a downward offset, so no extra element is needed.
// Injected once per build into the document head.
function injectHintStyle() {
  const style = document.createElement('style');
  style.textContent = `
    #welcome-overlay input::placeholder{color:#a89f7e;font-style:italic;}
    #welcome-overlay input.welcome-name-glow {
      animation: welcome-glow-underline 1.6s ease-in-out infinite;
    }
    @keyframes welcome-glow-underline {
      0%, 100% {
        border-bottom-color: #d8cba0;
        box-shadow: 0 4px 10px rgba(154, 106, 58, 0);
      }
      50% {
        border-bottom-color: #9a6a3a;
        box-shadow: 0 4px 10px rgba(154, 106, 58, 0.25);
      }
    }
  `;
  document.head.appendChild(style);
}

// Re-resolve every [data-i18n] element for a new locale (the shared controls bar's select
// can change it while the card is open). Cheap; only touches textContent + alt/aria.
function relabel(locale) {
  if (!overlayEl) return;
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  curLocale = loc; // the Start handler canonicalizes typed names in THIS language
  overlayEl.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n, loc);
  });
  // The placeholder hint is a catalog string too — swap it with the language. A typed value
  // is the player's own and never touched.
  if (rulesToEl) {
    rulesToEl.placeholder = t('welcomeNameHint', loc);
    rulesToEl.setAttribute('aria-label', t('welcomeNameHint', loc));
  }
  const leftImg = overlayEl.querySelector('.welcome-left img');
  if (leftImg) leftImg.alt = t('welcomeLeftAlt', loc);
  const stamp = overlayEl.querySelector('.welcome-right > img');
  if (stamp) stamp.alt = t('welcomeStampAlt', loc);
}

// relabelWelcome(locale) — main.js's applyLocaleChange fans a locale change out to every
// open overlay; this is the welcome card's leg. No-op if the card was never built.
export function relabelWelcome(locale) {
  relabel(locale);
}

// ---- public show/hide ----
// show(locale, onStart): builds (or re-localizes) the overlay, then displays it. onStart is
// called with the two canonicalized names when the player presses Start (enabled only once a
// name is typed — mandatory entry). The sound + language controls are the shared bar
// (ui/controls.js) — not this card's.
export function showWelcome(locale, onStart) {
  if (!overlayEl) build(locale);
  else relabel(locale);
  onStartCb = typeof onStart === 'function' ? onStart : null;
  overlayEl.style.display = 'flex';
  // CATS-121: the cursor lands in the name field the moment the card opens — the player
  // can start typing without hunting for the field. focus({preventScroll}) avoids a
  // layout-triggered scroll jump; the field is visible on the open card anyway.
  if (rulesToEl) {
    try { rulesToEl.focus({ preventScroll: true }); }
    catch (_) { rulesToEl.focus(); }
  }
}

export function hideWelcome() {
  if (overlayEl) overlayEl.style.display = 'none';
}

export function isWelcomeVisible() {
  return !!(overlayEl && overlayEl.style.display !== 'none');
}
