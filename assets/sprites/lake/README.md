# Lake textures — tileable water surface + shore banks (CATS-67)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

These are the tileable textures for the Lake redesign (parent **CATS-64**): a calm water
surface for the lake and grass-bank textures for the home shore and the far (party) shore.
They replace the current flat solid fills in `src/render.js` (water = `pal.water` rect;
shores = flat `#3a7d4f` rects). **Art only** — wiring them into the renderer is a separate
Software Engineer task (**CATS-69**, stage 3), blocked on these assets landing.

This README is the **placement spec** the SE builds CATS-69 against.

## Files

| File | What | Tile size | Tiling |
|------|------|-----------|--------|
| `water_surface.svg` | calm lake water — soft rounded swells + faint highlights, **neutral** | 128×128 | both axes (seamless) |
| `shore_grass.svg` | grass-bank for the **home** shore | 96×96 | both axes (seamless) |
| `shore_grass_festive.svg` | grass-bank for the **far (party)** shore — warmer + party-light dots | 96×96 | both axes (seamless) |
| `shore_strip.svg` | grass-bank strip for the **landscape-bottom blend** (CATS-73) | 96×40 | both axes (seamless) |

All three are transparent-or-base-filled SVGs, flat fills only, rounded silhouettes (no sharp
points, no soft shading, one warm-light accent, at most one slightly-darker tone). They belong
to the same picture-book world as Pip, Fern, the fish, and the sky-landscape timer.

---

## 1. Tint pipeline integration (the load-bearing decision)

### Decision: water texture ships as ONE **neutral** version, NOT a recolorable set.

**Why.** The water fill is tint-blended per frame across the day cycle in `src/systems/timer.js`
(`paletteForProgress`) — `config.palette.water` goes dawn `#7a93b8` → noon `#2f6d9c` → sunset
`#3b4a7a` → dusk `#243049`, and `render.js` applies it as `fillStyle = pal.water; fillRect(...)`.
That base rect **must keep doing the tinting** — it's the only thing that sells the mood shift.
So the water texture is authored as a **neutral alpha overlay**: it carries **no base water
color of its own**, only low-alpha lighter + slightly-darker marks that modulate whatever
`pal.water` is that frame. One file covers all four stops; no per-stop variant set needed.

This is the same architecture the sky-landscape timer already uses successfully (the sun disc
takes `pal.sun` each frame; clouds are a fixed warm-white). Keep that pattern.

> **Alternative considered and rejected:** a 4-stop recolorable set (one tinted tile per
> palette stop). It would duplicate the tint work the base rect already does, double the art
> surface area, and risk the marks and the base fighting each other. Neutral overlay is simpler
> and keeps a single source of truth for the tint. Documented here so the SE doesn't "fix" it.

### Concrete integration recipe (for CATS-69)

Keep the existing water base rect **exactly as-is** (it is the tint source), then stamp the
texture on top as a repeating low-alpha overlay. No change to the tint math.

```js
// 1) preload once at startup (same loadImg helper the sky/Pip sprites already use)
const WATER_TEX = await loadImg('assets/sprites/lake/water_surface.svg');

// 2) in render(), AFTER the existing base water rect (which keeps using pal.water):
const waterPattern = ctx.createPattern(WATER_TEX, 'repeat');
ctx.fillStyle = waterPattern;            // neutral overlay; no own base color
ctx.translate(camX, 0);                  // world/camera space (see §3) — texture lives in WORLD space
ctx.fillRect(-camX, waterline, width, height - waterline);
ctx.translate(-camX, 0);                 // restore
```

`createPattern(img, 'repeat')` tiles both axes — the SVG is already seamless, so no extra
work. The texture's low-alpha marks (≈0.10–0.16) sit on top of `pal.water` and read as gentle
surface modulation. The base rect remains the tint authority.

> If, during QA, the marks read too weak at the **dusk** stop (`#243049`, the arrival beat when
> water is darkest), bump the highlight-swells' alpha in `water_surface.svg` up to ~0.22 before
> adding a second file — see §4 tint-survival analysis.

---

## 2. Shore integration

Shores are **not** tinted today (`#3a7d4f` solid rects in `render.js`), so the shore textures
ship **fixed-tint**. The base bank fill inside each SVG already matches the graybox color
(`#3a7d4f` home / `#43804f` festive), so the swap is a **visual upgrade, not a redesign**
(ART_DIRECTION §2).

