// systems/collisions.js — circle-vs-circle collision + proximity collection.
//
// Layering (per CATS-43): the frog's boat floats ABOVE the lake surface; the fish swim
// BELOW it. A fish contact does two soft things:
//   • boat↔flower    → proximity pickup (bouquet +1)            [discrete collection]
//   • boat↔dragonfly → proximity pickup (jar +1)                [discrete collection]
//   • boat↔fish      → EAT flowers (stems trail in the water) + STUN the boat  [event-driven]
//
// (1) FLOWERS are eaten, size-scaled by fish tier: the gathered bouquet lays on the boat,
// but the flower stems are still submerged, so a fish below the surface can nip them off.
// Routed through gifts.loseFlowers so the shared currency stays the source of truth.
//
// (2) The boat is STUNNED: boat.applyFishHit starts a slowdown + brief control loss + gentle
// wobble. The stun does NOT touch dragonflies — dragonflies only leave the jar when the hull
// bumps a lake border/beach (CATS-128, see game.js). No velocity kick is injected into the boat.

export function createCollisions(cfg) {
  const { gifts, fishHit, balance, boat: boatCfg } = cfg;

  // Run all proximity/contact checks for one frame. Returns a list of human-readable
  // events for the readout/flavor (e.g. "a fish bumped you"), kept crude for Phase 0.
  // opts.invulnerable: when true (post-hit grace), fish contact is skipped — no eat, no
  // stun — but gifts still collect so the grace frame isn't a dead frame.
  // opts.fx / opts.fxNow: the CATS-60 effect layer + its deterministic sim clock. A pickup
  // spawns a reward effect at the entity's position (CATS-61). Absent → no spawn (graceful).
  // opts.audio: the CATS-94 named-event surface. A pickup plays its reward voice the same
  // way it spawns its reward effect. Absent → silent (graceful).
  function resolve(boat, flowers, dragonflies, fish, giftsApi, opts = {}) {
    const events = [];
    const bx = boat.state.x;
    const by = boat.state.y;
    const br = boatCfg.radius;
    const invuln = !!opts.invulnerable;
    const fx = opts.fx || null;
    const fxNow = opts.fxNow;
    const audio = opts.audio || null;

    // --- flowers: proximity collect ---
    for (const f of flowers) {
      if (f.collected) continue;
      if (dist2(bx, by, f.x, f.y) <= sq(br + cfg.gifts.collectRadiusFlower)) {
        f.collected = true;
        giftsApi.collectFlower();
        if (fx) fx.spawn('shine', f.x, f.y, fxNow);
        // CATS-94: P1 flower collect — the dewdrop plink, same site as the shine FX
        // (architecture §4 row P1). Once per flower per frame (proximity collect).
        if (audio) audio.play('flower_collect');
      }
    }

    // --- dragonflies: proximity collect (wider radius — "steer near") ---
    for (const d of dragonflies) {
      if (d.collected) continue;
      if (dist2(bx, by, d.x, d.y) <= sq(br + cfg.gifts.collectRadiusDragonfly)) {
        d.collected = true;
        giftsApi.collectDragonfly();
        if (fx) fx.spawn('sparkle', d.x, d.y, fxNow);
        // CATS-94: P2 dragonfly catch — the soft fluttery plip, same site as the sparkle
        // FX (architecture §4 row P2).
        if (audio) audio.play('dragonfly_catch');
      }
    }

    // --- fish: contact = EAT flowers (stems submerged) + STUN the boat ---
    for (const fishy of fish) {
      const hitR = br + fishy.radius;
      if (dist2(bx, by, fishy.x, fishy.y) <= sq(hitR)) {
        if (invuln) continue; // post-hit grace: no eat, no stun

        // (1) Eat flowers off the submerged stems, size-scaled by tier. One fish only eats
        // when its own cooldown has elapsed, so a parked boat isn't drained in one frame.
        if (fishy.eatCooldown <= 0) {
          const cost = flowerCostFor(fishy.tier);
          const lost = giftsApi.loseFlowers(cost);
          fishy.eatCooldown = balance.fish_eat_cooldown;
          if (lost > 0) {
            events.push({ kind: 'fish_ate', tier: fishy.tier, lost });
          }
        }

        // (2) Stun the boat once per the fish's own cooldown (prevents a parked fish from
        // re-stunning every frame). Dragonflies are intentionally NOT touched here. The fish's
        // x/y ride on the event so the CATS-62 meet-ripple can bloom at the contact point.
        if (!boat.fishOnCooldown(fishy.id)) {
          boat.applyFishHit(fishy.id, fishy.tier);
          events.push({ kind: 'fish_hit', tier: fishy.tier, x: fishy.x, y: fishy.y });
        }
      }
    }

    return events;
  }

  function flowerCostFor(tier) {
    return balance.flower_loss_per_fish_size[tier] ?? balance.flower_loss_per_fish_size[1];
  }

  return { resolve };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function sq(n) {
  return n * n;
}
