// main.js — entry: bootstrap, wire input, start the loop.

import { CONFIG } from './config.js';
import { createGame } from './game.js';
import { createInput } from './input.js';
import { render } from './render.js';
import {
  preloadPostcardArt, showPostcard, hidePostcard,
  payloadFromWorld, payloadFromURL, outcomeFromStatus, setLocale as setPostcardLocale,
  armPostcard, disarmPostcard,
} from './ui/postcard.js';
import { showWelcome, hideWelcome, isWelcomeVisible, relabelWelcome } from './ui/welcome.js';
import { showStoryPage, isStoryPageVisible, relabelStoryPage } from './ui/storypage.js';
// CATS-129: the instruction hint box — the START PAUSE between the welcome card's Start
// and the run. The box owns the idle→playing flip; main.js suppresses the auto-start
// while it is up (same canStart contract as the story page / welcome card).
import { showHintBox, isHintBoxVisible, relabelHintBox } from './ui/hintbox.js';
import { mountControls, setControlsLocale, repaintControls } from './ui/controls.js';
import { detectLocale, resolveText, setLocale } from './i18n.js';
// CATS-111 name identity: the frog is a fixed localized character; the recipient default too.
import { defaultFrogName, defaultFernName } from './config.js';
import { preloadTextures } from './assets.js';
import { loadFonts } from './fonts.js';

// Resolve locale ONCE at bootstrap (CATS-54). Renderers read cfg.text.* exactly as they read
// the old hardcoded strings, so this is the only place the locale decision is made.
const LOCALE = detectLocale();
CONFIG.locale = LOCALE;
CONFIG.text = resolveText(LOCALE);

// Thread the locale into the few CONFIG fields that are pure data the engine reads directly
// (per-stretch labels in game.js). Overriding here means game.js keeps reading the same field
// names it always did. The onboarding hints moved to the i18n-driven hint box (CATS-129).
CONFIG.stretch.labels = [
  CONFIG.text.stretchGentleShore,
  CONFIG.text.stretchDragonflyBend,
  CONFIG.text.stretchMiddle,
  CONFIG.text.stretchFarReaches,
];

// Reflect the locale on the document: <html lang>, <title>, and the static bottom hint.
document.documentElement.lang = LOCALE;
document.title = CONFIG.text.docTitle;
const hintEl = document.getElementById('hint');
if (hintEl) hintEl.textContent = CONFIG.text.hint;

// CATS-112: the shared sound + language controls bar (ui/controls.js) replaces the old
// page-level #lang-wrap picker AND every in-card variant. One bar, top-right of the game
// box, on every page. applyLocaleChange is the single no-reload propagation path it fires.
function applyLocaleChange(nextLocale) {
  const prevLocale = CONFIG.locale;
  setLocale(nextLocale);
  CONFIG.locale = nextLocale;
  CONFIG.text = resolveText(nextLocale);
  CONFIG.stretch.labels = [
    CONFIG.text.stretchGentleShore,
    CONFIG.text.stretchDragonflyBend,
    CONFIG.text.stretchMiddle,
    CONFIG.text.stretchFarReaches,
  ];
  document.documentElement.lang = nextLocale;
  document.title = CONFIG.text.docTitle;
  setControlsLocale(nextLocale);
  if (hintEl) hintEl.textContent = CONFIG.text.hint;
  // CATS-112: the shared bar floats above every overlay, so a language pick must fan out
  // to whichever page is open — each overlay re-localizes itself (no reload).
  relabelStoryPage(nextLocale);
  relabelWelcome(nextLocale);
  relabelHintBox(nextLocale);
  setPostcardLocale(nextLocale);
  // world.stretchLabel is cached on the world (set at reset + stretch entry) so the HUD
  // reads a plain string; re-resolve it for the new language so the chip doesn't stay in
  // the old one mid-run.
  game.world.stretchLabel = CONFIG.stretch.labels[Math.min(
    game.world.stretchIndex, CONFIG.stretch.labels.length - 1)];
  // CATS-111: the frog is a fixed localized character (Mr. Kwak / Пан Квак), so his name on
  // the world always follows the language. The recipient's name is the player's choice;
  // only a still-untouched canonical default follows the switch.
  game.world.frogName = defaultFrogName(nextLocale);
  if (game.world.fernName === defaultFernName(prevLocale)) {
    game.world.fernName = defaultFernName(nextLocale);
  }
  game.world.frogNames = { frogName: game.world.frogName, fernName: game.world.fernName };
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = createGame();
const input = createInput();
input.attach(window);
input.bindCanvas(canvas);

// --- CATS-94: audio autoplay unlock (architecture §6) ---
// Browsers block audio until a user gesture. The engine's AudioContext is created
// lazily and starts suspended; unlock() retries resume() on EVERY gesture until the
// context is actually running (CATS-111 follow-up #2: a single early resume could resolve
// without the context starting, and with the listeners self-removed the parked intro bed
// only began after a mute off/on cycle). The welcome-card Start is the natural gesture;
// the pointerdown/keydown fallback covers a load that skips the card (a shared postcard
// link played again). unlock() no-ops once running and entirely when Web Audio is absent —
// audio is additive.
const unlockAudio = () => {
  game.world.audio.unlock();
};
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

// --- CATS-94: mute toggle (in-memory per-session; architecture §5) ---
// No save data — the state resets to unmuted on every fresh load by design. The M key
// remains the keyboard alias; the visible toggle is the shared controls bar's speaker
// button (ui/controls.js — CATS-112; the on-canvas icon it replaced is gone).
const toggleMute = () => {
  game.world.audio.setMuted(!game.world.audio.isMuted());
  repaintControls();
};

// --- CATS-102: volume keyboard aliases. The drag control is the shared bar's hover ---
// slider (ui/controls.js). +/− (and unshifted = / _) step the in-memory volume 0..1.
const VOLUME_STEP = 0.1;
const stepVolume = (dir) => {
  const audio = game.world.audio;
  audio.setVolume(Math.round((audio.getVolume() + dir * VOLUME_STEP) * 10) / 10);
  repaintControls();
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.key === '+' || e.key === '=') stepVolume(+1);
  else if (e.key === '-' || e.key === '_') stepVolume(-1);
});

