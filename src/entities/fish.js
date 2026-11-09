// entities/fish.js — size-scaled fish that swim BELOW the surface.
//
// The frog floats on its boat ABOVE the water; the fish swim BELOW the lake surface (see
// render.js for the layering). A fish contact does two things, both soft:
//   1. EATS flowers off the bouquet — the gathered flowers lay on the boat, but their STEMS
//      trail down into the water, so a fish below can still nip them off. Size-scaled: bigger
//      fish eat more (the "dodge to save flowers" pressure, unchanged).
//   2. STUNS the boat — slowdown + brief control loss + a gentle wobble (handled in boat.js).
// The stun does NOT touch the dragonflies — only the hull bumping a lake border/beach
// spills those (CATS-128, see game.js). Fish are never a harsh "touch": no velocity kick is injected.
//
// Per Narrative R8, fish are CHARACTERS (greedy/guilty/oafish), bigger = more oblivious,
// comedy NOT menace. For the Phase 0 graybox that characterization is flavor carried as
// data (tier → radius, color); there is deliberately NO predator lunge animation or attack
// path. Fish just drift below the surface and nip/eat on contact — a readable, soft threat.
//
// Tiers (affect flower cost + stun length + visual size):
//   0 small  — nips ~1 flower, a brief stumble
//   1 medium — eats a few, a longer wobble
//   2 big    — strips a chunk, the biggest shake-and-settle, route around it
//
// Movement (CATS-76): fish FOLLOW the frog's lane (herd toward its y), with frequent random
// direction changes on top — a nosing chase that overshoots and wanders, never a homing
// missile. The chase gets SHARPER (twitchier, bigger zig-zags) the closer the frog is to the
// finish: a progress-scaled multiplier ramps the sharpness amplitude across the crossing. All
// motion stays bounded and clamped to the lake chord, so the fish never leave the water or
// break the below-surface layering. Tunables live in config.behavior.fish.

let _nextId = 1;

const TIER_META = [
  { color: '#7fb6c9', label: 'small' },   // pale teal
  { color: '#4f8aa6', label: 'medium' },  // deeper teal
  { color: '#2f5d77', label: 'big' },     // dark teal
];

export function tierMeta(tier) {
  return TIER_META[tier] || TIER_META[1];
}

export function createFish(x, y, tier, radius) {
  return {
    type: 'fish',
    id: _nextId++,
    x, y,
    tier,
    radius,
    baseY: y,            // the lane the fish herds back toward; eased toward the boat's y (FOLLOW)
    vy: 0,               // current vertical wander velocity (px/s)
    targetVy: 0,         // the random target velocity; vy snaps toward it (the SHARP zig-zags)
    // cooldown so one fish can't eat/stun in back-to-back frames
    eatCooldown: 0,
    wanderPhase: Math.random() * Math.PI * 2, // cosmetic phase for any render wobble
    reseedIn: 0,         // time until the next random direction pick
    // CATS-113: per-fish phase for the continuous wave (each fish waves on its own clock, so a
    // school doesn't move as one synced sheet) + the eased horizontal closing speed that keeps
    // the chase DIAGONAL once the fish sees the boat.
    wavePhase: Math.random() * Math.PI * 2,
    chaseVx: 0,          // eased leftward closing speed while the fish sees the boat (px/s)
  };
}

