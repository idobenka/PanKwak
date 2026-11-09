// ui/postcard.js — the shareable end-of-game postcard (CATS-31).
//
// CATS-125 layout: the picture fills the WHOLE card window; the letter column on the right
// keeps its exact position/typography but rides a translucent scrim (the image shows
// through beneath the text); the opaque PNG postmark is drawn last, on top of all layers.
//
// Composites the Asset Designer's frame + 3 scenes (CATS-32), the Narrative Agent's copy
// (CATS-33), and the Game Designer's payload semantics (CATS-34) into ONE postcard the
// player can share. It is ADDITIVE: it renders *after* the existing end overlay in
// src/ui/screens.js, never replacing it, so the warm "go again" path is untouched (PO
// acceptance criterion 7).
//
// The hard constraint from the PO review: NO backend, NO account, NO save data — the whole
// card must render client-side from a static asset + the run result encoded in a URL. So:
//   • A live run produces a postcard AND a share URL whose query string encodes the run
//     (outcome + flowers + dragonflies + frog name). Opening that URL on a fresh load
//     re-renders the exact same card — the link alone IS the postcard (criterion 2).
//   • "Save Postcard" exports the composited card to PNG via canvas.toDataURL, the fallback for
//     networks that swallow query strings / don't preview rich links (criterion 4).
//   • Share actions are pure client-side ("Share link" copies the URL; the donation buttons
//     open WWF Ukraine / UAnimals) — no SDKs, no server (criterion 3).
//
// Payload (CATS-34): { outcome: 'won'|'arrived_empty'|'lose', flowers:int, dragonflies:int,
// frog_name:str }. Frog name only — no other personal data travels in the link (privacy note).

// ---- per-state config: scene art + accent. Copy is localized (CATS-75) and resolved
// from the i18n catalog via t() using the payload's locale. Tone is load-bearing
// (R7/R9), so each outcome's copy lives in the catalog for a native tone review.
import {
  t, detectLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES,
} from '../i18n.js';
// Name identity (CATS-80, CATS-111). The canonical defaults are per-locale; postcard.js
// reads the same canonical rule (empty → the locale's default) so the share card shows the
// names the player chose.
import {
  defaultFrogName, defaultFernName, canonicalName,
} from '../config.js';

// The URL key for outcome uses the short form (won/empty/lost) per the CATS-32 README.
// Every card line interpolates from the same name/haul params, so each outcome config
// only owns its art, URL key, and accent — the letter structure (CATS-124: salutation →
// headline → body → wish → invite) is shared below.
function copyParams(p) {
  return {
    frogName: p.frogName, fernName: p.fernName,
    flowers: p.flowers, dragonflies: p.dragonflies,
  };
}

const STATE = {
  won: {
    // CATS-125: the final art landed as PNGs — the per-state scene is now the PNG file.
    scene: 'assets/sprites/postcard/postcard_win.png',
    urlKey: 'won',
    accent: '#7a5a2a',          // headline ink on the cream card back (dark warm brown)
    // CATS-124 WIN copy (celebratory, warm). frogName/fernName/flowers/dragonflies interpolate.
    body: 'cardBodyWonMany',
  },
  arrived_empty: {
    scene: 'assets/sprites/postcard/postcard_empty.png',
    urlKey: 'empty',
    accent: '#9a6a3a',          // rose-gold ink, matching screens.js #f3c98f tone (R7: never red/black)
    // CATS-124 ARRIVED EMPTY copy (R7 warm anticlimax, NEVER a loss screen).
    body: 'cardBodyEmpty',
  },
  lose: {
    scene: 'assets/sprites/postcard/postcard_lost.png',
    urlKey: 'lost',
    accent: '#3a5a8a',          // soft blue ink, matching screens.js #cfe0ff tone (R9: never harsh)
    // CATS-124 LOSE copy (R9 hopeful, never harsh).
    body: 'cardBodyLost',
  },
};

// headline key per outcome (kept beside STATE for a single lookup site in drawTextLayer).
const HEADLINE_KEY = {
  won: 'cardHeadlineWon',
  arrived_empty: 'cardHeadlineEmpty',
  lose: 'cardHeadlineLost',
};

// CATS-116 follow-up 2: the old frame shell (postcard_frame.svg) is retired — the card base
// is painted (border + wash) and the art is drawn by the image layer. CATS-125: the art now
// fills the whole window, not just a left column.

// CATS-83 — the IMAGE layer's dedicated art slot. A STABLE, state-neutral asset path, kept
// as the fallback image when no per-state scene applies (final art landed per-state in
// CATS-124/125, so the scenes now lead; this slot no longer overrides them). Replacing the
// file here is still a whole-image swap for the no-outcome / missing-scene paths.
const IMAGE_LAYER_SRC = 'assets/sprites/postcard/postcard_image.placeholder.svg';

// CATS-125: the POSTMARK — now its OWN PNG art (opaque, drawn on top of every layer), not
// the welcome card's SVG stamp. Placeholder at a stable path: swap the file in place to ship
// final art, no code change. Authored opaque so the postcard image never shows through it.
const STAMP_SRC = 'assets/sprites/postcard/postmark.png';

