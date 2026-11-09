// systems/spawner.js — procedural flower / dragonfly / fish generation across stretches.
//
// Phase 1: the spawner is stretch-aware. WHAT spawns (fish tiers, whether dragonflies
// exist, density, lane tightness, gift clustering) is keyed off the stretch the boat
// currently occupies — that is the layered onboarding, expressed as data in
// config.spawn.profiles. See game_design.md §Concept 4 "Progression" and architecture.md
// §"Design principles" #5 (spawner/timer/collision are independent so the stretch
// progression can change without touching rendering).
//
// WHERE spawns (CATS-76): new entities appear from the RIGHT (far/party) shore's side —
// just past the right edge of the visible screen (rightShoreLead px), clamped inside the lake —
// so they swim leftward INTO view from the shore the boat is heading toward, instead of popping
// into existence mid-lake. Entities still drift leftward toward the advancing boat. All cadences
// are scalars in the active stretch profile.

import { createFlower } from '../entities/flower.js';
import { createDragonfly } from '../entities/dragonfly.js';
import { createFish } from '../entities/fish.js';
import { swimBoundsAt, lakeMidY } from '../geometry.js';

function pickWeighted(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function createSpawner(cfg) {
  const { world, spawn, camera } = cfg;
  // Per-type accumulators. These count up in dt and are compared to the ACTIVE stretch's
  // interval, so when the stretch changes the cadence changes with it but the accumulators
  // carry over smoothly (no spawn burst on a stretch boundary).
  const state = {
    tFlower: 0,
    tDragonfly: 0,
    tFish: 0,
    // The lane line the fish currently herd toward. Drifts slowly so tight lanes still feel
    // like water, not a grid. Updated when a fish actually spawns. Seeded to the lake's center
    // line (lakeMidY), independent of pixel width — survives the resize.
    laneY: lakeMidY(cfg),
  };

  function reset() {
    state.tFlower = 0;
    state.tDragonfly = 0;
    state.tFish = 0;
    state.laneY = lakeMidY(cfg);
    // CATS-113: re-arm the one-shot Far-Reaches big-fish guarantee.
    _farReachesArmed = true;
  }

  // CATS-113: "at least one big fish once the frog passes The Far Reaches." Called by game.js
  // each step with the current stretch + boat x. One-shot per run: the first time the boat
  // enters The Far Reaches, if no LIVE big fish is already swimming, one is spawned ahead of
  // the boat through the same right-side entry the regular spawner uses. Returns the fish to
  // merge into world.fish, or null (not yet time / guarantee already satisfied / already fired).
  let _farReachesArmed = true;
  function checkFarReachesFish(stretchIndex, boatX, liveFish) {
    const fr = spawn.farReachesBigFish;
    if (!fr || !_farReachesArmed) return null;
    if (stretchIndex !== fr.stretchIndex) return null;
    _farReachesArmed = false;
    // Guarantee satisfied without a new spawn if a big fish is already in the water.
    if (liveFish.some((f) => f.tier === fr.tier)) return null;
    const radius = spawn.fishRadiusPerTier[fr.tier];
    // Enter just inside the lake, ahead of the boat — visible quickly but not on top of Mr. Kwak.
    const spawnX = Math.min(world.shoreX - radius - 8, boatX + fr.offsetAhead);
    const b = swimBoundsAt(cfg, spawnX, radius);
    const y = (b.bottom - b.top < radius * 2)
      ? lakeMidY(cfg)
      : rand(b.top + radius, b.bottom - radius);
    return createFish(spawnX, y, fr.tier, radius);
  }

  // Returns arrays of newly-spawned entities to merge into the world lists.
  // `ctx` = { stretchIndex, profile, boatX, fishPositions } — provided by game.js each step.
  function update(dt, ctx) {
    const out = { flowers: [], dragonflies: [], fish: [] };
    const profile = ctx.profile;
    if (!profile) return out;

    // CATS-76: spawn from the RIGHT (far/party) shore's side, not the middle of the lake. New
    // entities enter just PAST the right edge of the visible screen (so they swim leftward into
    // view from the right, the direction the boat is heading toward) rather than popping into
    // existence on-screen. The right edge is derived from the same render-only camera formula
    // (computeCameraLeft in render.js — the right clamp tracks the boat to the win line,
    // CATS-98 review follow-up; the left clamp reads −homeLead, CATS-88); `rightShoreLead` is
    // how far past that edge they appear.
    // Clamped to stay inside the lake (≤ shoreX) so nothing spawns on/past the party shore.
    const camLeft = Math.max(-(camera.homeLead || 0), Math.min(
      world.shoreX - camera.leadFraction * camera.viewportWidth,
      ctx.boatX - camera.leadFraction * camera.viewportWidth,
    ));
    const rightEdge = camLeft + camera.viewportWidth;
    // CATS-97: the right-side clamp is per-radius — the spawn x is the CENTER, so it must stay
    // ≤ shoreX − r (a fixed shoreX − 24 let a tier-2 fish, r = 34, spawn with its nose 10 px
    // past the party tip onto the grass).
    const spawnXFor = (r) => Math.min(world.shoreX - r - 8, rightEdge + spawn.rightShoreLead);

    // CATS-87: once the finish (the party shore at shoreX) is on-screen, stop spawning. With the
    // camera clamped so the far shore's right edge meets the viewport at the win line, the arrival
    // reveal reads cleanly as "destination ahead" — fresh fish/flowers popping in beside it would
    // be clutter right at the moment the run resolves. The accumulators below are NOT advanced
    // while suppressed, so when the finish leaves view (it can't in a forward-only crossing, but
    // the guard is still safe) the cadence resumes without a burst. Entities already in play keep
    // drifting + reacting as normal; only NEW spawns are halted.
    if (world.shoreX <= rightEdge) {
      return out;
    }


    // CATS-68 follow-up: keep entities inside the LAKE at their spawn x — the swim-able chord
    // (swimBoundsAt from geometry.js), NOT a fixed top/bottom band. The whole lake is the swim
    // area now; objects may never spawn on the grass. Where the chord is too pinched for the
    // entity (inside a cap), bounds collapse to midY and the spawn parks mid-channel.
    const spawnBounds = (x, margin = 0) => {
      const b = swimBoundsAt(cfg, x, margin);
      // guard against a zero-height chord producing rand(lo, lo)
      if (b.bottom - b.top < margin * 2) {
        const mid = lakeMidY(cfg);
        return { top: mid, bottom: mid };
      }
      return b;
    };

    // --- flowers ---
    if (Number.isFinite(profile.flowerInterval)) {
      state.tFlower += dt;
      while (state.tFlower >= profile.flowerInterval) {
        state.tFlower -= profile.flowerInterval;
        const spawnX = spawnXFor(spawn.flowerRadius);
        const b = spawnBounds(spawnX, spawn.flowerRadius);
        const y = spawnY(b, profile, ctx, 'flower');
        out.flowers.push(createFlower(spawnX, y, spawn.flowerRadius));
      }
    }

    // --- dragonflies (introduced from stretch 2 on) ---
    if (Number.isFinite(profile.dragonflyInterval)) {
      state.tDragonfly += dt;
      while (state.tDragonfly >= profile.dragonflyInterval) {
        state.tDragonfly -= profile.dragonflyInterval;
        const spawnX = spawnXFor(spawn.dragonflyRadius);
        const b = spawnBounds(spawnX, spawn.dragonflyRadius);
        const y = spawnY(b, profile, ctx, 'dragonfly');
        out.dragonflies.push(createDragonfly(spawnX, y, spawn.dragonflyRadius));
      }
    }

    // --- fish (gated by whether the stretch allows any tier) ---
    if (profile.fishTiers && profile.fishTiers.length && Number.isFinite(profile.fishInterval)) {
      state.tFish += dt;
      while (state.tFish >= profile.fishInterval) {
        state.tFish -= profile.fishInterval;
        const choice = pickWeighted(profile.fishTiers);
        const radius = spawn.fishRadiusPerTier[choice.tier];
        const spawnX = spawnXFor(radius);
        const b = spawnBounds(spawnX, radius);
        // Lanes: drift laneY slowly, then place the fish near it proportional to `lane`.
        // lane=0 → fully scattered across the lane; lane=1 → all on the line.
        state.laneY += rand(-18, 18);
        state.laneY = Math.max(b.top, Math.min(b.bottom, state.laneY));
        const spread = (b.bottom - b.top) * 0.5 * (1 - profile.lane);
        const y = clampY(state.laneY + rand(-spread, spread), b.top, b.bottom);
        const fish = createFish(spawnX, y, choice.tier, radius);
        out.fish.push(fish);
        // Remember this fish's position so gifts can cluster toward it this beat.
        ctx.fishPositions.push({ x: fish.x, y: fish.y, tier: choice.tier });
      }
    }

    return out;
  }

  // Pick a gift's spawn Y. When the active stretch clusters gifts near fish (the late-
  // stretch dual-pressure knot), bias the Y toward a recent fish's lane so the gift the
  // player wants sits by the fish they must avoid — but always leave a reachable gap, never
  // drop the gift directly ON a fish (R9: every loss is a goofball brush, not a trap).
  function spawnY(bounds, profile, ctx, kind) {
    const margin = kind === 'flower' ? spawn.flowerRadius : spawn.dragonflyRadius;
    if (bounds.bottom - bounds.top < margin * 2) return (bounds.top + bounds.bottom) / 2;
    if (profile.clusterGifts && ctx.fishPositions.length) {
      const f = ctx.fishPositions[ctx.fishPositions.length - 1];
      const fr = spawn.fishRadiusPerTier[f.tier];
      // Offset off the fish's lane by a clear gap so the gift is reachable, not a trap.
      const gap = fr + 26 + margin;
      const side = Math.random() < 0.5 ? -1 : 1;
      const y = f.y + side * gap;
      return clampY(y, bounds.top, bounds.bottom);
    }
    return rand(bounds.top, bounds.bottom);
  }

  function clampY(y, lo, hi) {
    return Math.max(lo, Math.min(hi, y));
  }

  // Drift every entity leftward (toward home shore). CATS-97: an entity may NEVER leave the
  // lake — its x is pinned at the lake border (homeX + radius, the eroded-lake bound) and its y
  // clamped into the eroded chord at its x. While an object TOUCHES the lake border (resting on
  // the home tip, or squeezed against the narrowing shore) it softly fades over
  // spawn.borderFade.seconds and retires at full fade — it melts into the shore instead of
  // sliding onto the grass (the old x-cull at −40 let drifted objects cross 100 px of home-shore
  // grass in plain view of the start camera). The fade is reversible: an object that only grazes
  // the border and pulls away fades back in. Per the issue, flowers and fish fade on ANY border
  // touch; dragonflies — the collectible — only fade at the home-shore drift sink (where they
  // must retire or pile up on the tip), never when the player herds them along a shore.
  //
  // CATS-76: the per-entity updater now receives a boat context so the live entities (fish
  // follow, dragonflies flee) can react to the frog. `ctx` = { boatX, boatY, progress, bounds,
  // behavior }. Each entity's bounds are recomputed at its own x so the follow/flee stays inside
  // the chord (the chord narrows toward the home cap). Flowers ignore the context (stable).
  function driftAndUpdate(list, dt, updateFn, ctx) {
    const speed = spawn.driftSpeed;
    const fadeSeconds = spawn.borderFade ? spawn.borderFade.seconds : 1.6;
    const keep = [];
    for (const e of list) {
      e.x -= speed * dt;
      const r = e.radius || 0;
      const borderX = world.homeX + r; // the leftmost x an object of this radius fits in the lake
      let touching = false;
      if (e.x <= borderX) {
        e.x = borderX; // containment: never past the home tip
        touching = true;
      }
      const b = swimBoundsAt(cfg, e.x, r);
      if (updateFn) {
        updateFn(e, dt, ctx ? { ...ctx, bounds: b } : undefined);
      }
      if (e.y < b.top) {
        e.y = b.top;
        if (e.type !== 'dragonfly') touching = true; // squeezed against the upper shore
      } else if (e.y > b.bottom) {
        e.y = b.bottom;
        if (e.type !== 'dragonfly') touching = true; // squeezed against the lower shore
      }
      // Soft border fade: advance while touching, recover (at the same rate) when off the
      // border. fadeAlpha (1 → 0) is the render multiplier; 0 = fully faded = retire.
      e.fadeTimer = Math.max(0, (e.fadeTimer || 0) + (touching ? dt : -dt));
      e.fadeAlpha = Math.max(0, 1 - e.fadeTimer / fadeSeconds);
      if (e.fadeAlpha <= 0) continue; // fully faded → retire (not kept)
      keep.push(e);
    }
    return keep;
  }

  // CATS-76 review: seed the lake with a field of flowers on reset so a run STARTS already in
  // bloom (the boat pushes off into flowers, not empty water). The flowers are scattered across
  // the lake in front of the home shore, each placed inside the swim chord at its x (so none land
  // on the grass) and jittered so the field reads as scattered, not gridded. Returned once for
  // game.js to merge into world.flowers at reset. Fish/dragonflies are NOT pre-seeded — they keep
  // streaming in from the right shore as before (the layered onboarding stays intact).
  function seedFlowers() {
    const out = [];
    const init = spawn.initialFlowers;
    if (!init || !init.count) return out;
    const span = world.shoreX - world.homeX;
    const startX = world.homeX + init.startLead;
    const endX = world.homeX + span * init.spanFraction;
    for (let i = 0; i < init.count; i++) {
      // even spread across the span + per-flower jitter, clamped inside the lake
      const t = init.count > 1 ? i / (init.count - 1) : 0;
      let x = startX + (endX - startX) * t + rand(-init.scatterX, init.scatterX);
      // CATS-97: clamp by the flower's radius so a jittered seed never lands poking over a tip
      x = Math.max(world.homeX + spawn.flowerRadius + 6, Math.min(world.shoreX - spawn.flowerRadius - 6, x));
      const b = swimBoundsAt(cfg, x, spawn.flowerRadius);
      const top = (b.bottom - b.top < spawn.flowerRadius * 2) ? lakeMidY(cfg) : b.top;
      const bottom = (b.bottom - b.top < spawn.flowerRadius * 2) ? lakeMidY(cfg) : b.bottom;
      const y = rand(top, bottom);
      out.push(createFlower(x, y, spawn.flowerRadius));
    }
    return out;
  }

  return { state, reset, update, driftAndUpdate, seedFlowers, checkFarReachesFish };
}
