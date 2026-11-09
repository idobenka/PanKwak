# CREDITS.md — FrogGame artwork attribution

Ship requirement. **Every** asset placed under `assets/` must be logged here, with a
verifiable source URL and the exact license. Reconstructing this later is painful and
error-prone; logging on first add is the rule.

Open in the same PR / commit that adds the first asset, and append on every subsequent add.
Custom (Phase B) assets produced by Asset Designer are also logged — author
"FrogGame / Asset Designer", license "Proprietary (project original)", no source URL.

## Sourcing rules (from CATS-41, non-negotiable)

- **Acceptable:** CC0 / Public Domain; CC-BY (attribution shown — that's this file, and
  in-game/README where noted); CC-BY-SA only if the whole art set goes share-alike;
  OFL/SIL for fonts.
- **Never:** unlicensed itch/DeviantArt art; realistic/predator fish packs; defeat-style
  overlay imagery. AI-generated art gets the SAME license check as any other source.
- **Cohesion over realism.** Every asset shares one style (see `ART_DIRECTION.md`).
  Reject off-style free art even when the license is clean.

## Log format

One block per asset. Copy this template:

```
### <asset-name>
- File:        assets/sprites/<filename.png>   (or assets/fonts/<file>)
- Tier:        open-source | custom
- Author:      <name / studio / "FrogGame / Asset Designer" for bespoke>
- Source:      <verifiable URL — the exact page you downloaded from, not the site root>
- License:     CC0 | CC-BY 4.0 | OFL 1.1 | Public Domain | Proprietary (project original)
- Attribution: <text required to be shown if CC-BY; blank for CC0/OFL/proprietary>
- Notes:       <e.g. "recolored to palette", "scaled 2x", "checked against tone guardrails R7/R8/R9">
```

## Logged assets

### Fredoka (title font)
- File:        assets/fonts/Fredoka-Variable.ttf · assets/fonts/OFL-FREDOKA.txt
- Tier:        open-source
- Author:      The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One)
- Source:      https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth%2Cwght%5D.ttf
- License:     SIL Open Font License 1.1 (OFL)
- Attribution: "Fredoka" — OFL 1.1, shown in README
- Notes:       Variable font (weights Light→Bold). Rounded, friendly display face — matches
               the flat-soft-rounded style direction. License verified from the OFL.txt
               shipped in the same upstream directory (also copied here). Picked as the
               title font candidate from the ART_DIRECTION.md shortlist (Baloo 2 / Fredoka /
               Quicksand); final weight selection to be confirmed at UI integration.