// CATS-116 follow-up: the card presents in the SAME 900×600 (3:2) window box as the story
// page, welcome card and game canvas — one size across every page.
// CATS-125: the picture is no longer confined to a left column — the per-state art fills
// the WHOLE card window (cover-fit). The text column stays where it was (same width,
// padding, and CATS-124 letter layout); only its backing changed from the opaque cream
// page to a TRANSLUCENT scrim, so the postcard image shows through beneath the text.
export const CARD_W = 900;
export const CARD_H = 600;
// The writing column's left edge — kept at the welcome card's 46% split so the letter's
// position/width are unchanged (CATS-125: "the right side with text is placed as it was").
const LEFT_W = Math.round(CARD_W * 0.46);

function clampInt(v, fallback) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Build a normalized payload from raw-ish inputs. outcome stays null if unknown. locale
// falls back to detectLocale() (the receiver's resolved language) when not provided.
// CATS-111: the frog is a FIXED character — his name always derives from the display
// locale (Mr. Kwak / Пан Квак), never from the payload. The recipient is the one carried
// name; an empty value → that locale's canonical default via canonicalName().
function makePayload({ outcome, flowers, dragonflies, frogName, fernName, locale }) {
  const st = outcome && STATE[outcome] ? outcome : null;
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : detectLocale();
  return {
    outcome: st,
    flowers: clampInt(flowers, 0),
    dragonflies: clampInt(dragonflies, 0),
    frogName: defaultFrogName(loc),
    fernName: canonicalName(fernName, defaultFernName(loc)),
    locale: loc,
  };
}

// outcome → canonical url key. Unknown/lose maps to its own scene; never silently upgrades.
function urlKeyToOutcome(k) {
  if (k === 'won') return 'won';
  if (k === 'empty') return 'arrived_empty';
  if (k === 'lost') return 'lose';
  return null;
}

// ---- URL encode/decode (criterion 2: the link alone re-renders the card) ----
// Short keys keep the share URL tidy (per CATS-32 README): s=state, f=flowers, d=dragonflies,
// fn=recipient name, l=locale (CATS-75 — so a shared link reopens in the sender's language).
// `s` uses the won/empty/lost short form. CATS-111: the frog no longer travels in the link —
// he is a fixed character whose name derives from `l` at open time. The recipient's name
// travels as `fn` (the one player-chosen name).
export function encodeShareURL(payload) {
  const st = payload.outcome ? STATE[payload.outcome].urlKey : 'lost';
  const u = new URL(window.location.origin + window.location.pathname);
  u.searchParams.set('s', st);
  u.searchParams.set('f', String(payload.flowers));
  u.searchParams.set('d', String(payload.dragonflies));
  u.searchParams.set('fn', payload.fernName);
  u.searchParams.set('l', payload.locale || DEFAULT_LOCALE);
  return u.toString();
}

// Returns a payload, or null if the URL carries no postcard (a normal playthrough).
export function payloadFromURL(search = window.location.search) {
  const params = new URLSearchParams(search);
  if (!params.has('s') && !params.has('f') && !params.has('d')) return null;
  return makePayload({
    outcome: urlKeyToOutcome(params.get('s')),
    flowers: params.get('f'),
    dragonflies: params.get('d'),
    // `n` (the old frog-name param) is intentionally NOT read — CATS-111 derives the frog's
    // name from `l`. `fn` (the recipient) is still honored so old links keep their chosen name.
    fernName: params.get('fn'),
    locale: params.get('l'),
  });
}

// Same helper for a live run's world (gifts + status). Used right after the run ends.
// locale is the resolved game locale (CONFIG.locale), passed in by the caller (CATS-75).
// Names come from the world the welcome card populated (CATS-80); empty → canonical default.
export function payloadFromWorld(world, locale) {
  return makePayload({
    // Map the world status through outcomeFromStatus: world uses 'lost' but STATE's key is
    // 'lose' — passing the raw status made the payload's outcome null on a sunset loss, so
    // the postcard never rose after a lost run.
    outcome: outcomeFromStatus(world.status),
    flowers: world.gifts.state.flowers,
    dragonflies: world.gifts.state.dragonflies,
    frogName: world.frogName,
    fernName: world.fernName,
    locale,
  });
}

// Map a world status to the postcard outcome key ('lost' status → 'lose' state).
export function outcomeFromStatus(status) {
  if (status === 'won') return 'won';
  if (status === 'arrived_empty') return 'arrived_empty';
  if (status === 'lost') return 'lose';
  return null;
}

// ---- image preloading ----
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin so the drawn SVG doesn't taint the card canvas (keeps PNG export working).
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Asset cache keyed by src. SVGs are static files; decoded once, reused each frame.
const imgCache = new Map();
async function getImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  try {
    const img = await loadImage(src);
    imgCache.set(src, img);
    return img;
  } catch (_) {
    imgCache.set(src, null); // missing asset → skip blit, card still composites text
    return null;
  }
}

// Load the three per-state scenes + the dedicated image-layer slot + the shared stamp up
// front (called once at startup). Resolves when ready (or failed).
export async function preloadPostcardArt() {
  await Promise.all([
    getImage(IMAGE_LAYER_SRC),
    getImage(STAMP_SRC),
    getImage(STATE.won.scene),
    getImage(STATE.arrived_empty.scene),
    getImage(STATE.lose.scene),
  ]);
}

