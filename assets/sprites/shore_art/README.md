# Shore scene art — start (home) + finish (party) placeholders (CATS-105)

**Author:** FrogGame / UI Developer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

Two PLACEHOLDER scene stamps that land on the grass/land bands at the two ends of the
crossing, so the start reads "Pip's home" and the finish reads "the pool party" before
any bespoke art pass replaces them.

| File | What | Size | Anchored (world space) |
|------|------|------|------------------------|
| `home_shore.png` | frog home — round lily-pad-roof cottage with a warm window, stepping stones to the water, berry bushes + soft mushrooms | 360×520 | right edge at `world.homeX` (x=60), full ground band (world y 80..600) |
| `finish_shore.png` | the party — many happy frogs (Fern waiting up front), paper lanterns on two strings, bunting, flower garden | 640×520 | left edge at `world.shoreX` (x=4260), full ground band |

> History: the original SVG sources (`home_shore.svg` / `finish_shore.svg`) and a stray
> `_.png` were removed — the PNGs are the shipped art the renderer stamps.

## Placement recipe (wired in `src/render.js` `drawShoreArt`)

- Both stamps are drawn once per frame in **world space** (inside the camera transform),
  over the grass field / festive tile, **under the water fill** — the lake hole keeps its
  crisp edge and the art sits ON the bank, never on the water.
- Home stamp spans world x ∈ [homeX − 360, homeX]; the visible grass left of the left cap
  at push-off is exactly that band (camera minLeft −240 → shows down to x −240; the stamp
  covers −300..60 so the visible left band is filled edge-to-edge).
- Finish stamp spans world x ∈ [shoreX, shoreX + 640]; the CATS-98 finish push reveals up
  to (1 − 0.30)·900 + margin ≈ 630 px past the win line, so the party fills the arriving
  frame's right side edge-to-edge.
- Missing/failed SVG loads degrade to nothing (the grass tile remains) — art never breaks
  the loop, same rule as every other sprite.

## Tone self-check (R7 / R8 / R9)

- **R7 (never punishing):** warm window glow, amber lanterns, blush flowers — all warm
  twinkle, no reds, no harsh contrast, no warning reads.
- **R8 (no menace):** every frog is a rounded blob with eye bumps + a closed happy smile;
  no teeth, no claws, no narrowed eyes. Mushrooms are soft-dotted toadstools, Cottage-core.
- **R9:** losses aren't depicted here at all; the party is pure celebration.
- **Cohesion:** same palette family as the shipped sprites (Pip `#bcd65f`, Fern `#8fc7a0`,
  shore greens `#3a7d4f`/`#4f9763`/`#5fa97a`, flower blush `#f2d3e0`, amber `#e8b24c`).

## Tint survival

Fixed colors, like every sprite. The stamps sit on the fixed-tint grass tiles against the
pale dawn sky and the deep dusk sky — mid/light values (cream, blush, gold, leaf greens)
read on both extremes, per the lake README §4 analysis that the shore tiles already pass.

## Handoff note

These are **placeholders by design** (issue CATS-105 says so). The Asset Designer can
replace either SVG 1:1 — keep the same viewBox + anchor contract above and no code needs
to change.
