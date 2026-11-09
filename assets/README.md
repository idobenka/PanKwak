# assets/ — FrogGame artwork

Art home for Concept 4 (Lily-Pad Boat). See [`ART_DIRECTION.md`](../ART_DIRECTION.md) for
the cohesive style + palette proposal (PO sign-off gate) and the open-source sourcing plan.

## Layout

```
assets/
  sprites/        raster sprites (Pip, Fern, fish tiers, flowers, dragonfly, lily pad, decor)
  fonts/          OFL/SIL title font(s)
  audio/          procedural sound recipes (voice specs for the audio engine — no audio files)
  CREDITS.md      REQUIRED — every asset logged with author, source URL, license
```

## How art plugs into the renderer

The graybox renderer (`src/render.js`) draws everything as canvas primitives today.
Swapping sprites for primitives is a local change per draw function (e.g. `drawFlower`,
`drawFish`, `drawBoat`) — the world state and the rest of the structure stay untouched.
Sprites keep their OWN fixed colors: the day→dusk→night palette shift in
`src/systems/timer.js` is applied **only to the water/sky solid fills**, not to sprites.
Every sprite must therefore read well against all three background tints. See
`ART_DIRECTION.md` §"Tint survival" for the contrast rule that enforces this.
