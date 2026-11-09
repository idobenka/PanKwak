// entities/dragonfly.js — jar pickup. Proximity-collected by steering near it.
// Can "wander off" — visually represented as a little dash that flits; the jar itself is
// the counter in gifts.js, lost when the hull bumps a border (CATS-128).
//
// Movement (CATS-76): dragonflies FLEE the frog — they pull AWAY from it when it gets near —
// but with random "salt" added to the escape direction each reseed, so the flight path wanders
// instead of a straight line away. Outside the flee radius they only do a lazy ambient flit so a
// still dragonfly still reads as alive. All motion is clamped to the lake chord (they never
// leave the water / break the surface). Tunables live in config.behavior.dragonfly.

export function createDragonfly(x, y, radius) {
  return {
    type: 'dragonfly',
    x, y,
    radius,
    collected: false,
    flitPhase: Math.random() * Math.PI * 2, // cosmetic wing/vertical flit phase for render
    baseY: y,
    vy: 0,                                  // vertical flee velocity (px/s)
    fleeAngle: Math.random() * Math.PI * 2, // current salted escape heading
    reseedIn: 0,                            // time until the next salted direction
  };
}

// Update one dragonfly for a fixed dt. `ctx` = { boatX, boatY, bounds } where:
//   boatX/boatY — the frog's position (the thing it flees from)
//   bounds      — { top, bottom } swim chord at the dragonfly's x (keeps it in the water)
export function updateDragonfly(d, dt, ctx = {}) {
  d.flitPhase += dt * 6;
  const cfg = ctx.behavior && ctx.behavior.dragonfly ? ctx.behavior.dragonfly : null;

  if (!cfg || ctx.boatX == null || ctx.boatY == null) {
    // No behavior config / no boat context: keep the legacy flit so it still reads as alive.
    d.y = d.baseY + Math.sin(d.flitPhase) * 8;
    return;
  }

  const dx = d.x - ctx.boatX;
  const dy = d.y - ctx.boatY;
  const dist = Math.hypot(dx, dy) || 1;
  const fleeing = dist < cfg.fleeRadius;

  // Reseed the salted escape direction on a cadence. When FLEEING, the base bearing is straight
  // away from the frog and salt = a random angular offset, so the escape path wanders (never a
  // clean straight run). When ambient (far), pick a fresh random wander heading each reseed so a
  // still dragonfly drifts like a living thing instead of holding one bearing.
  d.reseedIn -= dt;
  if (d.reseedIn <= 0) {
    d.reseedIn = cfg.reseedSeconds * (0.6 + Math.random() * 0.8);
    if (fleeing) {
      const away = Math.atan2(dy, dx); // straight-away bearing
      const salt = (Math.random() * 2 - 1) * cfg.saltRadians;
      d.fleeAngle = away + salt;
    } else {
      d.fleeAngle = Math.random() * Math.PI * 2;
    }
  }

  let vy = 0;
  if (fleeing) {
    // FLEE: pull away along the salted heading. Strength scales up as the frog closes in.
    const closeness = 1 - dist / cfg.fleeRadius; // 0 at the edge → 1 on top of it
    vy = Math.sin(d.fleeAngle) * cfg.fleeSpeed * (0.4 + closeness * 0.6);
  } else {
    // Ambient flit: a gentle wander along the reseeded heading.
    vy = Math.sin(d.fleeAngle) * cfg.baseSpeed;
  }

  // Ease vy toward the target (a flit, not a lurch), then integrate.
  d.vy += (vy - d.vy) * Math.min(1, dt * 6);
  d.y += d.vy * dt;

  // Soft-bob around the flee position for life, then clamp into the lake chord.
  let y = d.y + Math.sin(d.flitPhase) * 2;
  if (ctx.bounds && ctx.bounds.bottom > ctx.bounds.top) {
    y = clamp(y, ctx.bounds.top, ctx.bounds.bottom);
    d.baseY = clamp(d.y, ctx.bounds.top, ctx.bounds.bottom);
  }
  d.y = y;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
