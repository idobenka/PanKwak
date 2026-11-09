// systems/fx.js — the reusable visual-effect (particle) layer.
//
// CATS-60 (foundation). A small, self-contained world-space effect list that the three
// environmental reactions (CATS-61 sparkles/shine, CATS-62 ripple) are built on top of. Each
// reaction is just a spawn() call here + a draw case in render.js — nothing more.
//
// Shape of an effect: { x, y, type, age, lifetime, params }.
//   x, y     — world-space origin (read as "on the water surface"; same family as the fish ripple)
//   type     — 'sparkle' | 'shine' | 'ripple'. The set is locked by the PO review (no new types
//              without a fresh review). Unknown types are rejected by spawn() so a typo can't
//              silently no-op.
//   age      — seconds since spawn, advanced ONLY by update(dt) on the fixed timestep. Never
//              wall-clock/performance.now — the sim is fixed-timestep-deterministic (architecture
//              §TL;DR), and only cosmetic phase like the existing stun wobble may use
//              performance.now. An effect retires when age >= lifetime.
//   lifetime — seconds, per-type default (config.fx.types[type].lifetime).
//   params   — per-type tunables merged from config at spawn (radius, color, count, growth, …).
//              Stored on the effect so render reads a flat field per draw, not a config lookup.
//
// Throttle: the one perf guardrail flagged in the PO review. Per type:
//   - maxConcurrent: a hard cap on live effects of that type (oldest is dropped to make room, so a
//     burst always shows its freshest reaction — a flood can't grow the list unbounded).
//   - minInterval:  the minimum SECONDS between spawns of that type (a burst of same-type events
//     that fires faster than this collapses to one spawn). Tracked as `_lastSpawn[type]` in
//     fixed-timestep-accumulated time (spawn() receives the current sim clock from the caller so
//     the interval test stays determinism-safe — never a performance.now diff).
//
// This file only MANAGES effects (spawn / age / retire). The canvas draws live in render.js;
// game.js wires each spawn at its gameplay hook point.

import { CONFIG } from '../config.js';

// The locked effect-type set (PO review scope cap). spawn() rejects anything else.
export const FX_TYPES = ['sparkle', 'shine', 'ripple'];

export function createFx(cfg) {
  const types = cfg.fx.types;

  // Live effects, oldest-first. Public (render + sibling sub-issues read it). reset() clears it.
  const effects = [];

  // Fixed-timestep-accumulated "now" in seconds, advanced by update(dt). The throttle's
  // minInterval test reads this, never wall-clock — so the throttle is as deterministic as aging.
  let _clock = 0;
  // Per-type "last spawn time" (in the sim clock above) + per-type "max live allowed" cache.
  const _lastSpawn = Object.create(null);

  function reset() {
    effects.length = 0;
    _clock = 0;
    for (const k of Object.keys(_lastSpawn)) delete _lastSpawn[k];
  }

  // Count live effects of one type.
  function _countType(type) {
    let n = 0;
    for (let i = 0; i < effects.length; i++) if (effects[i].type === type) n++;
    return n;
  }

  // Spawn an effect of `type` at world (x, y). Extra `params` (radius, color, ...) override the
  // per-type defaults. Returns the created effect, or null if throttled/rejected (so a caller that
  // wants to chain on a successful spawn can).
  //
  // `now` is the caller's current fixed-timestep clock (game.js passes world.fxNow). Passing it in
  // (rather than reading an internal counter) keeps spawn deterministic relative to the sim step it
  // fires from — a sibling sub-issue calling spawn() inside a collision hook uses the same clock.
  function spawn(type, x, y, now, params = {}) {
    if (!FX_TYPES.includes(type)) {
      // Reject unknown types loudly — a typo'd spawn call should fail fast, not silently no-op
      // (a silent no-op would hide a broken reaction from the playtest pass).
      if (cfg.debug && cfg.debug.showSteeringMeter) {
        console.warn(`[fx] unknown effect type "${type}"; expected one of ${FX_TYPES.join(', ')}`);
      }
      return null;
    }
    const def = types[type];
    if (!def) return null;

    const t = (typeof now === 'number') ? now : _clock;

    // minInterval throttle: collapse a sub-interval burst of the same type into one spawn.
    const last = _lastSpawn[type];
    if (last !== undefined && (t - last) < def.minInterval) return null;

    // maxConcurrent throttle: drop the oldest same-type effect to make room (the freshest reaction
    // is the one that should read — a flood never grows the list past the cap).
    if (_countType(type) >= def.maxConcurrent) {
      for (let i = 0; i < effects.length; i++) {
        if (effects[i].type === type) { effects.splice(i, 1); break; }
      }
    }

    const fx = {
      type,
      x,
      y,
      age: 0,
      lifetime: def.lifetime,
      params: Object.assign({}, def.params, params),
    };
    effects.push(fx);
    _lastSpawn[type] = t;
    return fx;
  }

  // Age + retire on the fixed timestep. dt = cfg.fixedDt from the caller. Deterministic: given the
  // same spawn stream and dt, the retire sequence is identical across machines/refresh rates.
  function update(dt) {
    _clock += dt;
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].age += dt;
      if (effects[i].age >= effects[i].lifetime) effects.splice(i, 1);
    }
  }

  // 0..1 phase for rendering (ease-in/out lookups). Purely cosmetic — render.js uses it; aging
  // never touches it.
  function phaseOf(fx) {
    if (fx.lifetime <= 0) return 1;
    const p = fx.age / fx.lifetime;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  return { effects, reset, spawn, update, phaseOf };
}
