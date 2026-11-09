// entities/flower.js — bouquet pickup. Proximity-collected by the boat drifting over it.
//
// STABLE (CATS-76): flowers are the one constant the player can plan around. They never react
// to the frog — no follow, no flee — and only drift with the current (spawn.driftSpeed in the
// spawner) plus a gentle bob for life. Tunables live in config.behavior.flower (bob amplitude,
// applied in render).

export function createFlower(x, y, radius) {
  return {
    type: 'flower',
    x, y,
    radius,
    collected: false,
    // gentle bob for life
    bobPhase: Math.random() * Math.PI * 2,
  };
}

// Flowers never react to the boat — only advance the bob phase. (dt is accepted for a uniform
// signature with the fish/dragonfly updaters; ctx is intentionally unused.)
export function updateFlower(f, dt) {
  f.bobPhase += dt * 3;
}