// --- CATS-112: mount the shared sound + language controls bar ------------------
// One bar pinned top-right of the game box, present on every page (intro story, welcome
// card, in-game, postcard). It drives the run's own audio object and fires
// applyLocaleChange for language picks.
mountControls(document.getElementById('gamebox'), LOCALE, () => game.world.audio, applyLocaleChange);

// Expose for in-console tuning.
window.FROGGAME = { game, input, CONFIG };

// --- postcard plumbing (CATS-31) ---
// The shareable postcard is ADDITIVE: it shows after a run ends, on top of (not replacing)
// the existing end overlay. Two entry points:
//   1) URL-shared card — the link alone re-renders the card on a fresh load (PO criterion 2).
//   2) Live run — CATS-129: the card no longer rises by itself. When the run reaches an end
//      status, the overlay's warm beat lands and then the card is ARMED: the end overlay
//      keeps the stage (with a "click for your postcard" invite), and the player's own
//      click or key press opens the card ("pause the game once finished and transition
//      only after a click or any button").
let lastStatus = game.world.status;   // detect end-state transitions
let postcardPending = false;          // a delayed arm is in flight
const WARM_BEAT_MS = 1300;            // let the overlay's title + scene land before the card is armed

// Preload art up front so the first show is instant.
preloadPostcardArt().catch(() => {});

// CATS-74: preload the landscape-bottom shore strip so the blended bank appears on the first
// painted frame (render() no-ops the overlay until the SVG has decoded).
// CATS-68 follow-up: preload the grass + festive shore tiles so the textured banks (now all
// four sides of the narrower lake) paint on frame one.
// CATS-76: preload the entity + frog (Mr. Kwak) sprites so the first painted frame already has the art.
// CATS-81: also preload the neutral water surface texture (CATS-69 overlay) + the arrival-smile
// beat illustration (drawn over the won/empty overlay in ui/narrative.js). CATS-129 follow-up:
// the won beat is text-only now, so only the empty-handed variant illustration is preloaded.
// CATS-79: the timer sun asset (sky.js stamps it + repaints the disc; until decoded the
// parametric recipe draws it, but preload so frame one is the asset).
preloadTextures([
  'assets/sprites/sky/sun.svg',
  'assets/sprites/lake/shore_strip.png',
  'assets/sprites/lake/shore_grass.png',
  'assets/sprites/lake/shore_grass_festive.png',
  'assets/sprites/lake/water_surface.png',
  // CATS-123: the grass-bank decoration objects (lake/grass + lake/start + lake/finish
  // pools), so the scattered objects appear on the first painted frame.
  ...Object.values(CONFIG.decor).flatMap(
    (pool) => (Array.isArray(pool && pool.sprites) ? pool.sprites : []),
  ),
  // CATS-105: start/finish scene stamps (home + garden / party + lanterns + flowers).
  'assets/sprites/shore_art/home_shore.png',
  'assets/sprites/shore_art/finish_shore.png',
  'assets/sprites/flower/flower.png',
  'assets/sprites/dragonfly/dragonfly.png',
  'assets/sprites/fish/fish_tier0_small.png',
  'assets/sprites/fish/fish_tier1_medium.png',
  'assets/sprites/fish/fish_tier2_big.png',
  'assets/sprites/pip/pip_idle.png',
  'assets/sprites/pip/pip_steer_lean.png',
  'assets/sprites/pip/pip_clutch_bouquet.png',
  'assets/sprites/arrival/arrival_smile_empty.svg',
  // CATS-114: the wooden board behind the in-play narrative feed lines.
  'assets/sprites/hud/narrative_board.placeholder.svg',
  // CATS-110: the per-locale intro story art (the story page is full-bleed art now).
  // Both files so the page's language switch swaps paintings instantly.
  'assets/sprites/story/intro_story_ua.png',
  'assets/sprites/story/intro_story_en.png',
  // CATS-111 final pass: the letter page's old-paper texture (the welcome card's right column).
  'assets/sprites/welcome/welcome_paper.placeholder.png',
]);