// ---- the composite, split into two INDEPENDENT layers (CATS-83) ----
// ctx is already translated/scaled to the CARD_W×CARD_H box by the caller.
// CATS-125 layer order (back → front):
//   1. drawImageLayer() — the per-state art cover-fitted across the WHOLE card window.
//   2. drawTextLayer()  — the writing column, laid out exactly as before (CATS-124) but on
//      a TRANSLUCENT scrim so the image shows through beneath the text.
//   3. drawPostmark()   — the opaque PNG postmark, LAST, on top of every layer.
function drawComposite(ctx, payload) {
  drawCardBase(ctx);
  drawImageLayer(ctx, payload);
  drawTextLayer(ctx, payload);
}

// The card base — a plain dark backing that only shows where art is missing. The painted
// 4px border stays (the card's frame), but the cream fill is gone: the image fills the
// window now (CATS-125), so the base is just a safety net under a failed art load.
function drawCardBase(ctx) {
  ctx.save();
  ctx.fillStyle = '#d8cba0';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = '#e2d9b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, CARD_W - 4, CARD_H - 4);
  ctx.restore();
}

// IMAGE LAYER — the picture now fills the FULL card window (CATS-125). The per-state scene
// (the final PNG art, CATS-124's drop) is the primary image; the state-neutral slot
// (IMAGE_LAYER_SRC) is the fallback for a payload with no valid outcome (or a missing
// scene file) — the placeholder's "overrides the scenes" era ended when the final
// per-state art landed. Cover-fit (scale to fill, center-crop) into CARD_W×CARD_H.
function drawImageLayer(ctx, payload) {
  let img = payload.outcome ? imgCache.get(STATE[payload.outcome].scene) : null;
  if (!img) img = imgCache.get(IMAGE_LAYER_SRC);
  if (!img) return; // missing art → the card base wash still reads as the card
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  // cover-fit into the whole CARD_W×CARD_H window
  const scale = Math.max(CARD_W / iw, CARD_H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CARD_W, CARD_H);
  ctx.clip();
  ctx.drawImage(img, (CARD_W - dw) / 2, (CARD_H - dh) / 2, dw, dh);
  ctx.restore();
}

