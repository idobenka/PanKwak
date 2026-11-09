# Postcard visuals / frame — the 3 end states (CATS-32)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Parent:** CATS-31 (shareable final postcard pages — UI plumbing owned by UI Developer).

The postcard is the single most "shareable" surface in the game. This set delivers the
**frame** (one shell, shared by all three states) + the **three per-state scenes** that drop
into it. Reuses the game's existing art language — Pip, Fern, lily-pad boat, dragonfly,
string-lit party shore, sunset sky — so it reads as FrogGame at a glance.

> **CATS-125 note:** the card's on-screen layout is now full-window art — the per-state PNG
> scene cover-fits the WHOLE 900×600 card; the text column on the right keeps its exact
> position but rides a translucent scrim; the postmark is an opaque PNG drawn on top of all
> layers. The files below remain the art pipeline — the swap conventions are unchanged.

## How to update the final postcard wordings (CATS-116 / CATS-124)

All card copy — the letter-structure text (salutation, headline, body, wish, invite) plus
every button, group label, and tooltip — lives in ONE file: **`src/i18n.js`**, in the two
locale dictionaries (`en` and `uk`). To change wording:

1. Open `src/i18n.js` and find the `card*` keys:
   - **Card text (CATS-124 letter structure)** — `cardHeadlineTo` (the "For {fernName},"
     salutation, shared by all outcomes), then per outcome `cardHeadlineWon` /
     `cardBodyWonMany`, `cardHeadlineEmpty` / `cardBodyEmpty`, `cardHeadlineLost` /
     `cardBodyLost`, and the shared closers `cardBodyWish` + `cardBodyIvite` (the invite
     CTA — rendered underlined and clickable, opening the game itself) +
     `cardSignature` (the sender line that closes the letter). Edit the string after the
     colon. Keep the `{frogName}`, `{fernName}`, `{flowers}`, `{dragonflies}`
     placeholders if you want the names/counts interpolated; remove them if the new
     wording shouldn't include them.
   - **Buttons/groups/tooltips** — `cardBtnCopy`, `cardBtnSave`, `cardBtnPlayAgain`,
     `cardGroupReply`, `cardGroupDonate`, `cardBtnWwf`, `cardBtnUanimals`,
     `cardTipShare`, `cardTipDownload`, `cardTipPlayAgain`, `cardTipWwf`,
     `cardTipUanimals`, `cardExportBlocked`.
2. Edit the SAME key in BOTH dictionaries — `en:` for English, `uk:` for Ukrainian. A key
   missing from `uk` silently falls back to English, so keep them in sync.
   **Line breaks:** put `\n` inside the string for a hard line break — e.g.
   `cardBodyWish: 'That evening… never end.\nWith love, the forest.'` — each segment then
   word-wraps on its own, and `\n\n` gives you a blank line between paragraphs. This works
   in every card text key (salutation, headline, body, wish, invite, signature).
3. Refresh the game — the change is immediate (no build step). Open a shared postcard link
   (or finish a run) to see the new wording; switch the language in the top-right bar to
   check the other locale.
4. If the new body text is much longer, it simply wraps to more lines in the right column;
   aim to keep the whole letter (headline + body + wish + invite) under ~9–10 wrapped lines
   so it stays clear of the button row at the bottom.

## Files

| File | Role | Size |
|------|------|------|
| `postcard_win.png` | **Final per-state art (CATS-125 draws THIS):** made it to the party with gifts — celebratory, warm. Cover-fits the whole 900×600 card window. | ~595×869 |
| `postcard_empty.png` | **Final per-state art:** arrived empty-handed — warm anticlimax, Pip's apologetic grin, Fern waving him in (R7, never a loss look). | ~612×869 |
| `postcard_lost.png` | **Final per-state art:** sunset, hopeful — Pip still mid-lake as the sun sets; the party stays lit and waiting (never harsh). | ~586×869 |
| `postmark.placeholder.png` | **POSTMARK (CATS-125).** An OPAQUE PNG drawn LAST, on top of every layer (image + scrim + letter). **Placeholder** — final art is user-provided; overwrite the file in place (same path) to ship it, no code change. Keep it opaque (no alpha) — the postcard image must never show through it. **Shared with the welcome card** (CATS-125 follow-up): the welcome card's angled top-right stamp draws this SAME file, so one overwrite re-skins both cards. | 92×116 |
| `postcard_image.placeholder.svg` | IMAGE LAYER fallback slot (CATS-83) — only drawn when no per-state scene applies (no/unknown outcome, or a missing scene file). The old "placeholder overrides the scenes" era ended when the final per-state art landed. | 1040×448 |

