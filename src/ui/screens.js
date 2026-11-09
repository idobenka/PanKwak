// ui/screens.js — the three arrival overlays + the idle title.
//
// These carry the tone guardrails that are MVP CONDITIONS (CATS-22 "Tone guardrails"), not
// decoration. The framing is load-bearing:
//
//   • WON            — present-the-gift: Mr. Kwak arrives and the gathered gift IS the love story.
//   • ARRIVED_EMPTY  — a CHARMING ANTICLIMAX, never a loss screen (Narrative R7). Mr. Kwak's
//                       apologetic grin, Fern's warm welcome anyway. No frown, no fail music,
//                       no restart-style defeat prompt.
//   • LOST (sunset)  — "the party will wait for you — try again." Hopeful, never harsh. The
//                       sunset was never a death-clock (the twist stays feasible at zero cost).
//   • IDLE           — the title; the goal + a "press to start" affordance.
//
// Every non-won overlay offers the same warm "go again" path (R / the postcard's Play again).
// No overlay here ever reads as punishing or scary — that is the R7/R9 contract.
//
// CATS-134: the end overlays show TITLES ONLY — the per-outcome subtitle lines are gone
// (the postcard carries the narrative now). The titles stay dictionary entries so a native
// tone review can update them without touching render code.

import { t } from '../i18n.js';
// CATS-129: the end overlays draw the postcard invite while the card is ARMED (the run
// ended, the warm beat landed, and the card is waiting for the player's click/key).
import { isPostcardArmed } from './postcard.js';

// Draws the active overlay onto the main ctx (only when status !== 'playing').
export function drawOverlay(ctx, cfg, world) {
  // CATS-68: screen-space overlay (drawn after the camera restore) → use viewport dimensions.
  // (world.width/height happen to equal the viewport today, but the viewport is the correct
  // semantic source now that the world runs to shoreX=4260.)
  const width = cfg.camera.viewportWidth;
  const height = cfg.camera.viewportHeight;
  const loc = cfg.locale;

  // Idle uses a lighter wash (we want the lake visible behind the title); end states use a
  // dusk veil. All veils are soft — never a harsh black "game over" slab.
  const veil = world.status === 'idle' ? 'rgba(8,12,24,0.30)' : 'rgba(10,16,32,0.58)';
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let title = '';
  let accent = '#ffffff';

  if (world.status === 'won') {
    // Present-the-gift: the haul you protected across the lake.
    title = t('overlayWonTitle', loc);
    accent = '#ffe9a8';
  } else if (world.status === 'arrived_empty') {
    // R7 — warm anticlimax, NOT a loss screen. No frown / fail music / defeat prompt.
    title = t('overlayArrivedEmptyTitle', loc);
    accent = '#f3c98f';
  } else if (world.status === 'lost') {
    // Soft sunset fail — hopeful, never harsh.
    title = t('overlayLostTitle', loc);
    accent = '#cfe0ff';
  }
  // 'idle' draws NO center text (CATS-129 follow-up 2): the instruction hint box owns the
  // goal/controls teaching now, so the old "FrogGame / {goal}" pair behind it was a duplicate.

  if (world.status !== 'idle') {
    ctx.fillStyle = accent;
    // Fredoka is the title face (OFL, loaded at bootstrap by fonts.js); system-ui is the fallback
    // while it loads or if it failed.
    ctx.font = "600 30px 'Fredoka', system-ui, sans-serif";
    ctx.fillText(title, width / 2, height / 2 - 28);

    // CATS-129: once the postcard is ARMED, the overlay's affordance line becomes the
    // postcard invite (the card opens on this click/keypress; R still restarts). The
    // invite sits in the accent ink so it reads as the next step. CATS-141: 22px at
    // height−96 (was 15px at height−56) — clearly visible, yet still below the central
    // arrival illustration band (ui/narrative.js draws it down to ≈ height−190) and
    // clear of the restart hint at height−34.
    if (isPostcardArmed()) {
      ctx.fillStyle = accent;
      ctx.font = "600 22px 'Fredoka', system-ui, sans-serif";
      ctx.fillText(t('overlayPostcardInvite', loc), width / 2, height - 96);
    }
    ctx.fillStyle = '#8aa0c8';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(t('overlayRestart', loc), width / 2, height - 34);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