// TEXT LAYER — the RIGHT writing column, laid out exactly as CATS-116/124 left it (padding,
// vertical centering, letter structure, typography). CATS-125 changes ONLY its backing: a
// TRANSLUCENT cream scrim (rgba ~0.82) spanning the column, so the full-window postcard
// image shows through beneath the text instead of the old opaque cream page.
// CATS-124 letter structure: "For {fernName}," salutation, headline + body per outcome,
// the wish line, the invite closer, and the sender signature. Copy is fully localized
// (en/uk via t()) and interpolates the player-chosen names with a canonical-default
// fallback (CATS-80/82).
// CATS-124 follow-up typography: the SALUTATION is the big opener (Fredoka 30px); the
// outcome headline sits just above body size (Fredoka 19px vs 17px body); the invite is
// underlined and its canvas-coords rect is recorded so the DOM overlay can pin a real
// <a> over it (see syncInviteLink).
function drawTextLayer(ctx, payload) {
  const cfg = payload.outcome ? STATE[payload.outcome] : null;
  if (!cfg) { inviteRect = null; return; }
  const params = copyParams(payload);

  // The welcome card's right-column padding, transposed to the canvas. The bottom reserve
  // keeps the copy clear of the button row that overlays the card's bottom edge (follow-up 4).
  const PAD_Y = 22;
  const PAD_X = 26;
  const BOTTOM_RESERVE = 76;
  const x = LEFT_W + 4 + PAD_X;          // 4px = the card's painted border
  const w = CARD_W - x - PAD_X - 4;

  // The translucent scrim behind the writing column (CATS-125): cream at 82% alpha over
  // the full-window image — the text keeps its legible warm backing while the postcard
  // art reads through it. Spans the full column (and its padding) edge to edge.
  ctx.save();
  ctx.fillStyle = 'rgba(244, 240, 214, 0.82)';
  ctx.fillRect(LEFT_W + 4, 0, CARD_W - LEFT_W - 4, CARD_H);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Measure the whole block (salutation + headline + body + wish + invite + signature)
  // so it can be vertically centered in the writing page, like the welcome card's letter.
  const toFont = `600 30px 'Fredoka', system-ui, sans-serif`;
  const headFont = `600 19px 'Fredoka', system-ui, sans-serif`;
  const bodyFont = `400 17px system-ui, sans-serif`;
  const wishFont = `400 17px system-ui, sans-serif`;
  const inviteFont = `600 15px 'Fredoka', system-ui, sans-serif`;
  const signFont = `600 15px 'Fredoka', system-ui, sans-serif`;
  ctx.font = toFont;
  const toLines = wrapLines(ctx, t('cardHeadlineTo', payload.locale, params), w);
  ctx.font = headFont;
  const headLines = wrapLines(ctx, t(HEADLINE_KEY[payload.outcome], payload.locale, params), w);
  ctx.font = bodyFont;
  const bodyLines = wrapLines(ctx, t(cfg.body, payload.locale, params), w);
  ctx.font = wishFont;
  const wishLines = wrapLines(ctx, t('cardBodyWish', payload.locale, params), w);
  ctx.font = inviteFont;
  const inviteLines = wrapLines(ctx, t('cardBodyIvite', payload.locale, params), w);
  const inviteWidths = inviteLines.map((ln) => ctx.measureText(ln).width);
  ctx.font = signFont;
  const signLines = wrapLines(ctx, t('cardSignature', payload.locale, params), w);

  const TO_LH = 36;
  const HEAD_LH = 25;
  const BODY_LH = 25;
  const WISH_LH = 25;
  const INVITE_LH = 20;
  const SIGN_LH = 20;
  const GAP_TO_HEAD = 12;
  const GAP_HEAD_BODY = 12;
  const GAP_BODY_WISH = 22;
  const GAP_WISH_INVITE = 24;
  const GAP_INVITE_SIGN = 22;
  const blockH = toLines.length * TO_LH + GAP_TO_HEAD
    + headLines.length * HEAD_LH + GAP_HEAD_BODY
    + bodyLines.length * BODY_LH + GAP_BODY_WISH
    + wishLines.length * WISH_LH + GAP_WISH_INVITE
    + inviteLines.length * INVITE_LH + GAP_INVITE_SIGN
    + signLines.length * SIGN_LH;
  // Center in the band ABOVE the button-row reserve, so the copy never runs under the row.
  const usableH = CARD_H - PAD_Y - BOTTOM_RESERVE;
  let y = PAD_Y + (usableH - PAD_Y - blockH) / 2;
  if (y < PAD_Y) y = PAD_Y;

  // Salutation — "For {fernName}," opens the letter, as the big Fredoka line.
  ctx.fillStyle = cfg.accent;
  ctx.font = toFont;
  for (const ln of toLines) { y += TO_LH; ctx.fillText(ln, x, y); }

  // Headline — just above body size (CATS-124 follow-up), still in the accent ink.
  y += GAP_TO_HEAD;
  ctx.font = headFont;
  for (const ln of headLines) { y += HEAD_LH; ctx.fillText(ln, x, y); }

  // Body below the headline.
  y += GAP_HEAD_BODY;
  ctx.fillStyle = '#5d6a4a';
  ctx.font = bodyFont;
  for (const ln of bodyLines) { y += BODY_LH; ctx.fillText(ln, x, y); }

  // Wish — the closing sentiment line of the letter.
  y += GAP_BODY_WISH;
  ctx.font = wishFont;
  for (const ln of wishLines) { y += WISH_LH; ctx.fillText(ln, x, y); }

  // Invite — the CTA closer, underlined because it is a real link (syncInviteLink pins
  // a transparent <a> over exactly this region, opening the game itself).
  y += GAP_WISH_INVITE;
  const inviteTop = y;
  ctx.fillStyle = '#5d8f70';
  ctx.font = inviteFont;
  inviteLines.forEach((ln, i) => {
    y += INVITE_LH;
    ctx.fillText(ln, x, y);
    ctx.fillRect(x, y + 3, inviteWidths[i], 1.5);
  });
  inviteRect = {
    x,
    y: inviteTop,
    w: Math.max(40, ...inviteWidths),
    h: inviteLines.length * INVITE_LH,
  };

  // Signature — the sender line closing the letter (restored per CATS-124 follow-up).
  y += GAP_INVITE_SIGN;
  ctx.font = signFont;
  for (const ln of signLines) { y += SIGN_LH; ctx.fillText(ln, x, y); }

  ctx.restore();

  // The postmark is drawn LAST (CATS-125) — after the scrim and the letter — so the opaque
  // PNG sits ON TOP of every layer, the way a stamped postmark lies over the photo.
  drawPostmark(ctx, x, w);
}

// The postmark (CATS-125): the OPAQUE PNG art, 7° tilt, top-right of the writing column —
// drawn last so it sits on top of all layers. The art itself carries the tile (opaque
// cream), so nothing is composited behind it here; a failed load skips the blit and the
// card simply has no postmark (no ghost frame drawn under the image).
// CATS-127: the tile's top edge sits BELOW the shared sound+language bar (ui/controls.js)
// that floats over the top-right of this same box — the bar's bottom lands ≈49 canvas
// units down at the standard 1000px box, so the old 22px pin put the postmark right under
// the language select.
function drawPostmark(ctx, textX, textW) {
  const stamp = imgCache.get(STAMP_SRC);
  if (!stamp) return;
  const STAMP_W = 80;               // the postmark's on-card width (welcome's stamp width)
  const sh = STAMP_W * (stamp.naturalHeight / stamp.naturalWidth);
  const cx = textX + textW - STAMP_W / 2;
  const STAMP_TOP = 72;             // tile top, canvas units (12% of the card) — clears the bar
  const cy = STAMP_TOP + sh / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((7 * Math.PI) / 180);  // the 7° tilt the welcome stamp uses
  ctx.drawImage(stamp, -STAMP_W / 2, -sh / 2, STAMP_W, sh);
  ctx.restore();
}

// Split text into wrapped lines at the current ctx.font (measure-only helper).
// A literal \n in the string is a HARD break (CATS-124 follow-up): each \n-separated
// segment then word-wraps on its own, like the welcome letter's pre-line text.
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (!para) { lines.push(''); continue; }   // empty \n segment → a blank line
    const words = para.split(' ');
    let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = wd; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// ---- DOM overlay: the card controls — share/save + donations (criterion 2/3/4) ----