// Load the OFL Fredoka display face so the canvas titles / HUD / postcard caption render in the
// title typeface (CATS-81). Non-fatal: every font: string stacks Fredoka on system-ui, so the UI
// is fine without it; the next frame picks the face up once it lands.
loadFonts().catch(() => {});

// Entry point 1: a shared URL. Read on load — if present, show the card and hold the game on
// the matching end overlay behind it (no auto-start). "Play again" clears the params.
let sharedCardOpen = false;
{
  const shared = payloadFromURL();
  if (shared && shared.outcome) {
    sharedCardOpen = true;
    const sharedStatus = shared.outcome === 'lose' ? 'lost' : shared.outcome;
    game.world.status = sharedStatus;
    lastStatus = sharedStatus;
    // CATS-57: a shared link lands directly on the end overlay — begin the arrival scene clock
    // too, so the staged beat plays on a freshly opened postcard link, not just on a live
    // arrival. CATS-134: the beat carries no text anymore, so only the outcome is passed.
    if (sharedStatus === 'won' || sharedStatus === 'arrived_empty') {
      game.world.narrative.beginArrival(sharedStatus);
    }
    // CATS-117: the freshly opened postcard link sounds on the FIRST interaction. The page
    // loads with no gesture, so nothing may sound yet (autoplay policy — the unlock listeners
    // above own that moment). Park both intents instead: the ambient bed (the card rides on
    // the same lake as every other page) and the arrival voice matching the shared outcome —
    // the receiver hears the run's beat the moment they first touch the card. Both flush
    // through the same parked-intent path the story page's music already uses, so they fire
    // together on that first gesture, exactly once, never before it.
    game.world.audio.startBed();
    game.world.audio.playOnUnlock(sharedStatus === 'won' ? 'win' : sharedStatus === 'arrived_empty' ? 'arrived_empty' : 'soft_fail');
    showPostcard(shared).catch(() => {});
  }
}

// Entry point (story page + welcome card): the first screens for a fresh playthrough.
// CATS-104: the story page opens FIRST — the elevator pitch from docs/idea.md, any click or key
// press turns the page to the welcome card (CATS-80). Only when there is NO shared postcard
// URL — a shared link lands straight on the end card, not here. Neither screen is re-shown
// on replay (Play again / R): returning players skip straight back into
// the run via the existing idle title's start path.
if (!sharedCardOpen) {
  const openWelcome = () => {
    showWelcome(
      // CONFIG.locale, not the bootstrap LOCALE — the shared controls bar's language
      // select (CATS-112) can have changed it since load; the welcome card must open in
      // the language the player is already reading.
      CONFIG.locale,
      (frogName, fernName) => {
        game.setNames(frogName, fernName);
        hideWelcome();
        // CATS-94: the Start press is the autoplay unlock gesture AND the bed's start —
        // the first thing the player hears is the lake, after they chose to play. No
        // sound during idle (CATS-91 §5). Idempotent: the bed has been running since the
        // intro page (CATS-112) — these calls just guarantee it on the replay paths.
        game.world.audio.unlock();
        game.world.audio.startBed();
        // CATS-129: Start does NOT begin the run. The game pauses here behind the
        // instruction hint box; the run flips to 'playing' only on the box's own advance
        // gesture (a click or any key — see ui/hintbox.js).
        showHintBox(CONFIG.locale, () => {
          game.world.status = 'playing';
          lastStatus = game.world.status;
        });
      },
    );
  };
  showStoryPage(
    LOCALE,
    // Any click or key press turns the page to the name-entry card. The story page's own
    // keydown handler captures at the window level and stops the event, so the advancing
    // keystroke never reaches input.js (no phantom steering/restart).
    openWelcome,
    // CATS-112 follow-up: the page-turn gesture is the first gesture and stopPropagation
    // shields it from the window-level unlock listeners — the page fires the bed start
    // itself so the music begins with the page-turn, not the gesture after it.
    () => game.world.audio,
  );
  // CATS-112: the music begins with the intro page. startBed() parks its intent while the
  // context is still suspended (autoplay policy); the unlock listeners above flush it on
  // the player's very first gesture anywhere — a click, a key, even the page-turn itself.
  // Only on the fresh-playthrough path: a shared postcard link opens on the end card,
  // where the game holds for a replay instead.
  game.world.audio.unlock();
  game.world.audio.startBed();
}

