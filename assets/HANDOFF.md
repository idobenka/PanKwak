# Handoff — art assets to Software Engineer / UI Developer

Art is delivered as **SVG** (flat-soft-rounded vector, matching the signed-off
`ART_DIRECTION.md`). SVG is the source of truth: it scales cleanly to any resolution and
stays editable. Swap-in is a local change to the existing `drawX` functions — no structural
or game-logic changes required.

## The swap points (in `src/render.js`)

Each graybox primitive maps to a sprite:

| Graybox function | Sprite(s) |
|------------------|-----------|
| `drawBoat` → Pip dot | `assets/sprites/pip/pip_*.png` (idle default; steer-lean while steering; clutch when a fish is near) |
| `drawFish` | `assets/sprites/fish/fish_tier{0,1,2}_*.png` keyed by `fishy.tier` |
| `drawFlower` | `assets/sprites/flower/flower.png` |
| `drawDragonfly` | `assets/sprites/dragonfly/dragonfly.png` |
| far-shore party | `assets/sprites/arrival/arrival_smile_empty.svg` (the empty-handed arrival overlay illustration) |

The boat's lily pad stays as the existing canvas ellipse (it matches the palette exactly);
Pip sits on top of it.

## How to draw an SVG sprite on the canvas

No build step is needed — load SVGs as images at startup and `drawImage` them. Minimal pattern:

```js
// preload once
const PIP_SPRITES = {
  idle: await loadImg('assets/sprites/pip/pip_idle.png'),
  steer: await loadImg('assets/sprites/pip/pip_steer_lean.png'),
  clutch: await loadImg('assets/sprites/pip/pip_clutch_bouquet.png'),
  // ...
};
function loadImg(src){ const i = new Image(); i.src = src; return i.decode(); }

// in drawBoat, replace the dot block:
const img = invuln ? PIP_SPRITES.idle : poseFor(boat); // pick pose from state
ctx.drawImage(img, boat.state.x - 16, boat.state.y - 16, 32, 32);
```

Mirror `pip_steer_lean.png` horizontally for left vs right leans (`ctx.scale(-1,1)`).

## Sizing

Sprite base sizes match the graybox radii at ~2x so the swap is 1:1 in footprint:
- Pip: 64×64 → draw at ~`boat.radius*2` (≈32px). Center on the pad.
- Fish tiers: 56/88/136px wide → scale to `fishRadiusPerTier[tier]*2` diameter. They already
  face **left** (toward the boat), matching the graybox `drawFish` orientation — no flip.
- Arrival beat: a full-scene illustration (320×200), shown only in the arrival overlay, not
  in-play. Hand to `ui/screens.js`, not `render.js`.

## Tone guardrails already enforced in the art (do not regress)

- **R8:** fish have no teeth, no lunge, no narrowed eyes; the big tier is the *lightest-bellied
  and dopiest-eyed*. If you animate fish, keep drift/wobble only — never add a lunge/attack path.
- **R7:** the arrival-empty overlay MUST use `arrival_smile_empty.svg` (Pip's apologetic grin +
  Fern touched). Never substitute a frown/defeat image for empty-handed.
- **R9:** keep the medium fish's burp-petal and small fish's guilt-blush readable if you touch
  the fish sprites — they sell "the gift wandered off," not an attack.

## What's NOT in this handoff (open question for PO)

The water/sky/lily/flora/dragonfly open-source tier (A.2) is **not** committed yet — only the
OFL font and the bespoke sprites are. Backgrounds and ambient flora still use graybox
primitives until the real CC0 drops land (see the PO's reopen note on sequencing).

## Postcard (CATS-32 → CATS-31, UI Developer)

The shareable end-state postcard lives in `assets/sprites/postcard/`. It is **not** drawn by
`render.js` — it composes on the postcard screen owned by UI Developer (CATS-31).

- **Scenes:** `postcard_win.png` / `postcard_empty.png` / `postcard_lost.png` — one
  cover-fits the whole card window per end status (CATS-125). (The old `postcard_frame.svg`
  shell and the vector scenes were removed in the CATS-137 cleanup.)
- **Composition:** painted card base → full-window per-state PNG → translucent text scrim →
  opaque postmark (`postmark.placeholder.png`). Copy lives in `src/i18n.js`, drawn by
  `src/ui/postcard.js`.
- **Static-host constraint:** all art files are static assets; the card renders client-side
  from a URL encoding `?s=<won|empty|lost>&f=<flowers>&d=<dragonflies>`. The only run-specific
  datum on the card is the gift count in the caption (text) — the art carries none.
- **Tone:** R7 is built into the empty scene (warm anticlimax, never loss); lost is hopeful
  (Pip still moving, party lit, Fern waiting). No R8/R9 regression. Full recipe + self-check
  table in `assets/sprites/postcard/README.md`.

## Self-checks done

Each sprite's directory README documents its R7/R8/R9 self-check. Final aesthetic sign-off
is the PO's at review. (The original SVG contact-sheet sources were removed in the CATS-137
unused-asset cleanup — the PNGs are the shipped art.)
