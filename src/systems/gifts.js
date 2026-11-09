// systems/gifts.js — the bouquet + jar counters, as ONE shared gift currency.
//
// Per architecture §"Design principles" #3: the win is "≥1 gift of EITHER type," so the
// bouquet and jar collapse into one number the player tracks and the two pressures trade
// against. Both loss entry points call into THIS module so the shared currency stays the
// single source of truth:
//   • flowers lost     → event-driven (fish eats the submerged stems, size-scaled) — loseFlowers()
//   • dragonflies lost → event-driven (the hull bumps a lake border/beach, CATS-128) — loseDragonflies()
//
// A fish hit does NOT spill dragonflies — the boat stun (slowdown/control-loss/wobble) only
// affects the boat itself. Dragonflies leave the jar solely from the player's boat bumping
// a shore (outside the finish-safe zone; see game.js). Flowers, though, ARE eaten on fish
// contact: they lay on the boat but their stems trail in the water (see systems/collisions.js).

export function createGifts(cfg) {
  const state = {
    flowers: 0, // bouquet
    dragonflies: 0, // jar
    // running totals for the readout / tuning (how many of each were gathered, lost)
    flowersGathered: 0,
    dragonfliesGathered: 0,
    flowersLost: 0,
    dragonfliesLost: 0,
  };

  function reset() {
    state.flowers = 0;
    state.dragonflies = 0;
    state.flowersGathered = 0;
    state.dragonfliesGathered = 0;
    state.flowersLost = 0;
    state.dragonfliesLost = 0;
  }

  function collectFlower() {
    state.flowers += 1;
    state.flowersGathered += 1;
  }

  function collectDragonfly() {
    state.dragonflies += 1;
    state.dragonfliesGathered += 1;
  }

  // Event-driven flower loss (fish contact). Size-scaled amount; never drops below 0.
  function loseFlowers(amount) {
    if (amount <= 0 || state.flowers <= 0) return 0;
    const lost = Math.min(amount, state.flowers);
    state.flowers -= lost;
    state.flowersLost += lost;
    return lost;
  }

  // Dragonfly loss (a border bump, CATS-128). 1+ per call; never below 0.
  function loseDragonflies(amount) {
    if (amount <= 0 || state.dragonflies <= 0) return 0;
    const lost = Math.min(amount, state.dragonflies);
    state.dragonflies -= lost;
    state.dragonfliesLost += lost;
    return lost;
  }

  // Shared win currency: ≥1 gift of either type = "not empty-handed."
  function total() {
    return state.flowers + state.dragonflies;
  }

  function hasEnoughToWin() {
    return total() >= cfg.gifts.minGiftsToWin;
  }

  return {
    state, reset,
    collectFlower, collectDragonfly,
    loseFlowers, loseDragonflies,
    total, hasEnoughToWin,
  };
}
