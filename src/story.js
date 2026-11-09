// story.js — the Phase 3 charm pass, as DATA. (CATS-24 — the smile pass.)
//
// Role (architecture.md §"Design principles" #4): story.js is isolated from mechanics
// and CARRIES THE TONE GUARDRAILS AS DATA. Every line below is content; nothing here
// imports the engine, mutates world state, or draws. The Software Engineer wires these
// accessors into the hooks already built in Phases 1–2 (stretch advance in game.js,
// collision events from collisions.js, dragonfly loss in game.js). This file is where
// "is this wholesome?" gets reviewed separately from "does the steering work?"
//
// All authored text is localized (CATS-75). Accessors take a `locale` ('en' | 'uk') as
// their first param and resolve copy from the i18n.js catalog via t()/tCount(); English
// is always the fallback for an unsupported locale or missing key, so a bad locale never
// yields a blank or raw key. The tone lint still runs on the already-resolved string.
//
// === CONSUMPTION CONTRACT (what to call, and when) ============================
//
//   The `names` arg ({ frogName, fernName }) carries the player-chosen frogs (CATS-82); empty
//   /missing resolves to the canonical defaults inside each accessor. Pass world.frogName /
//   world.fernName (game.js keeps them canonicalized). It's optional on every accessor — a
//   missing `names` still renders the canonical defaults, never 'undefined'.
//
//   On stretch entry (game.js: newStretch !== stretchIndex)
//     → story.stretchBeat(stretchIndex, locale, names) → { narration, emotion }
//
//   When a gift count rises to a new high (gifts.js collect* / game.js)
//     → story.milestoneFor(kind, count, locale, names) → line | null  (kind: 'flower'|'dragonfly')
//       Fire once per NEW milestone; track the last line you showed per kind.
//
//   On a collision event (collisions.js resolve() returns events[])
//     → story.fishAteLine(tier, lost, locale)         → line   (event.kind === 'fish_ate')
//     → story.fishBumpLine(tier, locale, names)       → line   (event.kind === 'fish_hit', the stun)
//
//   On dragonfly border loss (game.js: gifts.loseDragonflies, a shore bump — always exactly
//   one slipped, CATS-135)
//     → story.dragonflyLostLine(locale)               → line
//
//   (Optional positive mirror — on a gift collected)
//     → story.collectLine(kind, totalAfter, locale)   → line | null
//
//   CATS-134: the arrival beats are GONE — the end overlays ('won' / 'arrived_empty' /
//   'lost') show TITLES ONLY (screens.js overlay*Title), so arrivalBeat / emptyHandedBeat /
//   softFailBeat / sunsetTwistLine and their catalog keys were removed. The arrival staged
//   scene (illustration + halo + camera pan) is driven by systems/narrative.js's clock.
//
//   Tone lint — call while wiring / in review to flag forbidden framing
//     → story.lintTone(line)                           → string[]  (empty = clean)
//
// =============================================================================

import { t, tCount } from './i18n.js';
// Name identity (CATS-82, CATS-111). The accessors resolve copy that names the frogs, so they
// take a `names` arg ({ frogName, fernName }) and thread it into the catalog placeholders.
// Empty / missing always resolves to the locale's canonical default (Mr. Kwak / Пан Квак,
// My best friend / Мій найкращий друг) — the same rule config.canonicalName and postcard.js
// enforce — so a beat never reads as 'undefined'.
import { defaultFrogName, defaultFernName, canonicalName } from './config.js';

// Build the { frogName, fernName } params object with canonical-default fallback. Used by every
// accessor below so a missing/blank name resolves once, identically, to the canonical default.
function nameParams(names, locale) {
  return {
    frogName: canonicalName(names && names.frogName, defaultFrogName(locale)),
    fernName: canonicalName(names && names.fernName, defaultFernName(locale)),
  };
}

// --- Tone guardrails, carried as data (architecture.md §"Design principles" #4) ---
// Every beat below is written to these. Cute, not cloying. Hopeful, not saccharine.
// Funny, not snarky. Wholesome, not preachy. Failure is soft and funny; the frog is
// never in danger — only late. The smile is earned by warmth or a small surprise.
export const TONE = {
  must: ['Cute', 'Hopeful', 'Funny', 'Wholesome'],
  never: 'punishing, scary, or saccharine',
  // Framings the loss/arrival text must NEVER use (R7/R8/R9). lintTone() flags these.
  forbiddenFramings: [
    'attack', 'attacked', 'predator', 'hunted', 'killed', 'dead', 'death',
    'destroyed', 'destroy', 'lost the game', 'game over', 'fail', 'failed',
    'heartbreak', 'broken heart', 'punish', 'punished',
  ],
};

