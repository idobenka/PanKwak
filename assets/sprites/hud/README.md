# HUD art — the narrative board placeholder (CATS-114)

**Author:** FrogGame / UI Developer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

One PLACEHOLDER stamp for the in-play HUD: the wooden sign board drawn behind the
narrative beat lines (the italic stretch/milestone/fish/loss feed at the bottom of the
lower grass band), so the lines sit on a readable plank panel instead of the textured
grass (CATS-114 "wooden board background for them").

| File | What | Size | Drawn |
|------|------|------|-------|
| `narrative_board.placeholder.svg` | wooden plank panel — warm brown boards, darker seam + outline, wood-grain streaks, two corner nails | 560×90 | screen-space behind the feed at a FIXED size (4/5 of the game box width, 3 line slots tall), pinned below the lake edge (`src/ui/narrative.js` `drawBeatFeed`); also behind the top-right HUD count column (`src/ui/hud.js` `drawBoard`, CATS-130 follow-up 2) |

## Placement recipe

- Drawn every frame the feed has visible lines, BEFORE the text: `drawBeatFeed` draws the
  board at its fixed size (4/5 of the viewport wide, 3 slots tall), then paints the italic
  lines into the slots — newest at the BOTTOM, older ones rotated up.
- A missing/failed SVG load degrades to a canvas-primitive plank fallback (rounded warm
  brown rect + seam lines) — the feed stays readable either way. Same rule as every other
  sprite: art never breaks the loop.
- Text alpha fades per line; the board fades with the NEWEST line's alpha so it melts away
  with the last line instead of lingering as an empty panel.

## Tone self-check (R7 / R8 / R9)

- **R7 (never punishing):** warm honey-browns, soft rounded corners — a garden-sign read,
  never a warning placard. No reds, no harsh contrast.
- **R8/R9:** purely a legibility surface; carries no emotion itself.

## Handoff note

Placeholder by design (CATS-114 says so). The Asset Designer can replace the SVG 1:1 —
keep the same path + viewBox; the code needs no change.

## Tint survival

Fixed mid-tone browns against the fixed-tint grass tiles; reads across the dawn→dusk cycle
the same way the shore stamps do (`../shore_art/README.md` §Tint survival).
