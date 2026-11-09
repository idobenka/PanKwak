// systems/narrative.js — the bridge between story.js (pure DATA) and the live game.
//
// story.js is content + tone guardrails only: it never imports the engine, never mutates
// world state, never draws. This module is the consuming half of that contract (CATS-57): it
// owns the small amount of RUNTIME state a charm pass needs — which milestone line we already
// showed per kind, the transient beat feed the player reads in-play, and the arrival-smile
// animation clock that the headline beat drives.
//
// Everything here is driven from the engine's own events (game.js step / screens.js arrival),
// so the wiring stays "content + hooks," not balance: no scalar in CONFIG is touched. The
// tone lint runs over every line before it enters the feed so a forbidden framing can never
// reach the player (R7/R9).

import * as story from '../story.js';

// A transient in-play beat. `t` is seconds-since-emit (drives the fade-in); `text` is already
// tone-linted. The feed shows the most recent few.
// CATS-114 follow-up 2: lines NO LONGER expire on a timer — a line stays on the board until a
// newer line pushes it past the top slot (feed.shift at FEED_MAX). "Disappears only after it
// reached the upper line and a new line is added." The board itself is always visible
// (ui/narrative.js), so an empty feed just shows an empty board.
const FEED_MAX = 3;
const FADE_IN_SECONDS = 0.25; // a new line eases in fast; then holds at full

// CATS-114: same-event repeats. The pools are tiny (3 lines per event kind), so back-to-back
// identical events (a chain of tier-0 fish bumps, a swerve that spills twice in a row) drew
// the SAME line twice in a row — reads as a glitch, not narration. A line identical to one
// shown within this window is suppressed; after it elapses the same text may fire again.
const REPEAT_SUPPRESS_SECONDS = 10;

export function createNarrative() {
  // last milestone line shown per kind ('flower' | 'dragonfly') — fire only on CHANGE
  const lastMilestone = { flower: null, dragonfly: null };

  // the in-play beat feed (newest last). Each entry: { text, t, tone }
  const feed = [];

  // CATS-114: the text last shown + when (seconds on the update clock), for repeat
  // suppression. Only the most recent line per text is tracked — the window is short
  // enough that a two-deep history would only ever shadow itself.
  let lastShownAt = -Infinity;
  let lastShownText = null;
  let clockSeconds = 0;

  // arrival animation state — owned here so the UI can read one clock. Set by beginArrival().
  // phase: 'idle' until arrival begins, then a monotonically increasing clock (seconds).
  // CATS-134: the beat no longer carries authored text (the end overlays show titles only);
  // this is the staged-scene clock + which outcome it is ('won' picks the halo-only scene,
  // 'arrived_empty' also reveals the illustration).
  const arrival = { active: false, clock: 0, won: false };

  function reset() {
    lastMilestone.flower = null;
    lastMilestone.dragonfly = null;
    feed.length = 0;
    lastShownAt = -Infinity;
    lastShownText = null;
    clockSeconds = 0;
    arrival.active = false;
    arrival.clock = 0;
    arrival.won = false;
  }

  // Push one line into the feed after tone-linting it. A forbidden framing never ships: we
  // drop the beat and log nothing rather than break the R7/R9 contract. (lintTone stays green
  // by construction because story.js is clean; this is the belt-and-suspenders gate.)
  // CATS-114: identical back-to-back lines are dropped — see REPEAT_SUPPRESS_SECONDS.
  function push(text, tone = 'neutral') {
    if (!text) return;
    if (story.lintTone(text).length > 0) return;
    if (text === lastShownText && (clockSeconds - lastShownAt) < REPEAT_SUPPRESS_SECONDS) return;
    lastShownText = text;
    lastShownAt = clockSeconds;
    feed.push({ text, t: 0, tone });
    while (feed.length > FEED_MAX) feed.shift();
  }

  // --- consumption contract hooks (called by game.js) -------------------------

  // On stretch entry. i = the new stretch index. locale resolves the narration language.
  // names ({ frogName, fernName }) interpolates the player's frogs into the narration (CATS-82).
  function onStretch(i, locale, names) {
    const beat = story.stretchBeat(i, locale, names);
    if (beat && beat.narration) push(beat.narration, 'stretch');
  }

  // On a gift collect. Fires the milestone line only when it CHANGES, plus the occasional
  // positive charm line. kind: 'flower' | 'dragonfly'; totalAfter = the count after collect.
  function onCollect(kind, totalAfter, locale, names) {
    const m = story.milestoneFor(kind, totalAfter, locale, names);
    if (m && m !== lastMilestone[kind]) {
      lastMilestone[kind] = m;
      push(m, 'milestone');
    }
    // optional positive mirror — scattered, never chatty
    const charm = story.collectLine(kind, totalAfter, locale);
    if (charm) push(charm, 'collect');
  }

  // On collision events from one step. events = world.lastEvents.
  function onCollisionEvents(events, locale, names) {
    if (!events || !events.length) return;
    for (const e of events) {
      if (e.kind === 'fish_ate') push(story.fishAteLine(e.tier, e.lost, locale), 'fish');
      else if (e.kind === 'fish_hit') push(story.fishBumpLine(e.tier, locale, names), 'fish');
    }
  }

  // On dragonfly border-loss (a shore bump, CATS-128). A bump slips exactly one dragonfly
  // (CATS-135); `lost` stays as the gate so a no-loss bump (empty jar) draws no line.
  function onDragonflyLost(lost, locale) {
    if (lost > 0) push(story.dragonflyLostLine(locale), 'loss');
  }

  // --- arrival (called once when status flips to won/arrived_empty) ------------

  // status = 'won' | 'arrived_empty'. Begins the staged-scene clock. CATS-134 dropped the
  // authored beat copy — the end overlays show titles only — so only the outcome is kept.
  function beginArrival(status) {
    arrival.active = true;
    arrival.clock = 0;
    arrival.won = status === 'won';
  }

  // advance the transient feed + the arrival clock. dt = seconds.
  function update(dt) {
    clockSeconds += dt;
    for (const b of feed) b.t += dt;
    if (arrival.active) arrival.clock += dt;
  }

  // where the in-play feed should anchor (bottom-center, above the loss readout). The UI reads
  // feed + arrival; this module never draws.
  function snapshot() {
    return {
      feed: feed.map((b) => ({ text: b.text, tone: b.tone, alpha: feedAlpha(b.t) })),
      arrival: arrival.active
        ? { clock: arrival.clock, won: arrival.won }
        : null,
    };
  }

  function feedAlpha(t) {
    // CATS-114 follow-up 2: fade IN fast, then hold at full until pushed off the board —
    // no timed fade-out (the board is permanent; only displacement removes a line).
    return Math.min(1, t / FADE_IN_SECONDS);
  }

  return {
    reset,
    onStretch,
    onCollect,
    onCollisionEvents,
    onDragonflyLost,
    beginArrival,
    update,
    snapshot,
  };
}