// Update one fish for a fixed dt. `ctx` = { boatX, boatY, progress, bounds, behavior } where:
//   boatX/boatY — the frog's position (the follow target; fish herd toward boatY)
//   progress    — crossing progress 0..1 (home shore → far shore); ramps the sharpness
//   bounds      — { top, bottom } swim chord at the fish's x (keeps it in the water)
export function updateFish(fish, dt, ctx = {}) {
  const cfg = ctx.behavior && ctx.behavior.fish ? ctx.behavior.fish : null;
  fish.eatCooldown = Math.max(0, fish.eatCooldown - dt);
  fish.wanderPhase += dt * 1.5;
  // CATS-113: advance the continuous-wave phase. This wave is ALWAYS on (the fish never swims
  // a straight line) — ambient and chase alike.
  if (cfg && cfg.waveSeconds > 0) {
    fish.wavePhase += (Math.PI * 2 / cfg.waveSeconds) * dt;
  }

  if (!cfg || ctx.boatY == null) {
    // No behavior config / no boat context: keep the legacy lazy wobble so the fish still reads
    // as alive (e.g. a shared-card postcard render with no live boat).
    fish.y = (fish.baseY != null ? fish.baseY : fish.y) + Math.sin(fish.wanderPhase) * 10;
    return;
  }

  // SHARPNESS ramps with how close the frog is to the finish (the core ask). near = 0 at home,
  // →1 at the far shore, so the wander amplitude + zig-zag speed both grow as the boat closes in.
  const near = clamp01((ctx.progress || 0) * ((ctx.behavior && ctx.behavior.progressToSharp) || 0));
  const sharpMul = 1 + near * cfg.sharpnessNearFinishMul;

  // SIGHT: a fish only NOTICES the frog (and turns toward it) when the boat is within sightRadius.
  // Outside it the fish roams freely — no follow pull, no directional bias from Mr. Kwak. So "a fish
  // sees Mr. Kwak → it changes direction toward him," rather than homing from across the whole lake.
  const sight = cfg.sightRadius || Infinity;
  const seesBoat = ctx.boatX != null
    ? Math.hypot(fish.x - ctx.boatX, fish.y - ctx.boatY) <= sight
    : true;

  if (seesBoat) {
    // FOLLOW: ease the fish's lane (baseY) toward the frog's y. followSpeed is a per-second easing
    // rate — high enough that a fish which has just SPOTTED the boat visibly turns toward it within
    // a second or two (the "sees Mr. Kwak → changes direction toward him" read), not a 77s drift.
    fish.baseY += (ctx.boatY - fish.baseY) * (1 - Math.exp(-cfg.followSpeed * dt));
  }

  // CATS-113 — DIAGONAL chase: when a fish sees the frog it must never move straight up or
  // down. Ease a leftward closing speed up to chaseMinXSpeed so the approach vector keeps a
  // horizontal component however strong the vertical follow gets; when it stops seeing the
  // boat the closing speed eases back to 0 (a fish outside sight drifts with the current only,
  // like before). The driftAndUpdate leftward current still applies to all fish as the base
  // horizontal motion — this is the extra "swim toward" on top.
  const targetVx = seesBoat ? -(cfg.chaseMinXSpeed || 0) : 0;
  fish.chaseVx += (targetVx - fish.chaseVx) * (1 - Math.exp(-2.2 * dt));
  fish.x += fish.chaseVx * dt;

  // RANDOM DIRECTION: every reseedSeconds pick a fresh target velocity in [-maxV, +maxV]. vy
  // then snaps toward targetVy — the "sharply changing direction" zig-zag. maxV grows with near.
  fish.reseedIn -= dt;
  if (fish.reseedIn <= 0) {
    fish.reseedIn = cfg.reseedSeconds * (0.6 + Math.random() * 0.8);
    const maxV = cfg.sharpSpeed * sharpMul;
    fish.targetVy = (Math.random() * 2 - 1) * maxV;
  }
  // snap vy toward the target (fast lerp = the "sharp" feel), with a little ambient base drift
  const snap = 1 - Math.exp(-(cfg.baseSpeed + cfg.sharpSpeed * sharpMul) * 0.12 * dt * 60);
  fish.vy += (fish.targetVy - fish.vy) * Math.min(1, snap);

  // Integrate, then clamp the wander amplitude around the follow lane so the chase stays a
  // bounded weave (no whip — the "no sharp movements" rule applies to the boat; fish read quick
  // but never violent). The amplitude ALSO scales with `near`, so near the finish the fish don't
  // just change direction faster — they sweep a wider arc too (the sharpening reads visually,
  // not only as speed).
  fish.y += fish.vy * dt;
  const amp = cfg.wanderAmp * (0.45 + 0.55 * near);
  let y = fish.baseY + clamp(fish.y - fish.baseY, -amp, amp);

  // CATS-113 — the WAVY line: layer the continuous sinusoid onto the position (after the
  // amplitude clamp, so the wave is never eaten by it). This is what makes the fish never swim
  // straight — ambient or chasing, the path always carries this gentle wave.
  y += Math.sin(fish.wavePhase) * (cfg.waveAmp || 0);

  // Keep the fish inside the lake chord at its x (and below the surface). ctx.bounds is the
  // precomputed swim chord; fall back to baseY if absent.
  if (ctx.bounds && ctx.bounds.bottom > ctx.bounds.top) {
    fish.baseY = clamp(fish.baseY, ctx.bounds.top, ctx.bounds.bottom);
    y = clamp(y, ctx.bounds.top, ctx.bounds.bottom);
  }
  fish.y = y;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
