# Dragonfly sprite — Concept 4 (Lily-Pad Boat)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

The jar pickup (proximity-collected by steering near it). Dragonflies **flee** the frog
with random "salt" so they read as alive and slightly evasive (see
`src/entities/dragonfly.js`). Mint pops on both day teal and night navy (ART_DIRECTION §2
tint-survival rule).

Palette (fixed across all tint stops):
- body `#9be3c4` (mint) · tail `#7fd6b4` · wings `#bff7dd` / `#d6fbe9` (translucent shimmer)
- Matches the existing graybox dragonfly (`render.js` `drawDragonfly`) hue, so the swap is a
  visual upgrade, not a redesign.

Transparent background, drawn at a 32×32 base (scales to
`config.spawn.dragonflyRadius` ~7 at ~4× so the wings read). Faces **left** (toward the
boat), matching the graybox `drawDragonfly` orientation — no flip needed.

## Tone self-check (R7/R8/R9)
- **R7:** the dragonfly is the arrival-beat guest (loops and settles on the bloom) — mint
  keeps it luminous at the dusk arrival.
- **R8:** no predator cues (no stinger, no narrowed eyes); a single soft eye dot reads as
  a critter, never a threat.
- **R9:** a fleeing dragonfly sells "the gift wandered off," never an attack.