```js
const SHORE_HOME = await loadImg('assets/sprites/lake/shore_grass.svg');
const SHORE_PARTY = await loadImg('assets/sprites/lake/shore_grass_festive.svg');

// home shore band (today: fillRect(0,0,18,height)) — keep the same footprint, pattern it:
ctx.save();
ctx.translate(camX, 0);                                  // world space (see §3)
const p = ctx.createPattern(SHORE_HOME, 'repeat');
ctx.fillStyle = p;
ctx.fillRect(0, 0, homeShoreWidth, height);              // homeShoreWidth ≈ 18 (or new oval band width)
ctx.restore();

// far shore band (today: fillRect(width-24,0,24,height)) — festive variant:
ctx.save();
ctx.translate(camX, 0);
ctx.fillStyle = ctx.createPattern(SHORE_PARTY, 'repeat');
ctx.fillRect(farShoreX, 0, farShoreWidth, height);
ctx.restore();
```

The far-shore flag/destination marker (`#d9b36c` rects in `render.js`) draws **on top** of the
party band as before.

### Home vs far shore — recommendation

**Use the festive tile for the far (party) shore, the plain tile for the home shore.** Same
base geometry so the two banks read as one cohesive shoreline; the only deltas are a slightly
warmer green and small warm party-light dots on the far shore. That visually rewards the
arrival — the destination literally lights up as Pip approaches Fern — without changing the
silhouette language (R7: warm twinkle, never a warning read). If the PO prefers a single
identical bank for maximum calm, the plain `shore_grass.svg` tiles both shores fine; the
festive file is an opt-in flourish.

---

## 3. Placement: dimensions, axes, scale, z-order, parallax

### Tile dimensions & tiling axes
- **Water:** 128×128, tiles **both X and Y**. The lake is long and scrolls under the
  follow-camera horizontally; vertical tiling means the water fill can be any height
  (important once the oval reshapes the water region).
- **Shores:** 96×96, tiles **both X and Y**. Shores are vertical bands today and remain bands
  under the oval redesign; horizontal tiling handles any band width, vertical handles full height.

### Intended scale
- Draw the textures **1:1 (no scaling)** at the current `world` 900×600. The marks are tuned
  for ~1.0×–1.5×; if the SE finds the swells/tufts too busy at the final oval scale, scale the
  *pattern* (not the SVG) via `ctx.scale` around `createPattern` rather than re-authoring.
  The lake is going **longer** (CATS-65/CATS-66), not taller, so vertical density is the
  unchanged axis; only check horizontal busy-ness under the longer scroll.

### Z-order (paint bottom → top — do not regress)
1. sky fill (`pal.sky`)
2. **water base rect** (`pal.water`) — the tint source
3. **water texture overlay** (neutral) ← *new*
4. sky-landscape timer: clouds then **sun** (the only clock — never occluded by CLOUDS or the
   water overlay; it sits in the sky band above the waterline)
5. stretch guides (dev aid)
6. **shore bands** (home left, party right) — drawn over water so the bank occludes the water
   edge cleanly
7. far-shore flag marker
8. **this strip's treeline** over the sky band (CATS-79: at the arc's two horizon ends — run
   start/finish — the sun sits ON the horizon and is intentionally BEHIND the treeline; only
   its halo peeks between the crowns, warmed by the horizon hue boost)
9. flowers → dragonflies → fish → boat (existing order)
9. HUD (screen space) → overlays

### Parallax recommendation (for the SE + Game Designer)
- **Water texture: parallax at 1.0 (no parallax).** The water lives in **world space** — it
  scrolls 1:1 with the follow-camera so fish/boat/entities (which are in world space) always
  sit correctly on the surface. A parallax factor on the water would detach the ripples from
  the gameplay layer and read wrong. This matches CATS-66's "camera is render-only, sim stays
  in world coords" — the water texture is world-space decoration.
- **Shore bands: also 1.0 (world space).** Shores are geometry the boat must reach; they must
  scroll with the world, not drift.
- **Do NOT parallax the sky-landscape band** (already fixed in `systems/sky.js`); that decision
  is independent and unchanged.

> If a *subtle* depth feel is desired later, the only safe place to add parallax is a future
> distant-horizon layer *behind* the waterline — never the water or shores themselves. Out of
> scope for CATS-67; flagged so the SE doesn't reach for water parallax.