> History: the retired `postcard_frame.svg` shell and the original vector scenes
> (`postcard_win/empty/lost.svg`) were removed — the PNGs are the shipped art and the
> frame is painted by `src/ui/postcard.js` (CATS-116 follow-up 2 / CATS-125).

## The card's layer order (CATS-125)

`src/ui/postcard.js` composites the card back → front:

1. **Card base** — a wash + the 4px painted border; only visible if art fails to load.
2. **Image layer** — the per-state PNG art, **cover-fitted across the WHOLE 900×600 window**
   (the picture is no longer confined to a left column).
3. **Text layer** — the letter column on the right, at exactly the CATS-116/124 position
   (46% split, same padding/typography), on a **TRANSLUCENT cream scrim** (`rgba(244,240,214,0.82)`)
   so the postcard image shows through beneath the text. Copy is fully localized (en/uk
   via `src/i18n.js`) and interpolates the player-chosen names with a canonical-default fallback.
4. **Postmark** — the OPAQUE PNG (`postmark.placeholder.png`), 7° tilt, top-right of the
   column, drawn LAST so it sits on top of every layer, like a stamp over the photo.

## Swapping the art (no code change)

- **Per-state scenes:** overwrite `postcard_win/empty/lost.png` at these exact paths. The
  renderer **cover-fits** (scale to fill, center-crop) into 900×600 (3:2), so author the art
  at 3:2 (e.g. 1800×1200) with the subject centered so the crop cuts nothing important. The
  current PNGs are portrait (~0.69 aspect) and are center-cropped to 3:2.
- **Postmark:** overwrite `postmark.placeholder.png`. Keep the file **opaque** (no alpha
  channel) — it must sit on top of the image/scrim without letting them show through.
  The **welcome card's stamp draws the same file** — one overwrite re-skins both cards.
- **State-neutral fallback slot:** overwrite `postcard_image.placeholder.svg` — used only
  when no per-state scene applies.
- **Tone:** warm + hopeful, never harsh (R7/R8/R9). Flat-soft-rounded, `ART_DIRECTION.md` palette.
- **State-neutral:** one image composes the whole image layer for every outcome; it must not
  bake in run data (gift counts, names) — those live in the text layer.

## Layout map (how the card is composed)

> Historical: this 1040×648 frame/scene map describes the retired SVG-shell era. The shipped
> card is full-window PNG art (CATS-125) — see the layer order above and `src/ui/postcard.js`.

```
┌─────────────────────────────────────────── 1040 ───────────────────────────────────────────┐
│ ◢ PICTURE WINDOW  (0,0 → 1040×448)  ← composite one of the 3 scene SVGs here at 1:1        │
│                                                                                              │
├──────────────────────────────────────────── 448 ────────────────────────────────────────────┤
│   Caption strip (ruled "write here" lines)              ┌──────┐ ┌──────┐  stamp + postmark │
│   ← state headline + body copy composited by UI Dev     │ stamp│ │postmk│                     │
│   (copy lives in src/i18n.js, drawn by the TEXT layer)  └──────┘ └──────┘                     │
│   For {fernName}, → headline+body → wish → invite  ← TEXT layer (CATS-124 letter, localized)  │
└──────────────────────────────────────────── 648 ────────────────────────────────────────────┘
```

## Per-state mood accent (same shell, different mood)

The three scenes share the arrival-beat composition (sunset, two frogs, dragonfly, lit party
shore) and diverge only in mood — held by palette warmth, Pip's expression, and the gift haul:

| State | Sky | Pip | Fern | Gifts | One-liner mood |
|-------|-----|-----|------|-------|----------------|
| **win**  | warmest rose-gold, bright high sun | proud closed-eye smile, presents a **full** multi-flower bouquet | eyes wide + sparkly ("her eyes light up") | full bouquet + perched dragonflies | "you made it to the party!" |
| **empty** | softer/cooler rose-gold, low sun | empty palms up, hand behind head, **apologetic grin** + small "heh" sweat | **waving him in**, hand out, tender smile | one dragonfly still lands on her flower | "the trip was the point" |
| **lost** | deepest indigo + one warm low sun, early stars | **still mid-lake**, eyes forward, quiet hopeful smile, still rowing | tiny silhouette at the far shore, lantern in hand, **waiting** | one flower + one dragonfly still aboard | "the party will wait for you" |