// Built once on first show, hidden/shown with the card. Pure client-side; no SDKs.
// CATS-116: the controls sit in two labeled group frames (fieldset + legend) — "Send a
// reply" (Share link + Download) and "Donate" (WWF + UAnimals, each with the site's own
// icon hotlinked and a locale-aware donate URL).
// CATS-116 follow-up: every control sits in ONE row over the card's bottom edge; donation
// labels drop the "with …" ending (the org now lives in the tooltip + bigger icon); every
// control has a localized tooltip (native title attribute). CATS-125 follow-up: the row
// SPLITS by half — "Send a reply" centered on the left (picture) half with the light legend,
// "Donate" + Play again centered together on the right (letter) half with a dark legend;
// the group buttons are linen, Play alone stays sagegreen.
// The old X/Twitter, WhatsApp and Email share intents are gone entirely.
let overlayEl = null;       // the floating card+controls container
let cardCanvasEl = null;    // the visible card (a separate canvas, not the game canvas)
let shareURLForCopy = '';   // cached for the copy button
// CATS-124 follow-up: the invite line is a real link. drawTextLayer records the region it
// painted the invite in (canvas coords, CARD_W×CARD_H space); syncInviteLink maps that onto
// the rendered card and pins a transparent <a> over exactly those pixels.
let inviteRect = null;
let inviteLinkEl = null;
// CATS-120: the transient "link copied to clipboard" hint + its one shared timer. A rapid
// re-click of Share restarts the 1s window instead of stacking a second toast.
let copiedHintEl = null;
let copiedHintTimer = 0;
// The payload currently rendered on the card. Kept so a language change can re-render
// the whole card (canvas copy + signature + buttons + share URL) without a fresh show call.
let currentPayload = null;
let overlayLocale = DEFAULT_LOCALE; // locale the overlay buttons + group labels render in
// Button elements keyed by their catalog key, so labels AND TOOLTIPS can be re-localized
// without rebuilding the overlay (e.g. a shared ?l=uk card shown, then a live win in an en
// session). `key` resolves the label; `tipKey` (when present) resolves the tooltip.
const labelButtons = [];
// Legend elements keyed by their catalog key — the two group labels re-localize the same way.
const labelLegends = [];
// The donation anchors, so a language change relabels them AND refreshes their (locale-aware) href.
const donateButtons = [];

// The donation targets (CATS-116). `icon` hotlinks each site's own icon via its URL, per
// the issue; `href(loc)` resolves the donate page — the same for both languages for WWF,
// locale-split for UAnimals (a dedicated English page exists).
const DONATIONS = [
  {
    key: 'cardBtnWwf',
    tipKey: 'cardTipWwf',
    icon: 'https://wwf.ua/favicon.ico',
    href: () => 'https://wwf.ua/donate/',
  },
  {
    key: 'cardBtnUanimals',
    tipKey: 'cardTipUanimals',
    icon: 'https://uanimals.org/wp-content/uploads/2026/08/favicon.png',
    href: (loc) => (loc === 'uk'
      ? 'https://uanimals.org/donate-as-a-gift/'
      : 'https://uanimals.org/en/donate-as-a-gift/'),
  },
];

