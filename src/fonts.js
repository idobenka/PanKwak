// fonts.js — register the OFL Fredoka display face for the canvas UI (titles / overlays / HUD).
//
// Fredoka ships as a variable TTF in assets/fonts/ (OFL 1.1, logged in CREDITS.md). It is the
// ART_DIRECTION shortlist pick for the "flat-soft-rounded" title face, so the overlay titles
// (screens.js), the in-play HUD (hud.js), and the postcard caption (postcard.js) are set in it.
// Canvas fillText only resolves a custom face once it is loaded AND the FontFace has been added
// to document.fonts — so we register it at bootstrap and wait for it before the first frame that
// needs it. A failed load is non-fatal: every font: string stacks 'Fredoka' on top of the
// system-ui fallback, so the UI renders normally without it.

const FREDOKA_URL = 'assets/fonts/Fredoka-Variable.ttf';

// Register Fredoka with the document's font set. Returns a promise that resolves (true|false)
// once the face is either usable or has given up. Safe to call once; idempotent.
let _ready = null;
export function loadFonts() {
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      if ('FontFace' in window) {
        const face = new FontFace('Fredoka', `url(${FREDOKA_URL})`);
        const loaded = await face.load();
        document.fonts.add(loaded);
        return true;
      }
      // Fallback: a CSS @font-face injection also works and wakes document.fonts.
      const style = document.createElement('style');
      style.textContent = `@font-face { font-family: 'Fredoka'; src: url(${FREDOKA_URL}) format('truetype'); }`;
      document.head.appendChild(style);
      await document.fonts.load('600 30px Fredoka').catch(() => {});
      return true;
    } catch (_) {
      return false; // the system-ui fallback in every font: string still renders fine
    }
  })();
  return _ready;
}
