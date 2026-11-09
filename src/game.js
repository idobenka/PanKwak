// game.js — the game loop + Phase 1 progression orchestration.
//
// Fixed-timestep update + requestAnimationFrame render. The fixed timestep is load-bearing
// (architecture §TL;DR): the sim must step identically every frame so feel is deterministic
// regardless of display refresh rate. We accumulate real time and step the simulation in
// fixed CONFIG.fixedDt chunks, capping the catch-up so a stall can't spiral.
//
// Progression orchestration on top of the Phase 0 boat/border-loss/gift pipeline:
//   1. Stretch tracking — the boat's x maps to one of 4 stretches; that decides the active
//      spawn profile (the layered onboarding). helpers.stretchFor(x) is the single resolver.
//   2. Fish-hit grace — after a fish bumps the boat (a stun), the boat is briefly immune to
//      further fish contact so the stun can play out. The boat never teleports or resets:
//      a fish hit just wobbles it, the crossing keeps going. (The old checkpoint/soft-respawn
//      machinery is gone — fish no longer eat flowers, so a "drained bouquet" can't happen.)
//   3. CATS-128 border loss — dragonflies spill when the hull BUMPS a shore wall (the same
//      recorded wallBumps that drive the bump hop), not on sharp steering. The
//      finish approach (the right cap) is exempt: the lake funnels to the win line there,
//      so crossing the finish never costs the jar.

import { CONFIG } from './config.js';
// Name identity (CATS-80, CATS-111). Canonical defaults are per-locale (Mr. Kwak /
// Пан Квак; My best friend / Мій найкращий друг); the welcome card sets the recipient's
// name before the first run. They live on the world so a live run's postcard payload reads them.
import { defaultFrogName, defaultFernName, canonicalName } from './config.js';
import { createBoat } from './entities/boat.js';
import { createGifts } from './systems/gifts.js';
import { createTimer } from './systems/timer.js';
import { createSky } from './systems/sky.js';
import { createSpawner } from './systems/spawner.js';
import { createCollisions } from './systems/collisions.js';
import { createNarrative } from './systems/narrative.js';
import { finishSafeFromX, beachProximity } from './geometry.js';
import { createFx } from './systems/fx.js';
import { rerollDecor } from './systems/decor.js';
import { createAudio } from './systems/audio.js';
import { updateFlower } from './entities/flower.js';
import { updateDragonfly } from './entities/dragonfly.js';
import { updateFish } from './entities/fish.js';

// --- stretch math (pure helpers) ---
// The crossing spans homeX..shoreX. Stretch bounds are cumulative fractions. stretchFor(x)
// returns the 0-based stretch index the boat currently occupies.
function crossingSpan(cfg) {
  return cfg.world.shoreX - cfg.world.homeX;
}
function stretchFor(cfg, x) {
  const frac = (x - cfg.world.homeX) / crossingSpan(cfg);
  const bounds = cfg.stretch.bounds;
  for (let i = 0; i < bounds.length; i++) {
    if (frac < bounds[i]) return i;
  }
  return bounds.length; // last stretch (index = #bounds)
}