function buildOverlay(locale) {
  overlayLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const loc = overlayLocale;
  const el = document.createElement('div');
  el.id = 'postcard-overlay';
  // CATS-116 follow-up 3: the overlay mirrors the welcome overlay's shell exactly —
  // centering, 16px padding, the welcome dim (0.86) — so the final card reads as the same
  // object on the same stage. CATS-116 follow-up 4: the button row sits OVER the card,
  // pinned to its bottom edge from inside.
  el.style.cssText = [
    'position:fixed', 'inset:0', 'display:none',
    'align-items:center', 'justify-content:center',
    'background:rgba(8,12,24,0.86)', 'z-index:50',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'padding:16px',
  ].join(';');

  // The card wrap — the WELCOME card's exact window box (welcome.js): the shared
  // min(1000px,96vw) 3:2 box (900→1000 by CATS-122; max-height:92vh dropped in the
  // follow-up to match the game canvas). position:relative so the control row can
  // pin to the card's bottom edge from inside (bottom:14px), overlapping the card.
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center';

  const card = document.createElement('canvas');
  card.width = CARD_W;
  card.height = CARD_H;
  // Same box rule as the welcome/story cards (CATS-104/116). The 4px border is INSIDE the
  // 1000px (border-box), like the welcome card's.
  card.style.cssText = 'box-sizing:border-box;width:min(1000px,96vw);aspect-ratio:3/2;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,0.5);background:#f4f0d6;border:4px solid #e2d9b8';
  wrap.appendChild(card);
  cardCanvasEl = card;

  // CATS-124 follow-up: the invite line's link. A transparent anchor pinned over the
  // invite text drawn on the canvas (positioned by syncInviteLink after each render).
  // It opens the GAME itself — the deployed page the card is served from — so a shared
  // card forwards the recipient straight into a fresh playthrough.
  const inviteLink = document.createElement('a');
  inviteLink.id = 'postcard-invite-link';
  inviteLink.target = '_blank';
  inviteLink.rel = 'noopener';
  inviteLink.style.cssText = 'position:absolute;display:none;text-decoration:none';
  wrap.appendChild(inviteLink);
  inviteLinkEl = inviteLink;

  labelButtons.length = 0;
  labelLegends.length = 0;
  donateButtons.length = 0;

  // Group "Send a reply": Share link + Download (CATS-116 follow-up renames).
  const bShare = button(t('cardBtnCopy', loc), copyLink, 'cardTipShare', false, loc);
  const bSave = button(t('cardBtnSave', loc), downloadPNG, 'cardTipDownload', false, loc);
  labelButtons.push(
    { el: bShare, key: 'cardBtnCopy', tipKey: 'cardTipShare' },
    { el: bSave, key: 'cardBtnSave', tipKey: 'cardTipDownload' },
  );

  // Group "Donate": one anchor per DONATIONS entry.
  const donateControls = DONATIONS.map((d) => {
    const a = donateButton(d, loc);
    donateButtons.push(a);
    return a;
  });

  // The control row — pinned INSIDE the card, over its bottom edge (CATS-116 follow-up 4) —
  // now splits along the card's own seam (CATS-125 follow-up): "Send a reply" is centered on
  // the LEFT (picture) half; "Donate" + Play again are centered together on the RIGHT
  // (letter) half. The 46% split mirrors LEFT_W, the picture/letter boundary. All controls
  // are 44px tall and bottom-aligned, with the standalone button offset by the fieldsets'
  // bottom chrome (1px border + 10px padding), so every button's BOTTOM — and therefore its
  // CENTER — sits on one shared line. The halves wrap to two lines on narrow windows rather
  // than overflowing the card.
  const row = document.createElement('div');
  row.style.cssText = [
    'position:absolute', 'left:0', 'right:0', 'bottom:14px',
    'display:flex', 'flex-wrap:wrap', 'align-items:flex-end', 'min-height:44px',
  ].join(';');
  const leftHalf = document.createElement('div');
  leftHalf.style.cssText = 'flex:0 0 46%;min-width:260px;display:flex;justify-content:center;padding:0 10px;box-sizing:border-box';
  leftHalf.appendChild(group('cardGroupReply', [bShare, bSave], loc));
  const rightHalf = document.createElement('div');
  rightHalf.style.cssText = 'flex:1 1 auto;min-width:300px;display:flex;gap:12px;justify-content:center;align-items:flex-end;padding:0 10px;box-sizing:border-box';
  // Dark legend on the letter half — the cream scrim behind it needs a dark ink (the light
  // tint only works over the picture half).
  rightHalf.appendChild(group('cardGroupDonate', donateControls, loc, '#1c2740'));

  const bAgain = button(t('cardBtnPlayAgain', loc), playAgain, 'cardTipPlayAgain', true, loc);
  // Match the fieldsets' bottom chrome (1px border + 10px padding-bottom) so this button's
  // bottom line equals the buttons-inside-fieldsets' bottom line → collinear centers.
  bAgain.style.marginBottom = '11px';
  labelButtons.push({ el: bAgain, key: 'cardBtnPlayAgain', tipKey: 'cardTipPlayAgain' });
  rightHalf.appendChild(bAgain);
  row.appendChild(leftHalf);
  row.appendChild(rightHalf);
  wrap.appendChild(row);

  el.appendChild(wrap);
  document.body.appendChild(el);
  overlayEl = el;
  // The card box is responsive (min(1000px,96vw)) — keep the invite anchor on the invite
  // text as the window resizes. One shared listener, alive with the overlay.
  window.addEventListener('resize', syncInviteLink);
}

// A labeled group frame around a set of controls: fieldset + legend (native frame-with-label
// semantics, CATS-116). The legend registers itself for re-localization. Follow-up 3: the
// fieldset's controls sit in one baseline row; each control keeps its own 44px height.
// CATS-125 follow-up: `ink` is the legend (and frame) tint — light over the picture half,
// dark over the letter half's cream scrim.
function group(legendKey, controls, loc, ink = '#dfe6f5') {
  const dark = ink !== '#dfe6f5';
  const fs = document.createElement('fieldset');
  fs.style.cssText = [
    `border:1px solid ${dark ? 'rgba(28,39,64,0.4)' : 'rgba(223,230,245,0.4)'}`,
    'border-radius:12px',
    'padding:8px 14px 10px', 'margin:0', 'min-width:0', 'align-self:center',
    'display:flex', 'flex-direction:column', 'justify-content:center',
  ].join(';');
  const legend = document.createElement('legend');
  legend.textContent = t(legendKey, loc);
  legend.style.cssText = `padding:0 8px;font-size:12px;font-weight:600;color:${ink}`;
  labelLegends.push({ el: legend, key: legendKey });
  fs.appendChild(legend);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center';
  for (const c of controls) row.appendChild(c);
  fs.appendChild(row);
  return fs;
}


// Re-resolve every label + tooltip (and the cached overlay locale) for a new payload locale:
// the plain buttons, the group legends, and the donation anchors (label + tooltip +
// locale-aware href). Cheap; only touches textContent/title/href. Called from showPostcard.
function relabelOverlay(locale) {
  overlayLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  for (const { el, key, tipKey } of labelButtons) {
    el.textContent = t(key, overlayLocale);
    if (tipKey) el.title = t(tipKey, overlayLocale);
  }
  for (const { el, key } of labelLegends) el.textContent = t(key, overlayLocale);
  donateButtons.forEach((a, i) => applyDonation(a, DONATIONS[i], overlayLocale));
}