### Pip, fish tiers, arrival beat (bespoke sprites)
- Files:       assets/sprites/pip/*.png · assets/sprites/fish/*.png · assets/sprites/arrival/arrival_smile_empty.svg
- Tier:        custom
- Author:      FrogGame / Asset Designer
- Source:      (project original — no external source)
- License:     Proprietary (project original)
- Attribution: (none required)
- Notes:       Authored as flat-soft-rounded SVG to the signed-off ART_DIRECTION.md palette.
               Each sprite's README carries a per-asset R7/R8/R9 self-check. Rendered to PNG
               for visual verification during authoring; the PNGs are the shipped art (the
               original SVG sources and the unused Fern poses were removed in the CATS-137
               unused-asset cleanup). Handed off for the renderer's drawX functions to swap in.

### Postcard frame + 3 end-state scenes (bespoke)
- Files:       assets/sprites/postcard/postcard_win.png · postcard_empty.png ·
               postcard_lost.png
- Tier:        custom
- Author:      FrogGame / Asset Designer
- Source:      (project original — no external source)
- License:     Proprietary (project original)
- Attribution: (none required)
- Notes:       CATS-32. The shareable postcard: one state-neutral shell (`postcard_frame.svg`,
               1040×648) + three 1040×448 scenes that drop into its picture window (won /
               arrived_empty / lost). Reuses the arrival-beat art language (Pip, Fern, lily-pad
               boat, dragonfly, string-lit party shore, sunset sky). R7 encoded into the empty
               scene by construction (apologetic grin + Fern waving in + dragonfly still lands
               = warm anticlimax, never loss); lost is hopeful-by-composition (Pip still moving,
               party still lit, Fern waiting); no R8/R9 regression in any state. See the
               directory README for the compositing recipe and static-host URL-encoding note.
               (The retired SVG shell + vector scenes were removed in the CATS-137 unused-asset
               cleanup — the PNGs are the shipped art.)

### Flower + dragonfly sprites (bespoke)
- Files:       assets/sprites/flower/flower.png · assets/sprites/dragonfly/dragonfly.png
- Tier:        custom
- Author:      FrogGame / Asset Designer
- Source:      (project original — no external source)
- License:     Proprietary (project original)
- Attribution: (none required)
- Notes:       Flat-soft-rounded SVG to the signed-off ART_DIRECTION.md palette. Flower
               (32×32) = blush petals `#f2d3e0`/`#f6dce7` + warm center `#e8b24c`/`#f4cd6e`,
               matching the graybox `drawFlower` so the swap is a visual upgrade not a
               redesign; light petals survive the dark dusk/arrival water (R7 glow). Dragonfly
               (32×32) = mint body `#9be3c4`/`#7fd6b4` + translucent shimmer wings
               `#bff7dd`/`#d6fbe9`, matching the graybox `drawDragonfly` hue; faces left
               (toward the boat). Per-directory README carries an R7/R8/R9 self-check. Handed
               off for the renderer's `drawFlower` / `drawDragonfly` swap-in.

### Lake textures — water surface + shore banks (tileable)
- Files:       assets/sprites/lake/water_surface.svg · shore_grass.svg · shore_grass_festive.svg
               (the renderer stamps the PNG renders: water_surface.svg is loaded directly;
               shore_grass.png / shore_grass_festive.png are the shipped tiles)
- Tier:        custom
- Author:      FrogGame / Asset Designer
- Source:      (project original — no external source)
- License:     Proprietary (project original)
- Attribution: (none required)
- Notes:       CATS-67. Tileable textures for the lake redesign (CATS-64). `water_surface.svg`
               (128×128, tiles both axes) is authored NEUTRAL — no own base color; a low-alpha
               overlay of lighter + slightly-darker marks stamped on the existing `pal.water`
               base rect so the day→dusk tint (timer.js paletteForProgress) reads through
               unchanged (single file, not a per-stop recolorable set — see directory README §1).
               `shore_grass.svg` (96×96) = home shore bank, base `#3a7d4f` (matches the graybox
               so the swap is a visual upgrade not a redesign). `shore_grass_festive.svg` = the
               far/party-shore variant, same geometry nudged warmer + small warm party-light
               dots (R7: twinkle, never warning). All flat-soft-rounded, flat fills only, one
               warm-light accent + one darker tone per ART_DIRECTION §1. Tint-survival checked
               against the full dawn→noon→sunset→dusk shift incl. the dusk arrival beat
               (`#243049`, darkest water) — pass; R7/R8/R9 self-check in the directory README §5.

### Sound — procedural recipes, all 8 voices (bespoke)
- Files:       assets/audio/recipes.js · assets/audio/README.md
- Tier:        custom
- Author:      FrogGame / Asset Designer
- Source:      (project original — no external source)
- License:     Proprietary (project original)
- Attribution: (none required)
- Notes:       CATS-93. Every sound in the game is a procedural Web Audio voice spec
               (pure data in `recipes.js` — the 7 discrete SFX + the ambient bed from
               sound_design.md CATS-91 §1; zero audio files, so there is no license
               surface beyond this entry by construction). The engine (CATS-94,
               src/systems/audio.js per architecture.md §"Audio system architecture")
               synthesizes from these specs; every parameter is a config-sweepable
               scalar. The three tone-critical loss sounds (dragonfly_spill, fish_munch,
               boat_stun) and the two R7 arrivals (arrived_empty, soft_fail) carry a
               per-sound why-comic / what-breaks-it self-check in
               assets/audio/README.md §"Tone self-check" — the CATS-95 feel-review gate.
               If any voice is ever swapped to a recorded sample, THAT file needs its
               own CREDITS.md entry (verifiable source URL + CC-BY-class license)
               before it can ship — see assets/audio/README.md §"Sample swap".
               CATS-101: the ambient bed became a variant family (lake_lullaby /
               croak_lake / dusk_drone — the melody/croak layers are 'seq' recipes in
               the same file, still zero audio files); see
               assets/audio/README.md §"The ambient bed family".


### HUD — the narrative board (bespoke placeholder)
- Files:       assets/sprites/hud/narrative_board.placeholder.svg · assets/sprites/hud/README.md
- Tier:        custom
- Author:      FrogGame / UI Developer
- Source:      (project original — no external source)
- License:     Proprietary (project original)
- Attribution: (none required)
- Notes:       CATS-114. The wooden plank sign board drawn behind the in-play narrative
               feed lines (bottom of the lower grass band) so the italic lines read over a
               warm panel instead of the textured grass — the user's "wooden board
               background" ask. PLACEHOLDER by design (issue says so); swap in place
               (same path + 560×90 viewBox) with no code change. Warm honey-brown planks,
               darker seam + outline, two corner nails — garden-sign read, R7 tone check
               in the directory README. Canvas-primitive fallback in
               src/ui/narrative.js drawBeatFeed keeps the feed readable if the SVG fails.
