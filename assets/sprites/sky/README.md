# Sky-landscape timer assets — sun + clouds (CATS-47 / CATS-51)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

These are the **visuals** for the sky-landscape timer that replaces the flat sunset bar:
a cute soft sun that arcs left→right as time drains, plus semi-transparent clouds that
drift across the sky. The whole scene tints dawn pastels → bright noon → golden sunset →
warm dusk along with the sun (Technical Architect's `palette` config, CATS-49; Game
Designer's feel spec, CATS-50). The Software Engineer (CATS-52) wires them into `render.js`
/ `hud.js`; this folder is **art only** — no renderer logic.

## Files

| File | What | Notes |
|------|------|-------|
| `sun.svg` | the sun — the stamped asset (CATS-79) | disc authored at **noon** tint (`#fff4c2`); sky.js stamps it and repaints the disc via `pal.sun` across the cycle (+ the CATS-79 horizon hue at the arc's ends) |

(The retired `cloud_small.svg` / `cloud_large.svg` were removed — clouds are drawn from the
parametric recipe in `src/systems/sky.js` and never stamped the SVGs.)

The sun is a transparent-background SVG, drawn as flat fills with rounded silhouettes
(no sharp points, no soft shading, one warm-light accent) — they belong to the same
picture-book world as Pip, Fern, and the fish.

---

## Recommended approach (updated for CATS-79): stamp `sun.svg`, repaint the disc in place

Because the **sun disc color changes with the day cycle** (`pal.sun`: dawn `#ffe1b0` →
noon `#fff4c2` → sunset `#ffd27a` → dusk `#e07a3a`), a fixed-color SVG would composite
wrong at dawn/dusk. CATS-79 makes the sun a real **asset**: the SE stamps `sun.svg`
(halo + disc + core at the authored ratios) and **repaints the disc circle in place**
each frame with `pal.sun` — the halo and core tints stay FIXED in the SVG, so only the
disc layer is retinted and the draw stays pixel-identical to the recipe. The recipe
below remains the exact geometric definition (and the fallback if the SVG hasn't
decoded). Clouds are fixed-tint recipe draws (their SVGs were removed — never used).

### CATS-79 — horizon hue boost ("more hue" at the start/finish)

At the START and FINISH of a run the sun sits ON the horizon, partially hidden behind
the treeline of `assets/sprites/lake/shore_strip.svg` (drawn OVER the sky band — see
lake README §3). While the disc is behind/near the treeline (arcFrac within
`horizonGlow.window` of 0 or 1), the SE blends the disc fill toward the saturated
`horizonGlow.tint` (`#ffb347` warm gold) by up to `horizonGlow.strength` (0.55), peaking
at the horizon itself. It sells "sunrise/sunset glow" exactly when the sun kisses the
treeline, then washes back to the normal day-cycle palette as the sun climbs. The
config knobs live under `skyLandscape.sun.horizonGlow` (see below).

No new dependencies, no build step. Pure canvas 2D (arcs, ellipses, `globalAlpha`).

## Sun recipe (canvas 2D)

All sizes are multiples of `cfg.skyLandscape.sun.radius` (`r`); the SE scales the band to
`cfg.skyLandscape.height`. Draw order is **bottom → top: halo, then disc, then core**.

```
// halo — stacked concentric FLAT arcs (NOT a radial gradient; stays flat-fill).
// low alpha so it reads as aura, not a body. Tint stays FIXED across the cycle.
for each (mul, a) in [(2.6, 0.4), (2.0, 0.6), (1.5, 0.85)] scaled by glow.alpha:
    arc radius = r * mul,  fill = glow.tint,  globalAlpha = glow.alpha * a

// disc — the sun body. THIS is the data-driven day-cycle color.
arc radius = r,  fill = pal.sun,  globalAlpha = 1.0

// core — bright warm-white, drawn last on top. Sells "sun" on a pale dawn sky.
arc radius = r * core.radiusMul,  fill = core.tint,  globalAlpha = 1.0
```

**No sun rays.** Rays on a ~9px disc read as glaring/intense, which fights the never-
punishing tone (R7). The warm core already sells "golden hour." This is a deliberate tone
call, reaffirmed by the Game Designer's feel spec and the Product Owner.

Config knobs (slot into the Technical Architect's `skyLandscape.sun` block):

```js
sun: {
  radius: 9,
  arcLift: 0.78,
  glow: { radiusMul: 2.6, alpha: 0.28, tint: '#fff6e0' }, // FIXED tint across the cycle
  core: { radiusMul: 0.55, tint: '#fffdf2' },             // FIXED tint (the warm-white body)
  // CATS-79: the stamped sun.svg asset (halo+disc+core at the authored ratios; the SE
  // repaints the disc circle in place with the day-cycle fill). Null until decoded →
  // recipe fallback.
  sprite: 'assets/sprites/sky/sun.svg',
  // disc fill = pal.sun — data-driven, NOT a fixed config color
  // CATS-79 horizon hue: blend the disc toward this saturated warm gold while the sun
  // sits on/near either horizon (behind the shore-strip treeline). window = fraction of
  // the arc from each end over which the blend fades out; strength = peak blend.
  horizonGlow: { tint: '#ffb347', window: 0.2, strength: 0.55 },
},
```

## Cloud recipe (canvas 2D)

Each cloud = `puffsPerCloud` overlapping rounded ellipses along a gentle crest (center puff
highest — the cumulus shape). One flat fill per cloud at `clouds.alpha`; **no per-puff
light/shadow** (the flat-fill non-negotiable). The topmost puff gets the lighter `liftTint`
(the single warm-light-bias accent, expressed as a lighter tint, never a shaded side).

```
// per cloud, sitting in the UPPER ~70% of the band (never kiss the waterline):
radius  = bandHeight * puff.radiusMul          // 0.42
radiusY = radius * puff.squash                 // 0.62 -> flattened puff
spacing = radius * 2 * (1 - puff.overlap)      // 0.55 -> puffs overlap
// place puffs along a shallow crest: y dips toward the center (highest point)
// fill base `tint` at globalAlpha = clouds.alpha; topmost puff redrawn in `liftTint`
```

Config knobs (slot into `skyLandscape.clouds`):

```js
clouds: {
  count: 3,           // feel spec: 3 — enough to read "a sky," not a weather widget
  alpha: 0.55,        // semi-transparent; sun + sky read through (user's explicit ask)
  driftSpeed: 8,      // px/s, slow + AMBIENT; NOT anchored to timer progress
  puffsPerCloud: 3,
  puff: { radiusMul: 0.42, squash: 0.62, overlap: 0.55 },
  tint: '#fbf6ee',    // warm-white base; SE lerps toward pal.ambient so clouds warm at sunset
  liftTint: '#ffffff',// crest puff — the warm-light-bias accent
},
```

---

## Compositing / draw order (load-bearing)

**Clouds are drawn BEFORE the sun, every frame.** Once the flat bar is gone the sun is the
*only* clock, so it can never be occluded — painting the sun last on top guarantees that
for free (echoed as guardrail #1 by the Product Owner and the Game Designer). Optional
polish: nudge any cloud whose center would land directly under the sun so its silhouette
isn't awkwardly half-clipped by the disc, but the paint-order rule alone is sufficient.

Cloud drift advances in the **fixed-timestep `update` step** (deterministic, pause-safe),
not off `performance.now()` in render; wrap clouds around the screen edge. The sun's arc
position is a pure function of timer `progress` (`arcFrac = 1 − progress`), per the
Architect — no new motion state needed for the sun.

## Tint survival (per `ART_DIRECTION.md` §2)

The sun disc is the day-cycle color, so it always contrasts the sky it shares a hue band
with by design (warm disc on a warming sky). The weak read is **dawn**: `#ffe1b0` on a
pastel-pink `#f6c6d4` sky is two warm lights stacked. That is exactly what the **warm-white
core** (`#fffdf2`, fixed) fixes — a bright body inside the disc so a pale dawn sun still
separates from a pale dawn sky. The halo (`#fff6e0`, fixed, low-alpha) sells the aura.
Clouds at α 0.55 over any sky stop stay legible without blocking the sun.

## Tone self-check (R7 / R8 / R9)

- **R7 (never punishing):** no rays, no red, no flashing. The warm-white core + soft halo
  read as gentle "golden hour," never a glaring warning. The most saturated point — the
  `#e07a3a` dusk disc — lands only at the very end as golden-hour warmth, not alarm.
- **R8/R9 (no menace):** pure rounded forms (circles + ellipses), zero sharp points. The
  sun and clouds are scenery; nothing here reads as a threat or a loss.
- **Build-time checkpoint (for the SE):** verify the dusk end-state reads as **wistful
  twilight, not ominous "GAME OVER"** on real pixels. Deep mauve `#5f4878` + saturated
  orange `#e07a3a` *can* lean dramatic at small scale — if expiry reads cold, nudge the
  `dusk` anchors back toward the golden `sunset` stop rather than adding harshness.
