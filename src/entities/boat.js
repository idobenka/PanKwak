// entities/boat.js — Mr. Kwak's lily-pad boat: heading, velocity, drag/inertia, fish-hit stun.
//
// The frog floats on the boat ABOVE the lake surface; the fish swim BELOW it. So a fish
// contact is NOT a hard "touch" — it is a STUN: the boat slows down, the player briefly
// loses control, and the boat wobbles/spins a little. No velocity kick is injected; the
// stun handles the reaction directly. Per the user's "no sharp movements," the wobble is
// bounded and eased — a slow rock-and-settle, not a violent whip.
//
// Continuous steering. Held L/R applies sideways acceleration; held W/S rows along the
// crossing. Velocity is RAMPED (not snapped), so there is never an instant heading flip —
// and since CATS-128 how sharply the boat moves is FREE anyway: dragonflies only spill on
// a recorded shore bump (see game.js), never on steering alone.
//
// Auto-forward drift advances the boat toward the far shore even with no input, so the
// crossing always progresses and the soft sunset deadline stays meaningful.

import * as boatGeometry from '../geometry.js';

export function createBoat(cfg) {
  const { world, boat, fishHit } = cfg;
  // CATS-97: the push-off point sits just INSIDE the lake's rounded home tip (homeX is the
  // shore point itself, where the water height is 0) — the frog starts afloat, never beached
  // on the grass. homeX + radius = touching the tip exactly; the +6 lead floats it free.
  const startX = world.homeX + boat.radius + 6;
  const state = {
    x: startX,
    y: boatGeometry.lakeMidY(cfg),
    vx: 0, // sideways (x) velocity, px/s
    vy: 0, // vertical (y) velocity, px/s
    // STUN state. stunTimer counts DOWN from stunSeconds to 0; >0 means control is lost.
    // stunFraction (1→0) drives the eased wobble magnitude, so it starts at the peak and
    // gently settles as control returns.
    stunTimer: 0,
    stunFraction: 0,
    // per-fish cooldown timestamps: { fishId -> secondsUntilCanRehit }. A fish can only
    // re-stun the boat once its timer elapses, so one parked fish can't spam the stun.
    _fishCooldowns: {},
    // cosmetic squash for jolts (decays each frame) — set only by a fish hit (a wall bump
    // no longer squishes since CATS-132; the shore reaction is the bump hop alone)
    squash: 0,
    // CATS-128 follow-up (rev 2): the bump hop — a recorded shore bump bounces Mr. Kwak +
    // pad off the surface like a ball: 3 diminishing parabolic hops. hopTimer counts DOWN
    // from hopTotal (= bumpHop.firstHopSeconds × the per-hop duration weights); render
    // lifts the whole ensemble by the arc height (peaks ×bounciness² per hop).
    hopTimer: 0,
    hopTotal: 0,
    // CATS-113: wall-bump events from THIS step, for game.js (the CATS-128 border-loss spill)
    // and the bump hop to read. Each entry is { x, y, impact } (contact point + impact speed
    // px/s); cleared at the top of the next update. Only bumps above wallBump.minImpactPxPerS
    // are recorded — a boat merely resting on a wall never fires.
    wallBumps: [],
  };

  function reset() {
    state.x = startX;
    state.y = boatGeometry.lakeMidY(cfg);
    state.vx = 0; // x = forward across the lake (toward far shore)
    state.vy = 0; // y = lateral steering
    state.stunTimer = 0;
    state.stunFraction = 0;
    state._fishCooldowns = {};
    state.squash = 0;
    state.hopTimer = 0;
    state.hopTotal = 0;
    state.wallBumps = [];
  }

  // input: { left, right, up, down } booleans held THIS step.
  //
  // Axis model (top-down lake crossing):
  //   x = forward progress toward the far shore. Auto-cruise advances the boat at a
  //       steady, NON-dragged pace so the crossing always progresses and the soft
  //       sunset deadline stays meaningful. W/S rows faster / slower along x.
  //   y = lateral steering. Lateral thrust RAMPS velocity (not snaps), then drag/inertia
  //       smooths it — so a held evasive arc reads as gentle movement.
  function update(input, dt) {
    state.wallBumps = [];

    // --- Stun decay ---
    if (state.stunTimer > 0) {
      state.stunTimer = Math.max(0, state.stunTimer - dt);
      state.stunFraction = state.stunTimer > 0 ? state.stunTimer / state._stunTotal : 0;
    } else {
      state.stunFraction = 0;
    }
    // tick down per-fish cooldowns
    for (const id in state._fishCooldowns) {
      state._fishCooldowns[id] -= dt;
      if (state._fishCooldowns[id] <= 0) delete state._fishCooldowns[id];
    }

    const stunned = state.stunTimer > 0;

    // --- Lateral steering thrust (continuous, on y) — IGNORED while stunned ---
    // Velocity ramps under thrust and drag/inertia smooths it — a held arc stays gentle.
    // (Since CATS-128 nothing keys off the Δv anymore; the ramp is purely feel.)
    let ay = 0;
    if (!stunned) {
      if (input.up) ay -= boat.steerAccel;
      if (input.down) ay += boat.steerAccel;
    }
    state.vy += ay * dt;

    // --- Row faster / slower along the crossing (on x) — IGNORED while stunned ---
    // Up/Down are steering; Left/Right modulate forward pace. Left = ease off, Right = row.
    // (Optional verb — auto-cruise alone still crosses.)
    let rowBoost = 0;
    if (!stunned) {
      if (input.right) rowBoost += boat.rowAccel;
      if (input.left) rowBoost -= boat.rowAccel * 0.6; // easing off is gentler than rowing
    }
    state.vx += rowBoost * dt;

    // --- Forward cruise baseline (NOT dragged): the crossing advances at a steady rate ---
    // Cut while stunned so even auto-forward is sluggish (part of the "slowdown"). Still
    // positive so the boat never stalls completely — the crossing always inches forward.
    const cruiseVx = world.autoForward * (stunned ? fishHit.cruiseScaleWhileStunned : 1);

    // --- Drag / inertia (frame-rate independent) ---
    // While stunned, apply a MUCH heavier drag so the boat decelerates — the slowdown.
    const dragK = stunned ? fishHit.stunDrag : boat.drag;
    const decay = Math.exp(-dragK * dt);
    state.vx *= decay;
    state.vy *= decay;

    // --- Clamp ---
    // vx (forward) is centered on the cruise baseline: rowing nudges above/below it.
    const vxExcess = state.vx;
    const clampedVx = Math.max(-boat.maxRowSpeed, Math.min(boat.maxRowSpeed, vxExcess));
    state.vx = clampedVx;
    state.vy = Math.max(-boat.maxSideSpeed, Math.min(boat.maxSideSpeed, state.vy));

    // --- Integrate position (cruise advance applied to x directly) ---
    state.x += (state.vx + cruiseVx) * dt;
    state.y += state.vy * dt;

    // --- Soft left/top/bottom walls (bounce + mild jolt) ---
    // No right wall: reaching shoreX (the far shore) wins the crossing.
    // CATS-97: the left wall is the LAKE's home tip (homeX + r), not x = r — the old wall let
    // the boat row 44 px onto the home-shore grass, and the boat can never leave the lake.
    const r = boat.radius;
    const homeWall = world.homeX + r;
    if (state.x < homeWall) {
      state.x = homeWall;
      // Bounce flips the row velocity; the cruise baseline stays positive, so the boat
      // can't pin against the home shore — it eases off and the crossing resumes.
      const impact = Math.abs(state.vx);
      state.vx = Math.abs(state.vx) * boat.wallRestitution;
      // CATS-113: record the bump (bounce-back) if it hit hard enough to read.
      // CATS-128 follow-up: each record starts the bump-hop bounce (the only shore
      // reaction since CATS-132 — no ripple, no squash).
      if (impact >= boat.wallBump.minImpactPxPerS) {
        state.wallBumps.push({ x: state.x - r, y: state.y, impact });
        startBumpHop();
      }
    }
    // CATS-68 follow-up: the TOP/BOTTOM walls are now the LAKE SHAPE itself — the boat is
    // soft-walled to the stadium chord at its current x (swimBoundsAt from geometry.js), so the
    // WHOLE lake is swim-able, not just a fixed sub-band, and the boat can never row onto the
    // grass (the shore shows on all four sides of the narrower lake). Where the chord is too
    // narrow for the boat (inside a cap) both bounds collapse to midY, parking it mid-channel.
    const { swimBoundsAt } = boatGeometry;
    const { top: lakeTop, bottom: lakeBottom } = swimBoundsAt(cfg, state.x, r);
    if (state.y < lakeTop) {
      state.y = lakeTop;
      // bounce flips vy; a hard enough touch records a wallBump (the CATS-128 border loss
      // reads it)
      const impact = Math.abs(state.vy);
      state.vy = Math.abs(state.vy) * boat.wallRestitution;
      // CATS-113: the lake-border BUMP — a hard touch of the upper shore bounces the frog back
      // into the water and starts the bump hop so the border reads as solid.
      if (impact >= boat.wallBump.minImpactPxPerS) {
        state.wallBumps.push({ x: state.x, y: state.y - r, impact });
        startBumpHop();
      }
    } else if (state.y > lakeBottom) {
      state.y = lakeBottom;
      const impact = Math.abs(state.vy);
      state.vy = -Math.abs(state.vy) * boat.wallRestitution;
      if (impact >= boat.wallBump.minImpactPxPerS) {
        state.wallBumps.push({ x: state.x, y: state.y + r, impact });
        startBumpHop();
      }
    }

    // squash decay + CATS-128 follow-up bump-hop countdown (render reads hopTimer/
    // hopTotal for the parabolic lift; the sim position never moves).
    state.squash *= Math.exp(-6 * dt);
    if (state.hopTimer > 0) state.hopTimer = Math.max(0, state.hopTimer - dt);
  }

  // CATS-128 follow-up (rev 2): start (or restart) the ball-like bump hop — hopCount
  // diminishing bounces; hopTotal = firstHopSeconds scaled by the per-hop duration
  // weights (1, bounciness, bounciness², …). A bump mid-bounce restarts from the top so
  // the read is always a clean first hop, never a stutter.
  function startBumpHop() {
    const cfgHop = boat.wallBump.bumpHop;
    if (!cfgHop || !cfgHop.firstHopSeconds || !cfgHop.hopCount) return;
    let w = 0;
    for (let i = 0; i < cfgHop.hopCount; i++) w += Math.pow(cfgHop.bounciness, i);
    state.hopTotal = cfgHop.firstHopSeconds * w;
    state.hopTimer = state.hopTotal;
  }

  // A fish bumped the boat. Start a STUN: control loss + slowdown + gentle wobble. The
  // stun duration scales with fish tier (bigger fish = a touch longer). `fishId` keys the
  // per-fish cooldown so the same fish can't re-stun every frame. The stun affects ONLY the
  // boat (no dragonflies) — dragonflies leave the jar from the player's own sharp movement,
  // never from a fish bump. Flowers are eaten separately in collisions.js.
  function applyFishHit(fishId, tier) {
    const seconds = fishHit.stunSeconds + fishHit.stunSecondsPerTier * (tier || 0);
    // Don't interrupt an in-flight stun with a shorter one (keeps the wobble readable);
    // refresh the cooldown either way.
    if (state.stunTimer < seconds) {
      state.stunTimer = seconds;
      state._stunTotal = seconds;
    }
    state._fishCooldowns[fishId] = fishHit.perFishCooldown;
    state.squash = 1; // a soft squish on impact
  }

  // Is this specific fish allowed to stun the boat right now? (per-fish cooldown check)
  function fishOnCooldown(fishId) {
    return (state._fishCooldowns[fishId] || 0) > 0;
  }

  return { state, update, reset, applyFishHit, fishOnCooldown,
    radius: () => boat.radius };
}
