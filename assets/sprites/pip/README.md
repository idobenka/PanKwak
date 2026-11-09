# Pip sprite sheet — Concept 4 (Lily-Pad Boat)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (see `../../ART_DIRECTION.md` §1)

Pip is a small frog — small even by frog standards, slightly nervous, doing something brave
for the first time. He is the player's empathy point, so he must read as *gentle and a little
anxious*, never bold or aggressive. Rounded body, big soft eyes, a cream belly (light value
so he stays visible on night water — tint-survival rule).

Palette (fixed across all tint stops):
- body `#bcd65f` (leaf green) · belly `#f4f0d6` (cream) · outline/shadow `#7d9a3a`
- eye white `#ffffff` · pupil `#1c2740` · cheek blush `#f2a9a0` (sparse — warmth, not alarm)

## Poses (each a separate SVG; combined in `pip_sheet.svg`)

| File | Pose | When it plays |
|------|------|---------------|
| `pip_idle.png` | idle — relaxed, slight breath | drifting, no input |
| `pip_steer_lean.png` | leaning into a steer | held left/right steer |
| `pip_clutch_bouquet.png` | protective hug of the bouquet | a fish is close (the candy-guarding gag) |

All on a transparent background, drawn at a 64×64 base (scales to the boat's ~16px radius
at 2x with room for the bouquet). No teeth, no claws, no menace anywhere — R8 by construction.

## Tone self-check (R7/R8/R9)
- **R7:** the arrival beats never drew a frown/defeat pose (the retired arrival poses —
  present-gift / apologetic-grin — were warm by construction; the arrival overlay is drawn
  by `ui/narrative.js` now).
- **R8:** no predator cues on any pose. Pip is the *victim* of goofballs, never armed.
- **R9:** Pip never looks attacked — losses read as gifts wandering off (clutch pose = worry,
  not pain).

> History: the original SVG sources (idle/steer/clutch + the arrival present-gift /
> apologetic-grin poses) were removed — the PNGs are the shipped art, and the arrival poses
> were never drawn (the arrival overlay uses `arrival_smile_empty.svg`).
