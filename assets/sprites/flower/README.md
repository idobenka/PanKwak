# Flower sprite — Concept 4 (Lily-Pad Boat)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

The bouquet pickup (drifted over by the boat). Flowers are **stable** — they do not
follow or flee; only a gentle bob for life (see `src/entities/flower.js`). Light petals
are required so the bouquet reads against the dark dusk/arrival water (R7 glow rule).

Palette (fixed across all tint stops — sprites keep their own colors):
- petals `#f2d3e0` / `#f6dce7` (blush, light value) · center `#e8b24c` (warm yellow) + `#f4cd6e` accent
- Matches the existing graybox flower (`render.js` `drawFlower`) exactly, so the swap is a
  visual upgrade, not a redesign.

Transparent background, drawn at a 32×32 base (scales to `config.spawn.flowerRadius` ~9
at ~3× so the bloom reads). Faces up.

## Tone self-check (R7/R8/R9)
- **R7:** luminous light petals survive the night-water arrival beat so the bouquet glows.
- **R8:** nothing here — a flower has no predator cues.
- **R9:** the bouquet is a gift Pip gathers; never reads as a trap or loss object.