---

## 4. Tint survival (per ART_DIRECTION.md §2)

The rule: a texture must read on the **darkest** water (`#243049` dusk) AND not wash out on the
**lightest** (`#7a93b8` dawn). Note: the cold `#16243f` night stop was intentionally dropped
(CATS-49) so an expired run lands on warm dusk, not punishing dark — so `#243049` is the real
darkest case, at the arrival beat when the water is darkest.

- **Water texture:** authored as a neutral overlay. Its highlight swells (`#eaf4ff`, α≈0.16) and
  shade swells (`#0f2236`, α≈0.10) are deliberately **near-neutral blue-gray** and **low-alpha**,
  so on any `pal.water` stop they only nudge lightness up/down a little — they survive the full
  shift by construction. They can't "vanish at dusk" because they're additive/subtractive marks,
  not a fixed hue that has to match a tint. **Pass.**
  - *Edge case to watch:* the shade swells (`#0f2236`) on the dusk `#243049` base are a
    near-black-on-dark-navy mark — still visible (slightly darker), but if QA reports the surface
    going flat/muddy at dusk, lift those shade-swells to `#1c3550` or drop them and rely on the
    highlight swells alone. One SVG edit, not a new file.
- **Shore textures (fixed tint):** warm greens `#3a7d4f`/`#43804f` are mid-value. Against the
  pale dawn/noon sky (`#f6c6d4`/`#cfe8ff`) above and the deep dusk sky (`#5f4878`) above, the
  bank silhouette stays legible (green-on-warm reads clearly; the darker `#2f6640`/`#36693f`
  patches + lighter tufts keep internal contrast). Against the water below, the bank is always
  lighter than the water at dusk and darker than dawn water — the bank/water boundary stays
  crisp at every stop. **Pass.**

---

## 5. Tone self-check (R7 / R8 / R9)

- **R7 (never punishing):** no red, no flashing, no harsh contrast. The water is calm and soft;
  the far-shore party lights are warm amber/blush twinkle, never a warning color. The dusk
  end-state still reads as wistful twilight, not "GAME OVER."
- **R8/R9 (no menace):** every form is rounded — grass tufts are overlapping rounded lobes (not
  blades), pebbles are ellipses, swells are soft quadratic curves. No sharp points anywhere.
  Nothing in these textures can read as a threat.
- **Cohesion:** same flat-fill vocabulary and palette family as the already-shipped Pip/Fern/
  fish/sky/postcard art. The water overlay reuses the "neutral marks on a tinted base" pattern
  the sky-landscape timer established, so the whole surface treatment is consistent.

---

## 6. Handoff checklist (for the SE / CATS-69)

- [ ] Preload the three SVGs once (same `loadImg` helper as Pip/sky sprites).
- [ ] Keep the `pal.water` base rect as the tint source; add the water texture as a `repeat`
      overlay on top (§1).
- [ ] Pattern the shore bands in place of the `#3a7d4f` rects; home = plain, far = festive (§2).
- [ ] Everything in world space; parallax 1.0 for water + shores; HUD stays screen space (§3).
- [ ] Z-order: water overlay before shores; sky-landscape sun never occluded (§3).
- [ ] Verify tint survival at dusk (`#243049`) on real pixels at the arrival beat; adjust the
      SVG's shade-swell alpha if the surface goes flat (§4).
- [ ] Verify seamless tiling under camera scroll (no visible seams in the water or banks).

## Build-time verification done during authoring

- All three SVGs are valid (render in a browser/svg viewer). Edge marks are drawn in matched
  pairs so the tile wraps seamlessly on both axes. Contact-sheet render confirmed flat-soft
  styling and palette harmony with the existing assets. Final aesthetic sign-off is the PO's.

---

## 7. Landscape-bottom blend (CATS-73 → UI Developer, CATS-74)

**Goal (user request, parent CATS-58 point 3):** the **bottom of the landscape** — the
waterline at `cfg.skyLandscape.height` (y = 40), where the sky-landscape timer strip meets the
water — should reuse the **same grass-bank texture as the lake shores** so the landscape band
blends into one continuous bank surface with the vertical shore banks. The vertical shores
(home `x ∈ [0,18]`, far `x ∈ [width−24, width]`) already run the full screen height including
through the landscape band; this asset fills the gap between them across the waterline so the
green bank reads edge-to-edge, not as two isolated vertical strips with bare water between.