// The shared visual chrome for every control under the card (buttons + donation anchors).
// CATS-116 follow-up 3: every control gets the SAME height (min-height 44px, box-sizing
// border-box so padding can't differentiate them) so the one row reads as a matched set.
// CATS-125 follow-up: the group buttons are LINEN (#faf0e6) with dark ink; only Play again
// keeps the sagegreen primary fill.
function buttonChrome(el, primary = false) {
  el.style.cssText = [
    'border:none', 'border-radius:10px', 'padding:0 16px', 'font-size:14px', 'cursor:pointer',
    'font-weight:600', 'text-decoration:none', 'display:inline-flex', 'align-items:center',
    'justify-content:center', 'gap:8px', 'box-sizing:border-box', 'min-height:44px',
    primary ? 'background:#4f9466;color:#fff' : 'background:#faf0e6;color:#1c2740',
  ].join(';');
}

function button(label, onClick, tipKey, primary = false, loc = DEFAULT_LOCALE) {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  if (tipKey) b.title = t(tipKey, loc); // relabelOverlay re-localizes on a language switch
  buttonChrome(b, primary);
  b.addEventListener('click', onClick);
  return b;
}

// A donation control is an anchor (it opens the site in a new tab), styled like a button and
// carrying the site's own icon (hotlinked per CATS-116's "use the icon of this site").
function donateButton(donation, loc) {
  const a = document.createElement('a');
  a.target = '_blank';
  a.rel = 'noopener';
  buttonChrome(a);
  applyDonation(a, donation, loc);
  return a;
}

// (Re)build a donation anchor's content for a locale: refresh the href, then the icon +
// label + tooltip. The icon is the big visual identity of the control (CATS-116 follow-up:
// the "with …" org wording left the label for the tooltip, so the icon grew 18→24px). A
// failed icon load hides itself so the label still reads cleanly offline.
function applyDonation(a, donation, loc) {
  a.href = donation.href(loc);
  a.title = t(donation.tipKey, loc);
  a.textContent = '';
  const icon = document.createElement('img');
  icon.src = donation.icon;
  icon.alt = '';
  icon.width = 24;
  icon.height = 24;
  icon.style.cssText = 'width:24px;height:24px;flex:none;border-radius:4px;object-fit:contain';
  icon.addEventListener('error', () => { icon.style.display = 'none'; });
  a.appendChild(icon);
  const label = document.createElement('span');
  label.textContent = t(donation.key, loc);
  a.appendChild(label);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareURLForCopy);
  } catch (_) {
    // Clipboard may be gated without a secure context; fall back to a select-and-prompt.
    const tmp = document.createElement('input');
    tmp.value = shareURLForCopy;
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); } catch (_) {}
    tmp.remove();
  }
  showCopiedHint();
}

// CATS-120 — the centered "link copied to clipboard" hint. It sits at the exact center of
// the screen (position:fixed inset 50%), above the postcard overlay's dim (z-index 51), and
// auto-hides after 1s. A re-click while it is up restarts the window rather than stacking.
function showCopiedHint() {
  if (!copiedHintEl) {
    const hint = document.createElement('div');
    hint.id = 'postcard-copied-hint';
    hint.setAttribute('role', 'status');
    hint.style.cssText = [
      'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
      'z-index:51', 'padding:14px 28px', 'border-radius:12px',
      'background:rgba(28,39,64,0.92)', 'color:#fff', 'font-size:16px',
      'font-weight:600', 'text-align:center', 'pointer-events:none',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
    ].join(';');
    document.body.appendChild(hint);
    copiedHintEl = hint;
  }
  // Re-localize on every show: the locale may have changed since the card was built.
  copiedHintEl.textContent = t('cardCopiedHint', overlayLocale);
  copiedHintEl.style.display = 'block';
  clearTimeout(copiedHintTimer);
  copiedHintTimer = setTimeout(() => { copiedHintEl.style.display = 'none'; }, 1000);
}

function downloadPNG() {
  if (!cardCanvasEl) return;
  let url;
  try {
    url = cardCanvasEl.toDataURL('image/png');
  } catch (_) {
    // Tainted canvas (some browsers taint on SVG drawImage). The link share still works;
    // tell the player to use Copy link instead.
    window.alert(t('cardExportBlocked', overlayLocale));
    return;
  }
  const a = document.createElement('a');
  a.download = 'froggame-postcard.png';
  a.href = url;
  a.click();
}

function playAgain() {
  // "Play again" strips the postcard query off the URL so a fresh playthrough isn't pinned
  // to a shared result, then hides the overlay and lets the game restart path take over.
  hidePostcard();
  const u = new URL(window.location.href);
  ['s', 'f', 'd', 'n', 'fn', 'l'].forEach((k) => u.searchParams.delete(k));
  window.history.replaceState({}, '', u.toString());
  // Signal the game to restart (main.js listens via this custom event).
  window.dispatchEvent(new CustomEvent('froggame:replay'));
}

