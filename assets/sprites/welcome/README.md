# Welcome card assets (CATS-80)

The **welcome card** is the first screen a player sees — the letter intro page: the invitation
letter Mr. Kwak received, then the player names its recipient and composes their own. Source:
`src/ui/welcome.js`.

Naming note: the end-of-game share card already owns the word "postcard" (`assets/sprites/postcard/`).
This is the **welcome** card, so its art lives here, separate.

## Files

| File | Role |
|------|------|
| `welcome_left.placeholder.png` | The left-column illustration (image left / letter right layout). **Placeholder** — final art is user-provided. |
| `welcome_paper.placeholder.png` | The OLD-PAPER texture of the right column (the letter page). One locale-neutral texture behind the content. **Placeholder** — final art is user-provided. |

> History: the retired `welcome_left.placeholder.svg` and `stamp.placeholder.svg` (the old SVG
> stamp) were removed — the card draws the PNG left image and shares the postcard's
> `postmark.placeholder.png` as its stamp.

## Swapping in final art (no code change)

All placeholders are loaded by **stable paths** in `src/ui/welcome.js`:

- `assets/sprites/welcome/welcome_left.placeholder.png`
- `assets/sprites/welcome/welcome_paper.placeholder.png` (the letter page's old-paper texture)
- `assets/sprites/postcard/postmark.placeholder.png` — the card's angled top-right stamp.
  **Shared with the final postcard** (CATS-125 follow-up): overwriting this one file re-skins
  the postmark on BOTH cards. Keep it OPAQUE (no alpha channel).

To ship final art, **overwrite the file at the same path** (or drop in the real asset and keep the
name). The code references these exact paths, so replacing the file is the whole change — no edit to
`welcome.js` is needed. A missing/failed asset degrades gracefully (the card still renders; only the
image well is hidden). The compose button is a regular basic button — solid green pill, no art file.

Suggested final art:
- **Left image** — the love-letter crossing: Mr. Kwak on his lily-pad boat mid-lake, bouquet on the
  bow, the string-lit party shore glowing in the distance, rose-gold sunset. Warm + hopeful, never
  harsh (R7/R8/R9). Flat-soft-rounded, `ART_DIRECTION.md` palette. Landscape-ish aspect (~0.74 w:h);
  the well covers the left 46% of the card and crops with `object-fit: cover`.
- **Stamp** — a tiny on-brand vignette (e.g. Mr. Kwak, or a lily pad + bloom). Small, square-ish,
  ~4:5.
- **Paper texture** — the letter page (the right column) reads as OLD PAPER. The texture sits
  behind all content via `background` (cover, no tiling); the card's cream `#f4f0d6` stays under
  it as the fallback color. Keep it quiet — it must not fight the handwriting letter for contrast.
  The placeholder is 1024×1024, drawn with fiber noise, soft blotches, foxing at the edges, and a
  rim vignette, all in the card's own palette. Portrait-ish or square both crop fine.

## Tone self-check (R7/R8/R9)

All assets are part of the *opening* greeting, so they must read as warm and inviting — no menace,
no defeat imagery, no harsh reds. The placeholders are deliberately drawn in the game's existing
lily-pad/sunset language so the card already reads as FrogGame before the final art lands.