// Fish are CHARACTERS, not hazards (R8): greedy / guilty / oafish; the bigger the fish,
// the MORE oblivious. Size scales comedy, never menace. No predator animation/sound path.
// `key`/`label`/`character` are data identifiers (consumed by engine logic / config); only
// `voice` is player-facing and is resolved per-locale by the caller.
export const FISH_TIERS = [
  { key: 'nibbler', label: 'tiny', character: 'guilty' },
  { key: 'snacker', label: 'medium', character: 'apologetic glutton' },
  { key: 'oaf', label: 'big', character: 'placid oaf' },
];

// Stretch label keys mirror config.stretch.labels; the per-stretch emotion arc is fixed.
const STRETCH_KEYS = ['stretchGentleShore', 'stretchDragonflyBend', 'stretchMiddle', 'stretchFarReaches'];

// Threshold → catalog key, per gift kind. Ascending; the accessor returns the best match.
const FLOWER_MILESTONE_KEYS = [
  { at: 3, key: 'flowerMilestone3' },
  { at: 5, key: 'flowerMilestone5' },
];
const DRAGONFLY_MILESTONE_KEYS = [
  { at: 1, key: 'dragonflyMilestone1' },
  { at: 3, key: 'dragonflyMilestone3' },
  { at: 5, key: 'dragonflyMilestone5' },
];

// ============================================================= pure accessors

// { narration, emotion } for the stretch the boat just entered. Always defined for 0..3.
// `names` ({ frogName, fernName }) interpolates the player's frogs into the narration (CATS-82).
export function stretchBeat(stretchIndex, locale, names) {
  const i = Math.min(Math.max(stretchIndex, 0), STRETCH_KEYS.length - 1);
  return {
    label: t(STRETCH_KEYS[i], locale),
    narration: t(`stretch${i}Narration`, locale, nameParams(names, locale)),
    emotion: t(`stretch${i}Emotion`, locale),
  };
}

// Best matching milestone line for a gift count, or null if no threshold reached.
// `kind` is 'flower' | 'dragonfly'. Fire when the returned line CHANGES for a given kind.
export function milestoneFor(kind, count, locale, names) {
  const table = kind === 'dragonfly' ? DRAGONFLY_MILESTONE_KEYS : FLOWER_MILESTONE_KEYS;
  let hitKey = null;
  for (const m of table) if (count >= m.at) hitKey = m.key;
  return hitKey ? t(hitKey, locale, nameParams(names, locale)) : null;
}

// Flavor for a fish eating flowers (event.kind === 'fish_ate'). `lost` is how many it ate.
// Scales comedy by tier — bigger fish framed as more oblivious, never as a bigger threat.
export function fishAteLine(tier, lost, locale) {
  const i = tier === 0 ? 0 : tier === 1 ? 1 : 2;
  // chunk noun: 'a flower' (one) / 'a pair of flowers' (few) / 'several flowers' (many)
  const what = tCount('fishAteChunk', locale, lost);
  return t(`fishAte${i}`, locale, { what });
}

// Flavor for the boat STUN (event.kind === 'fish_hit'). The boat shudders; the frog guards the
// bouquet. No predator energy — the fish bumped a boat, not a victim.
export function fishBumpLine(tier, locale, names) {
  const i = tier === 0 ? 0 : tier === 1 ? 1 : 2;
  return t(`fishBump${i}`, locale, nameParams(names, locale));
}

// Dragonfly loss flavor (R9). Every loss reads as the gift WANDERING OFF — the dragonfly
// lost interest — never as the player "destroying" it. CATS-135: a shore bump spills exactly
// one dragonfly (dragonflies_lost_per_border_bump: 1, clamped to the jar), so the line is a
// single fixed key — no count noun, no plural pool.
export function dragonflyLostLine(locale) {
  return t('dragonflyLost', locale);
}

// Optional positive charm line on collecting a gift. Returns null at most counts so it
// stays a occasional treat, not chatter.
export function collectLine(kind, totalAfter, locale) {
  if (totalAfter <= 0) return null;
  if (totalAfter % 2 !== 1) return null; // fire on odd counts only: 1, 3, 5…
  const prefix = kind === 'dragonfly' ? 'dragonflyCollect' : 'flowerCollect';
  return t(`${prefix}${(totalAfter - 1) % 3}`, locale);
}

// --- tone lint (call while wiring / in review) --------------------------------
// Returns the list of forbidden framings found in a line. Empty array = clean. This is the
// separable "is this wholesome?" check — run it over any line before it ships to the player.
export function lintTone(line) {
  if (!line) return [];
  const lower = line.toLowerCase();
  return TONE.forbiddenFramings.filter((w) => lower.includes(w));
}