### The asset: `shore_strip.svg` (new) — plus `shore_grass.svg` as a reuse fallback

- **`shore_strip.svg`** is a **purpose-built horizontal strip** (96×40) for the landscape
  bottom. It is **derived from `shore_grass.svg`, not a new look**: identical palette
  (`#3a7d4f` base / `#2f6640` darker tone / `#4f9763` tuft accent / `#5fa97a` pebble
  highlight), identical flat-soft-rounded mark language. The only change is the tile **shape**:
  - **height = 40** == `cfg.skyLandscape.height`, so one row of the tile fills the band with
    **no partial crop** (a 96×96 tile cropped to 40 would show a chopped tuft row);
  - **width = 96** == the shore tile's horizontal period, so its horizontal repeat aligns with
    the vertical shore banks and the seam between strip and bank is invisible;
  - the decorative tufts/pebbles are kept **low** (dense at the waterline y=40, thinning toward
    y=0) so the strip reads as a bank surface emerging at the waterline, not a hard green bar
    stuck under the sky. The base fill is full-height — it IS the bank.
- **`shore_grass.svg` (reuse)** is the acceptable fallback if the PO prefers a single shared
  tile across banks + strip. It tiles both axes cleanly and matches the look exactly; it just
  crops to a 40px-tall band, so a tuft row may be half-visible at the top of the band. Use the
  dedicated strip unless that crop reads fine in QA.

### Concrete integration recipe (for CATS-74)

Tile the strip as a repeating pattern across the full world width, anchored to the waterline,
drawn **over the water base rect and under the sky-landscape sun/clouds + HUD** (z-order below).
Two viable placements — pick with the PO:

**Option A — fill the landscape band's lower edge as a thin bank lip (recommended).** Stamp the
strip at the waterline so its bottom (y = `waterline`) sits ON the waterline and its body fills
the bottom of the landscape band, blending the band's lower edge into the shores:

```js
// preload once (same loadImg helper as the sky/Pip sprites)
const SHORE_STRIP = await loadImg('assets/sprites/lake/shore_strip.svg');

// in render(), AFTER the sky + water base rects, BEFORE drawSky / shores / HUD:
const stripH = SHORE_STRIP.naturalHeight || cfg.skyLandscape.height; // 40
const stripPattern = ctx.createPattern(SHORE_STRIP, 'repeat');        // tiles both axes
ctx.save();
ctx.fillStyle = stripPattern;
// anchor so the strip's BOTTOM sits exactly on the waterline; it fills upward into the band.
// (translate by -(waterline mod 40) so a tile boundary lands on the waterline, no half-row.)
const yTop = cfg.skyLandscape.height - stripH;
ctx.translate(0, yTop - Math.floor(yTop / stripH) * stripH);
ctx.fillRect(0, cfg.skyLandscape.height - stripH, cfg.world.width, stripH);
ctx.restore();
```

`createPattern(img, 'repeat')` tiles both axes; the SVG is already seamless. The strip is
**screen-anchored** if you keep it above the camera translate, or **world-anchored** if you draw
it inside the camera block — either is fine because the strip is uniform decoration with no
world-x dependence (it must simply align horizontally with the shore banks; both shores scroll
with the camera, so drawing the strip in world space keeps the banks + strip moving together).
**Recommend world space** (inside the camera block) so the strip and the vertical shore banks
scroll as one and never desync at the seam.

**Option B — blend the water top edge only.** If the PO wants the landscape band itself
untouched (keep the timer legible) and only the *water's top edge* softened, stamp the strip
just below the waterline (top at `waterline`, height 40) so the water starts with a bank lip.
Same code, shift `yTop` to `cfg.skyLandscape.height`. This keeps the landscape band pure sky and
puts the bank at the water's edge instead. Lower-risk for timer legibility; test both.

### Z-order (do not regress — extends §3)

Insert the strip into the existing paint order between the water base rect and the
sky-landscape draw:

6a. **shore strip along the landscape bottom** ← *new* (over water base, under shores/sun/HUD)
6b. shore bands (home left, party right) — the vertical banks; drawn over the strip so the bank
    occludes the strip at the shore x-ranges and the two read as one continuous bank

The strip must NOT cover the sun/clouds (they are the only clock) and must NOT cover the HUD
text (which sits at `skyH + 8`). Option A keeps the strip inside the 40px band, above the HUD's
`skyH + 8` baseline — verify the strip's top (calm, thinned-out marks) doesn't fight the HUD.