Tone guardrails are encoded per scene, not left to copy:
- **R7:** `postcard_empty` is drawn so it is impossible to read as a loss screen — no frown,
  no red, no "X", Fern is the *welcoming* pose (waving in), and a dragonfly **still settles** on
  her flower. The empty-handed card is the warm anticlimax, by construction.
- **R8/R9:** no fish, no teeth, no menace, no defeat iconography in any of the three.
- **Lost** is **hopeful by composition**: Pip is still moving, the party is still lit, Fern is
  waiting. It is never a "game over" slab.

## How the UI Developer composites the card (CATS-31 / CATS-83 two-layer)

> Historical recipe from the SVG-shell era (the frame + scene SVGs are gone — the shipped
> compositing is `src/ui/postcard.js`: painted card base, full-window per-state PNG,
> translucent text scrim, opaque postmark). Kept for the layer-separation rationale:

```js
// preload once
const IMAGE_LAYER = await loadImg('assets/sprites/postcard/postcard_image.placeholder.svg'); // CATS-83 art slot
function loadImg(src){ const i = new Image(); i.src = src; return i.decode(); }

// render the card for a given end status (status ∈ won | arrived_empty | lost)
function drawPostcard(ctx, status, world, x, y, w /* =1040 */, h /* =648 */) {
  // ── IMAGE LAYER (CATS-83) ──
  const sw = w; const sh = w * (448/1040);              // picture window, keep aspect
  if (IMAGE_LAYER) ctx.drawImage(IMAGE_LAYER, x, y, sw, sh);   // ← the single art slot
  // ── TEXT LAYER (CATS-83) ──  localized (en/uk) + player-chosen names; independent of the image
  drawCaption(ctx, status, world, x, y + sh, sw, h - sh);
}
```

The caption (text layer) is fully localized and resolves the player-chosen names; copy + accent
colors are chosen in `src/ui/postcard.js` (`STATE` config):
- **won** — headline `"You made it to the party!"` (accent `#7a5a2a`); body uses the gift-count line.
- **arrived_empty** — headline `"You made it across…"` (accent `#9a6a3a`); body = the anticlimax line.
- **lost** — headline `"The sun set on the lake…"` (accent `#3a5a8a`); body = the hopeful retry line.

Use the **Fredoka** font already shipped in `assets/fonts/` for the caption so the card matches
the title face (it's the ART_DIRECTION shortlist pick).

## Static-host / URL-encoding (the CATS-31 + this-issue constraint)

Per the issue: no backend, no save data. The whole card must render **client-side from a static
asset + the run result encoded in a URL.** Recommended encoding (for CATS-31 to implement):

- Put `status`, `flowers`, and `dragonflies` in the share-URL query string, e.g.
  `?s=won&f=3&d=2` (or `s=empty` / `s=lost`). Short keys keep the link tidy.
- On load, the postcard page reads those three values, picks the scene by `s`, and feeds `f`/`d`
  into the caption body (the gift-count line in `screens.js` already branches on `total >= 4`).
- All art is static files under `/assets` on GitHub Pages — no per-run rendering, no
  server. The card is deterministic from the URL alone.

The art carries zero personal/run-specific data, so a static asset per state is sufficient —
the **only** run-dependent thing on the card is the gift count in the caption, which is text.

## Sizing notes

- Historical: the card was authored at **1040×648** in the SVG-shell era. The shipped PNGs are
  portrait and cover-fit the 900×600 card window (see "Swapping the art").
- A rounded clip path `#picWindow` was defined in the retired frame if a soft-cornered scene
  edge was wanted (optional polish; scenes already filled the window edge to edge).

## Tone self-check (R7/R8/R9)

| Guardrail | Win | Empty | Lost |
|-----------|-----|-------|------|
| **R7** (empty = warm anticlimax, never loss) | n/a | ✅ Pip apologetic grin (not frown), Fern waving in (not pitying), dragonfly still lands | n/a |
| **R8** (no menace / predator imagery) | ✅ no fish, no teeth | ✅ | ✅ |
| **R9** (gifts read as "wandered off", not stolen/attacked) | ✅ dragonflies perched happily | ✅ dragonfly still settles | ✅ gifts still aboard |
| Never harsh/punishing (lost) | n/a | n/a | ✅ hopeful: Pip moving, party lit, Fern waiting |
| Never defeat-style imagery (no red slab, no "X", no skull) | ✅ | ✅ | ✅ |

All assets were validated for parse/render during authoring (see the result comment on the
issue). Final aesthetic sign-off is the PO's at review.