// ---- public show/hide ----
// Map the invite's canvas-coords rect onto the rendered card and pin the transparent <a>
// over it. Called after every canvas render (showPostcard / setLocale). The card canvas is
// border-box (4px border), so the drawing surface sits 4px in on each CSS side; percentages
// of the border-box keep the anchor on the invite text at any window size.
function syncInviteLink() {
  if (!inviteLinkEl || !inviteRect || !cardCanvasEl) return;
  const bx = cardCanvasEl.getBoundingClientRect();
  const border = 4;
  const innerW = bx.width - 2 * border;
  const innerH = bx.height - 2 * border;
  const left = border + (inviteRect.x / CARD_W) * innerW;
  const top = border + (inviteRect.y / CARD_H) * innerH;
  const width = (inviteRect.w / CARD_W) * innerW;
  const height = (inviteRect.h / CARD_H) * innerH;
  inviteLinkEl.style.left = `${left}px`;
  inviteLinkEl.style.top = `${top}px`;
  inviteLinkEl.style.width = `${width}px`;
  inviteLinkEl.style.height = `${height}px`;
  inviteLinkEl.style.display = 'block';
  inviteLinkEl.href = window.location.origin + window.location.pathname;
}

// Show the postcard for a payload (either a live run's result or a URL-shared card).
// Re-renders the card canvas each time so the latest payload is shown.
export async function showPostcard(payload) {
  currentPayload = payload;
  if (!overlayEl) buildOverlay(payload.locale);
  else if (payload.locale !== overlayLocale) relabelOverlay(payload.locale);
  await preloadPostcardArt();

  const ctx = cardCanvasEl.getContext('2d');
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  drawComposite(ctx, payload);

  shareURLForCopy = encodeShareURL(payload);
  overlayEl.style.display = 'flex';
  // After display:flex — measuring a hidden canvas yields a zero rect, so the invite
  // anchor must be positioned once the card actually has layout.
  syncInviteLink();
}

// setLocale(locale) — re-localize the whole card for a new language, in place. Called by
// main.js's applyLocaleChange fan-out when the locale changes while the card is open (the
// shared controls bar's select — ui/controls.js, CATS-112). Renders the canvas copy +
// signature, relabels the buttons, refreshes the share URL. No-op if the card was never
// shown. Pure relabel — the persist/propagate leg is main.js's, so no callback here.
export function setLocale(locale) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  if (!currentPayload) return;
  // CATS-111: the frog is a fixed localized character, so his name follows the new language;
  // the recipient's carried name is the player's choice and stays.
  currentPayload = { ...currentPayload, locale: loc, frogName: defaultFrogName(loc) };
  relabelOverlay(loc);
  const ctx = cardCanvasEl && cardCanvasEl.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    drawComposite(ctx, currentPayload);
    syncInviteLink();
  }
  shareURLForCopy = encodeShareURL(currentPayload);
}

export function hidePostcard() {
  if (overlayEl) overlayEl.style.display = 'none';
  if (inviteLinkEl) inviteLinkEl.style.display = 'none';
  // CATS-120: never leave the transient hint hanging over the restarted game.
  if (copiedHintEl) copiedHintEl.style.display = 'none';
  clearTimeout(copiedHintTimer);
}

export function isPostcardVisible() {
  return !!(overlayEl && overlayEl.style.display !== 'none');
}

// ---- CATS-129: the END PAUSE — the card no longer rises by itself ----
// A live run's end state ARMS the card instead of showing it: the end overlay keeps the
// stage (the arrival smile beat holds), and the card opens only on the player's own
// click or key press. The gesture list is deliberately narrow about what does NOT open
// it: the shared controls bar (a sound/language adjustment is not a "continue"), R
// (restart keeps its own job), M/+/-/=/_ (volume), and key repeats (a steering key held
// across the finish line is not a new gesture). Listeners sit on window CAPTURE so the
// advancing keystroke never reaches input.js — the same contract the story page uses.
let armedPayload = null; // the payload captured when the run ended; shown on the gesture
let armed = false;

// Keys that keep their own jobs instead of opening the card: R restarts (input.js),
// M and the +/− family step the volume (main.js).
const ARM_SKIP_CODES = new Set(['KeyR', 'KeyM']);

function onArmedPointerdown(e) {
  // A click on the shared controls bar is the bar's, not the card's.
  if (e.target && e.target.closest && e.target.closest('#game-controls')) return;
  e.preventDefault();
  e.stopPropagation();
  openArmedPostcard();
}

function onArmedKeydown(e) {
  if (e.target && e.target.closest && e.target.closest('#game-controls')) return;
  if (e.repeat) return;                        // held-key repeats are not a new gesture
  if (ARM_SKIP_CODES.has(e.code)) return;      // restart / mute keep their own jobs
  if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') return; // volume
  e.preventDefault();
  e.stopPropagation();
  openArmedPostcard();
}

function openArmedPostcard() {
  if (!armed) return;
  disarmPostcard();
  if (isPostcardVisible()) return;             // already up for this result
  const payload = armedPayload;
  armedPayload = null;
  if (payload && payload.outcome) showPostcard(payload).catch(() => {});
}

// armPostcard(payload) — hold a finished run's payload and listen for the player's
// gesture. Called by main.js's end-state transition after the overlay's warm beat.
export function armPostcard(payload) {
  armedPayload = payload;
  armed = true;
  window.addEventListener('pointerdown', onArmedPointerdown, true);
  window.addEventListener('keydown', onArmedKeydown, true);
}

// disarmPostcard() — drop the armed state + listeners (a restart, or the card opened).
export function disarmPostcard() {
  armed = false;
  window.removeEventListener('pointerdown', onArmedPointerdown, true);
  window.removeEventListener('keydown', onArmedKeydown, true);
}

// isPostcardArmed() — screens.js draws the overlay's postcard invite while this is true.
export function isPostcardArmed() {
  return armed;
}