// Entry point 2: the live run. When status flips into an end state, queue the card after the
// warm beat. Guarded so a restart inside the window cancels the show.
window.addEventListener('froggame:replay', () => {
  postcardPending = false;
  // CATS-129: a Play-again (or R, whose key the armed listeners skip) drops any armed
  // card too — the fresh run must not have a ghost listener waiting to open the old result.
  disarmPostcard();
  hidePostcard();
  // Route Play again through the same reset path as R (CATS-59): reset() clears
  // the end status, gifts, timer, and boat back to home. lastStatus is re-synced so the loop's
  // end-state transition detector doesn't read the restart as a re-entry into the same beat.
  game.reset();
  lastStatus = game.world.status;
  // CATS-94: reset() faded the bed out; bring it back for the new run (audio is already
  // unlocked — the replay gesture happened inside the run).
  game.world.audio.startBed();
});

function loop(ts) {
  // While the story page or the welcome card owns the screen (CATS-104 / CATS-80), suppress
  // the idle→playing auto-start so a stray keystroke can't begin the run before the player
  // has pressed Start. CATS-129: the instruction hint box holds the same gate — the run
  // starts on the box's advance gesture, not on a stray input.
  game.frame(ts, input, { canStart: !isWelcomeVisible() && !isStoryPageVisible() && !isHintBoxVisible() });

  // CATS-94: the bed tracks the sunset so it can warm at dusk (BED_WARMER). Fed every
  // frame from the timer's daylight-left progress; a pure audio-side mix-in.
  game.world.audio.setBedProgress(game.world.timer.progress());

  // Detect transition INTO an end state → queue the postcard (after the overlay's warm beat).
  // On restart (status leaves an end state for a non-end one), hide any card + cancel pending.
  if (game.world.status !== lastStatus) {
    const prev = lastStatus;
    lastStatus = game.world.status;
    const end = outcomeFromStatus(game.world.status);

    // CATS-94: the three arrival voices share this single transition detector (architecture
    // §4) — the status flips once, so each fires exactly once per arrival. Routed on the
    // same end-state mapping the postcard uses; never inside drawOverlay (that draws every
    // frame and would re-fire 60×/s).
    if (game.world.status === 'won') game.world.audio.play('win');
    else if (game.world.status === 'arrived_empty') game.world.audio.play('arrived_empty');
    else if (game.world.status === 'lost') game.world.audio.play('soft_fail');

    if (end && !postcardPending) {
      // Coming from a non-end state (idle/playing) → this is a real run ending. (A direct
      // idle→end jump only happens for a shared URL, which is handled on load above.)
      postcardPending = true;
      // CONFIG.locale, NOT the bootstrap LOCALE: a language change on the welcome card updates
      // CONFIG.locale live (no reload), and the postcard must render in the language the run
      // actually played in (CATS-99). LOCALE here would pin the card to the page-load language.
      const payload = payloadFromWorld(game.world, CONFIG.locale);
      setTimeout(() => {
        postcardPending = false;
        if (outcomeFromStatus(game.world.status) === end) { // still on this beat?
          // CATS-129: ARM the card after the warm beat — the overlay holds the stage with a
          // postcard invite, and the player's click/key press (ui/postcard.js's armed
          // listeners) opens the card. No auto-rise.
          armPostcard(payload);
        }
      }, WARM_BEAT_MS);
    } else if (!end && prev && outcomeFromStatus(prev)) {
      // Left an end state (restart) → clear any pending arm + drop the card.
      postcardPending = false;
      disarmPostcard();
      hidePostcard();
    }
  }

  render(ctx, CONFIG, game.world);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