export function createGame() {
  const cfg = CONFIG;
  const boat = createBoat(cfg);
  const gifts = createGifts(cfg);
  const timer = createTimer(cfg);
  const sky = createSky(cfg);
  const spawner = createSpawner(cfg);
  const collisions = createCollisions(cfg);
  const narrative = createNarrative();
  // CATS-60: the reusable visual-effect layer. The three environmental reactions
  // (CATS-61 sparkles/shine, CATS-62 ripple) spawn into `fx.effects`; render.js paints them.
  const fx = createFx(cfg);
  // CATS-94: the audio engine — fx's sibling on world (architecture §2). Gameplay calls
  // audio.play(<named event>) only; every oscillator/gain lives inside the factory. Audio
  // schedules off the Web Audio clock and writes nothing back into the sim (§3.4).
  const audio = createAudio(cfg);

  const world = {
    boat,
    gifts,
    timer,
    sky,
    flowers: [],
    dragonflies: [],
    fish: [],
    status: 'idle', // idle | playing | won | arrived_empty | lost
    // CATS-128: the steering gauge's raw signal — px from the hull to the nearest TAXABLE
    // beach line (top/bottom). Infinity inside the finish-safe zone. Written each step();
    // ui/hud.js maps it to the green/yellow/orange/red bands (pure draw).
    beachProximity: Infinity,
    // CATS-60: world-space effect list (render reads fx.effects) + the deterministic sim clock the
    // per-type throttle intervals read. fxNow advances on the fixed timestep; spawn(type,x,y,now)
    // is the single entry point sibling sub-issues call at their hook points.
    fx,
    fxNow: 0,
    // CATS-94: the named-event audio surface (audio.play / startBed / setBedProgress /
    // setMuted). Present on world so main.js can drive the autoplay unlock, the bed, and
    // the mute toggle without gameplay systems constructing audio (architecture §2).
    audio,
    // Progression state (read by HUD/screens/render).
    stretchIndex: 0,
    stretchLabel: cfg.stretch.labels[0],
    invulnTimer: 0, // >0 = boat is in post-fish-hit grace (ignores further fish contact)
    lastEvents: [], // collision events from the most recent step (for screens/flavor)
    playSeconds: 0,
    narrative, // the charm-pass controller (CATS-57) — UI reads narrative.snapshot()
    // The player-facing names (CATS-80 welcome card, CATS-111). The frog is the fixed
    // Mr. Kwak; the recipient comes from the card's single To field. Defaults are canonical
    // for the bootstrap locale; the card overrides them on Start. reset() does NOT touch
    // these — a chosen name survives a replay so the end postcard still names the frogs.
    frogName: defaultFrogName(cfg.locale),
    fernName: defaultFernName(cfg.locale),
    // { frogName, fernName } bundle kept in sync by setNames() for the narrative/story hooks
    // (CATS-82), which thread the player's frogs into the in-play beats. postcard.js and the
    // overlays read frogName/fernName directly; this is just the convenience shape the hooks take.
    frogNames: { frogName: defaultFrogName(cfg.locale), fernName: defaultFernName(cfg.locale) },
    // CATS-113: the wake trace — fading foam marks dropped behind the boat as it swims.
    // World-space {x, y, age} marks aged on the fixed timestep (see step()); render.js paints
    // them under the boat. `wakeTimer` is the drop-clock accumulator.
    wake: [],
    wakeTimer: 0,
    // CATS-128 follow-up: transient dragonflies flying away from the frog — one per slipped
    // dragonfly at the loss site, always departing LEFT (CATS-132). { x, y, vx, vy, age,
    // flitPhase }. Moved + aged on the fixed timestep (below, the wake pattern); drawn pure
    // in render.js; capped by cfg.escapedDragonfly.maxLive.
    escapedDragonflies: [],
  };

  let accumulator = 0;
  let last = null;
  // CATS-128: frames until the next border-loss spill is allowed, so a boat GRINDING along
  // a wall loses on a cadence (balance.border_loss_cooldown_frames) instead of per frame.
  let _borderLossCooldown = 0;

  // Seed the initial world so the FIRST run starts in bloom too, identical to every replay.
  // Without this, the lake is empty on a fresh load (the flower field only got laid down on
  // reset(), which is only reached via the replay path), so a brand-new playthrough and a replay
  // diverged. reset() is idempotent over the default initial state, so calling it here makes the
  // start and the replay land on the exact same world (CATS-84).
  reset();

  function reset() {
    boat.reset();
    gifts.reset();
    timer.reset();
    sky.reset();
    spawner.reset();
    // CATS-123 follow-up: a fresh shuffle of the grass-bank decor every run — each
    // replay lays the meadow out again (stable within the run; see systems/decor.js).
    rerollDecor();
    world.flowers = [];
    world.dragonflies = [];
    world.fish = [];
    // CATS-76 review: pre-fill the lake with a field of flowers so a run starts in bloom.
    world.flowers = spawner.seedFlowers();
    world.status = 'idle';
    world.beachProximity = Infinity;
    world.stretchIndex = 0;
    world.stretchLabel = cfg.stretch.labels[0];
    world.invulnTimer = 0;
    world.lastEvents = [];
    world.playSeconds = 0;
    world.wake = [];
    world.wakeTimer = 0;
    world.escapedDragonflies = [];
    narrative.reset();
    fx.reset();
    world.fxNow = 0;
    _borderLossCooldown = 0;
    // CATS-94: fade the ambient bed out on restart so a fresh run starts from silence
    // (no leak across restarts). Short one-shots still sounding from the ended run
    // finish naturally — they retire on the Web Audio clock, outside the sim.
    audio.reset();
    accumulator = 0;
    last = null;
  }

  function startIfReady(input) {
    if (world.status === 'idle' && input.hasStarted()) {
      world.status = 'playing';
    }
  }

  // One fixed simulation step.
  function step(inputSnap) {
    if (world.status !== 'playing') return;

    // Tick down post-fish-hit invulnerability grace.
    if (world.invulnTimer > 0) {
      world.invulnTimer = Math.max(0, world.invulnTimer - cfg.fixedDt);
    }

    // 1. boat physics (velocity + the shore-wall clamp; records wallBumps)
    boat.update(inputSnap, cfg.fixedDt);

    // CATS-132: the lake-border BUMP now has exactly ONE visual reaction — the 3-hop bounce
    // started inside boat.update (boat.state.wallBumps records it for the spill below). The
    // contact-point ripple and the pad squash were removed with it, so the shore touch reads
    // as the hop alone.

    // --- stretch tracking: did the boat enter a new stretch? ---
    const newStretch = stretchFor(cfg, boat.state.x);
    if (newStretch !== world.stretchIndex) {
      world.stretchIndex = newStretch;
      world.stretchLabel = cfg.stretch.labels[Math.min(newStretch, cfg.stretch.labels.length - 1)];
      // CATS-57: charm pass — one narration beat on stretch entry.
      narrative.onStretch(world.stretchIndex, cfg.locale, world.frogNames);
      // CATS-113: entering The Far Reaches guarantees at least one big fish in the water
      // (one-shot per run; a no-op if a big fish is already swimming or it already fired).
      const guaranteed = spawner.checkFarReachesFish(world.stretchIndex, boat.state.x, world.fish);
      if (guaranteed) world.fish.push(guaranteed);
    }

    // --- CATS-113: the wake trace. Drop a fading foam mark behind the boat on a fixed cadence
    //     while it moves; age + retire marks on the fixed timestep (determinism, like fx.js).
    //     The mark sits slightly BEHIND the boat (opposite its velocity) so the trail reads as
    //     "where it came from," and never right under the frog sprite.
    {
      const speed = Math.hypot(boat.state.vx + cfg.world.autoForward, boat.state.vy);
      world.wakeTimer += cfg.fixedDt;
      if (speed >= cfg.wake.minSpeed && world.wakeTimer >= cfg.wake.dropSeconds) {
        world.wakeTimer = 0;
        const vx = boat.state.vx + cfg.world.autoForward;
        const vy = boat.state.vy;
        const len = Math.hypot(vx, vy) || 1;
        const back = boat.radius() * 1.1; // just behind the hull, not under Mr. Kwak
        world.wake.push({
          x: boat.state.x - (vx / len) * back,
          y: boat.state.y - (vy / len) * back,
          age: 0,
        });
        if (world.wake.length > cfg.wake.maxMarks) world.wake.shift();
      }
    }

    // 2. CATS-128: border loss + the beach-proximity signal for the steering HUD.
    //    Dragonflies spill ONLY when the hull bumps a shore wall — the wallBumps boat.js
    //    records above its impact gate (a boat merely resting on a wall never fires). How
    //    sharply the boat steers is irrelevant now; movement itself is free.
    //    The FINISH approach is exempt: past finishSafeFromX the lake narrows to the win
    //    line, the shores funnel the boat to shoreX, and crossing the finish line must
    //    never cost the jar. The home wall and the top/bottom beach lines stay taxable.
    //    A fish stun does NOT spill dragonflies either — the wobble rocks only the boat.
    const finishSafe = boat.state.x >= finishSafeFromX(cfg);
    if (finishSafe) {
      world.beachProximity = Infinity; // the meter reads green through the finish
    } else {
      world.beachProximity = beachProximity(cfg, boat.state.x, boat.state.y, boat.radius());
    }

    for (const bump of boat.state.wallBumps) {
      if (finishSafe) continue; // the finish approach never spills
      if (_borderLossCooldown > 0) continue; // a held scrape spills on a cadence, not per frame
      _borderLossCooldown = cfg.balance.border_loss_cooldown_frames;
      const slipped = gifts.loseDragonflies(cfg.balance.dragonflies_lost_per_border_bump);
      // CATS-128 follow-up: one transient dragonfly per slipped count takes off from the
      // boat, so the loss reads as "it flew away from the frog," never "it vanished."
      // Capped; the movement/aging lives in frame().
      for (let i = 0; i < slipped; i++) {
        const esc = cfg.escapedDragonfly;
        // CATS-132: the escapee always departs LEFT (toward the home shore, back the way
        // the frog came) — never sideways toward the beach the boat just hit.
        world.escapedDragonflies.push({
          x: boat.state.x,
          y: boat.state.y,
          vx: -esc.speed,
          vy: 0,
          age: 0,
          flitPhase: Math.random() * Math.PI * 2,
        });
        if (world.escapedDragonflies.length > esc.maxLive) world.escapedDragonflies.shift();
      }
      narrative.onDragonflyLost(slipped, cfg.locale);
      // CATS-132: the loss-site ripple + sparkle (stars) are GONE — the dragonfly flying
      // away IS the whole loss beat now. TONE-LOCKED (R9): the flight alone keeps the
      // moment calm, never a reward flash or a warning.
      // CATS-94: L1 dragonfly spill — the comic "fluttered away" (R9 tone-critical,
      // architecture §4 row L1). Same guarded site: fires only on a real loss, and the
      // engine's throttle collapses a sustained scrape to one sound.
      audio.play('dragonfly_spill');
    }
    if (_borderLossCooldown > 0) _borderLossCooldown -= 1;

    // 3. spawn + drift entities. Spawn composition is keyed to the CURRENT stretch.
    const profile = cfg.spawn.profiles[world.stretchIndex];
    const spawnCtx = {
      stretchIndex: world.stretchIndex,
      profile,
      boatX: boat.state.x,
      fishPositions: world.fish
        .filter((f) => f.x > boat.state.x - 40)
        .slice(-6)
        .map((f) => ({ x: f.x, y: f.y, tier: f.tier })),
    };
    const spawned = spawner.update(cfg.fixedDt, spawnCtx);
    world.flowers.push(...spawned.flowers);
    world.dragonflies.push(...spawned.dragonflies);
    world.fish.push(...spawned.fish);
    // CATS-76: pass the boat context to the live-entity updaters so fish follow and dragonflies
    // flee the frog. progress (0..1 across the crossing) ramps the fish sharpness near the finish.
    // Flowers are stable and ignore the context.
    const progress = (boat.state.x - cfg.world.homeX) / crossingSpan(cfg);
    const entityCtx = {
      boatX: boat.state.x,
      boatY: boat.state.y,
      progress,
      behavior: cfg.behavior,
    };
    world.flowers = spawner.driftAndUpdate(world.flowers, cfg.fixedDt, updateFlower, entityCtx);
    world.dragonflies = spawner.driftAndUpdate(world.dragonflies, cfg.fixedDt, updateDragonfly, entityCtx);
    world.fish = spawner.driftAndUpdate(world.fish, cfg.fixedDt, updateFish, entityCtx);

    // 4. collisions + proximity collection. Invulnerable (post-fish-hit grace) → skip fish
    //    contact (no eat, no stun) but still collect gifts so the grace frame isn't dead.
    //    Snapshot gift counts before resolve() so the charm pass can react to each collect.
    const flowersBefore = gifts.state.flowers;
    const dragonfliesBefore = gifts.state.dragonflies;
    const events = collisions.resolve(
      boat, world.flowers, world.dragonflies, world.fish, gifts,
      { invulnerable: world.invulnTimer > 0, fx, fxNow: world.fxNow, audio },
    );
    world.lastEvents = events;

    // CATS-57: charm pass — gift milestones (fire once per NEW high per kind) + collision
    // flavor (fish ate / fish bumped the boat).
    if (gifts.state.flowers > flowersBefore) {
      narrative.onCollect('flower', gifts.state.flowers, cfg.locale, world.frogNames);
    }
    if (gifts.state.dragonflies > dragonfliesBefore) {
      narrative.onCollect('dragonfly', gifts.state.dragonflies, cfg.locale, world.frogNames);
    }
    narrative.onCollisionEvents(events, cfg.locale, world.frogNames);

    // CATS-94: L2 fish munch — the goofy placid snack (R8/R9 tone-critical, architecture
    // §4 row L2). One per fish_ate event (tier-sized by the engine via the event's tier);
    // the throttle collapses a multi-fish frame's stack.
    for (const e of events) {
      if (e.kind === 'fish_ate') audio.play('fish_munch', { tier: e.tier });
    }

    // 4b. a fish hit this step → start the post-hit grace window so the stun can play out
    //     uninterrupted (and so one fish can't immediately re-bump). The stun itself is
    //     applied inside collisions via boat.applyFishHit.
    const fishHits = events.filter((e) => e.kind === 'fish_hit');
    if (fishHits.length) {
      world.invulnTimer = cfg.fishGrace.invulnSeconds;
      // CATS-62: a meet-ripple burst at the boat↔fish contact point — an amplification of the
      // ambient ripple under the fish (render.js drawFish), not a replacement. TONE-LOCKED (R9):
      // same calm ring family; the larger radius (params.radius) is what marks it as a burst.
      // The per-type throttle collapses a multi-fish frame to one spawn.
      const hit = fishHits[0];
      const cx = (hit.x + boat.state.x) / 2;
      const cy = (hit.y + boat.state.y) / 2;
      fx.spawn('ripple', cx, cy, world.fxNow, { radius: 48 });
      // CATS-94: L3 boat stun — the gentle water-slosh / comic spin (architecture §4 row
      // L3). The invuln window + per-fish cooldown already prevent re-fire: one stun,
      // one slosh.
      audio.play('boat_stun');
    }

    // 5. soft sunset deadline
    timer.update(cfg.fixedDt);

    // 6. win/lose checks
    // Win = reach the far shore AND arrive with ≥1 gift (not empty-handed). Reaching shore
    // empty-handed is a WARM THIRD STATE — the soft "the party will wait" anticlimax
    // (Narrative R7): Mr. Kwak made it, but the gift is the whole premise of Concept 4, so it's
    // neither a win nor a loss. config.gifts.minGiftsToWin already encodes this stance.
    if (boat.state.x >= cfg.world.shoreX) {
      world.status = gifts.hasEnoughToWin() ? 'won' : 'arrived_empty';
    } else if (timer.state.expired) {
      world.status = 'lost';
    }

    // CATS-57: the arrival smile beat begins the instant the crossing ends (won OR the warm
    // empty-handed anticlimax). It drives the staged scene in ui/narrative.js and the finish
    // camera pan. Fires once per arrival — guarded by the controller's own `active` flag so
    // a held end state can't restart it every step.
    if ((world.status === 'won' || world.status === 'arrived_empty') && !narrative.snapshot().arrival) {
      narrative.beginArrival(world.status);
    }

    // --- play clock (cosmetic; the onboarding-hint fade died with the hint itself) ---
    if (world.status === 'playing') {
      world.playSeconds += cfg.fixedDt;
    }
  }

  // Drive the loop from rAF with a real-time timestamp (ms).
  // `opts.canStart` (default true) — when false, the idle→playing auto-start is suppressed so
  // a modal that owns the input (the welcome card, CATS-80) can gate the start itself.
  function frame(timestampMs, input, opts = {}) {
    if (last === null) last = timestampMs;
    let deltaMs = timestampMs - last;
    last = timestampMs;
    // cap catch-up to avoid spiral-of-death after a tab stall
    if (deltaMs > 250) deltaMs = 250;

    accumulator += deltaMs / 1000;
    if (opts.canStart !== false) startIfReady(input);

    const inputSnap = input.snapshot();
    while (accumulator >= cfg.fixedDt) {
      step(inputSnap);
      // Cloud drift advances every fixed step regardless of play state — clouds are ambient
      // scenery (not a gameplay signal), so they drift on the menu too. Deterministic: driven
      // by the fixed timestep, not performance.now() in render (architecture §TL;DR).
      sky.update(cfg.fixedDt);
      // CATS-57: the charm feed fades and the arrival-smile clock advances every fixed step
      // regardless of play state — the arrival animation must keep landing on the end overlay
      // (step() returns early once status leaves 'playing'), so it ticks here, not in step().
      narrative.update(cfg.fixedDt);
      // CATS-60: age + retire effects on the fixed timestep (determinism, never wall-clock).
      // Advances regardless of play state so an effect spawned at the very end of a run still
      // retires cleanly under the end overlay. world.fxNow is the sim clock spawn() intervals read.
      fx.update(cfg.fixedDt);
      world.fxNow += cfg.fixedDt;
      // CATS-113: age + retire the wake marks here (not in step()) for the same reason — a
      // trail laid at the very end of the run still fades out under the end overlay.
      for (let i = world.wake.length - 1; i >= 0; i--) {
        world.wake[i].age += cfg.fixedDt;
        if (world.wake[i].age >= cfg.wake.lifetime) world.wake.splice(i, 1);
      }
      // CATS-128 follow-up: the escaped dragonflies keep flying + fading under the end
      // overlay too, so a loss at the last moment still plays its full beat.
      const esc = cfg.escapedDragonfly;
      for (let i = world.escapedDragonflies.length - 1; i >= 0; i--) {
        const d = world.escapedDragonflies[i];
        d.age += cfg.fixedDt;
        d.flitPhase += cfg.fixedDt * 6;
        d.x += d.vx * cfg.fixedDt;
        d.y += d.vy * cfg.fixedDt;
        if (d.age >= esc.seconds) world.escapedDragonflies.splice(i, 1);
      }
      accumulator -= cfg.fixedDt;
    }

    if (input.consumeRestart()) {
      reset();
      // CATS-143 follow-up: the R-restart used to leave the music silent. reset() fades
      // the ambient bed out (fresh run starts from silence), and only the postcard's
      // Play-again path restarted it (froggame:replay → main.js → startBed). Restart it
      // here so BOTH replay paths bring the bed back. Idempotent + parks its intent
      // while the context is still suspended (audio.js startBed).
      audio.startBed();
    }
  }

  // Set the player-chosen names from the welcome card (CATS-80). Empty → the locale's
  // canonical default (CATS-111).
  function setNames(frogName, fernName) {
    world.frogName = canonicalName(frogName, defaultFrogName(cfg.locale));
    world.fernName = canonicalName(fernName, defaultFernName(cfg.locale));
    world.frogNames = { frogName: world.frogName, fernName: world.fernName };
  }

  // A freshly-created game must already be in the reset state: the FIRST run starts from the
  // welcome card by flipping idle→playing WITHOUT calling reset(), whereas every replay goes
  // THROUGH reset() (which seeds the lake with flowers). Constructing into reset() makes the
  // first run identical to a replay — so the lake always starts in bloom, never empty.
  reset();

  return { world, reset, frame, setNames };
}