### Tint survival (extends §4)

The strip uses the **same fixed warm-green palette** as `shore_grass.svg`, so the §4 shore
analysis applies verbatim: mid-value greens stay legible against the pale dawn/noon sky
(`#f6c6d4`/`#cfe8ff`) above and the deep dusk sky (`#5f4878`) above, and the bank/water
boundary stays crisp at every stop (bank lighter than dusk water, darker than dawn water).
**Pass — no new tint risk.** If QA finds the strip too dominant against the pale dawn sky,
lower its decorative-tuft count; do NOT recolor (it must match the banks).

### Acceptance mapping (CATS-73)

- ✅ Shore texture assets available and suitable for tiling at the landscape bottom →
  `shore_strip.svg` (dedicated) + `shore_grass.svg` (reuse fallback), both tile both axes.
- ✅ Textures match the existing lake-shore look so the blend reads continuous → strip is
  derived from `shore_grass.svg` (identical palette + mark language), 96-wide to align with
  the banks.
- ✅ Unblocks the UI Developer's blended-bottom work → this section IS the handoff recipe for
  CATS-74; no further asset work needed.

### Handoff checklist (for the UI Developer / CATS-74)

- [ ] Preload `shore_strip.svg` once (same `loadImg` helper as sky/Pip sprites).
- [ ] Decide Option A (bank lip inside the landscape band) vs Option B (bank at the water's
      edge) with the PO; Option A is the literal read of the request.
- [ ] Tile via `createPattern(img, 'repeat')`; draw in world space (inside the camera block) so
      the strip scrolls with the vertical shore banks.
- [ ] Z-order: over the water base rect, under sun/clouds/HUD; vertical shore banks drawn over
      the strip at their x-ranges.
- [ ] Verify the seam between the strip and each vertical shore bank is invisible (same palette
      + same 96 horizontal period → should be seamless; if a 1px hue tick appears, nudge the
      strip's x translate so a tile boundary lands on the bank's inner edge).
- [ ] Verify timer legibility (sun arc + HUD text) is unchanged; the strip's calm top edge must
      not fight the clock or the readout.
- [ ] Verify tint survival at dusk on real pixels (per §4 / the §4 shore analysis).

---

## 8. Watercolor alternates for the water overlay (CATS-144)

Three alternative water-surface tiles exploring a **watercolor** take on the lake, to fit the
fairy-tale picture-book narrative. They are **evaluation candidates** — the shipped
`water_surface.svg` stays untouched until the PO picks a winner (winner gets renamed into its
place, losers get deleted).

| File | Look |
|------|------|
| `water_surface_alt_wash.svg` | **Alt A — wet-on-wet washes.** Broad soft-edged pigment pools bleeding into damp paper. Calmest, most "painted lake"; subtlest of the three at the dusk stop. |
| `water_surface_alt_drybrush.svg` | **Alt B — dry-brush currents.** Broken horizontal brush streaks over faint wet under-washes; reads as a gentle current drifting toward the far shore. Most legible at dusk. |
| `water_surface_alt_pool.svg` | **Alt C — pooled washes.** Sparse light washes finished with a darker pooled-pigment rim (the watercolor "bloom" edge). Most hand-painted, closest to a picture-book page. |

All three keep every load-bearing constraint of §1: **neutral** (no own base water color —
only low-alpha light `#eaf4ff` + dark `#0f2236` marks, so the day→dusk tint still reads
through), 128×128, seamless both axes, alpha budget within §1's ≈0.10–0.22 range. They use
SVG gaussian-blur filters for the soft pigment edges; filters render correctly through the
`new Image()` + `createPattern()` path in `src/assets.js` (verified via the preview sheet
below — if a runtime ever fails to rasterize them, the marks degrade to hard-edged shapes,
still neutral and seamless, never broken).

Note: these consciously bend ART_DIRECTION §1's "flat fill, no soft shading" toward
watercolor per the PO's request — the style call is the PO's to make from the sheet.

**To compare:** open `water_surface_alts_preview.html` — every variant tiled 2×2 over all
four real tint stops (`config.js` §`palette`), same compositing the game uses.
**To test one in-game:** point the single path string at `src/render.js` `getTexture(...)`
in `drawWaterFill` at an alt file — no other change needed.
