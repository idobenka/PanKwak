# Fish tier sprites — Concept 4 (Lily-Pad Boat)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Style:** flat, soft, rounded vector cartoon (`../../ART_DIRECTION.md` §1)

R8 is the load-bearing rule here: **fish are oblivious buffet-goofballs, NEVER predators.**
Bigger = *more dopey*, not more scary. No teeth, no lunge, no menace, no sharp fins.

How "dopier-as-bigger" is encoded (the graybox's "darker = more dangerous" tell, fixed):
- **Body** gets *rounder/chubbier* with tier (taller body : fin ratio), not leaner.
- **Belly** gets *lighter* with tier (`#cfe0e8` → `#dfeaf0`) — a lifted, soft underbelly
  reads as soft/lovable, the opposite of a dark menacing silhouette.
- **Eyes** get *bigger and dopier* with tier — more white, smaller pupil, dropped eyelid
  on the big one = a vacant, contented stare. Never narrowed predator eyes.
- **Expression** drifts from "oops guilty" (small) → "huh? burp" (medium) → "blissfully
  clueless" (big). All comedy. A tiny guilt-blush on small (the one-nibble apology).

Palette per tier (keeps the existing `TIER_META` hue family, lifts the belly):
- **tier 0 small:** body `#7fb6c9` · belly `#cfe0e8` · cost 1 flower
- **tier 1 medium:** body `#4f8aa6` · belly `#c8dde6` · cost 3
- **tier 2 big:** body `#2f5d77` · belly `#dfeaf0` (lightest!) · cost 7

Each faces LEFT (toward the boat, the existing `render.js` orientation). Transparent bg.
Sized to match `config.spawn.fishRadiusPerTier` [14, 22, 34] at 2x (so 56×40, 88×64, 136×96).

## Tone self-check (R8/R9)
- **R8:** zero predator cues on any tier. No teeth (mouths are soft round openings), no
  sharp fin points, no narrowed/hunting eyes. Bigger tier is the *least* threatening.
- **R9:** the small fish's guilt-blush + the medium's burp petal sell "the gift wandered
  off / a fish goofball ate it," never an attack. Losses read as comedy, not violence.
