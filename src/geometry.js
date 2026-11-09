// geometry.js — the lake shape, shared between render + sim.
//
// CATS-143 adds finishShoreRect — the finish scene stamp's world rect (a RENDER concern,
// but shared by render.js + systems/decor.js, so it lives with the other shared shape
// math instead of being re-derived in two draw files).
//
// CATS-68 follow-up (user request "make the lake narrower, round left/right shores,
// upper/lower shores, objects swim only in the lake, entire lake swim-able"). The lake is now
// a STADIUM (pill): a flat body capped by two semicircles. That is the literal read of "round
// left shore, round right shore" (semicircular ends) + "shores on the upper and lower edges"
// (flat horizontal edges). A green grass field fills everything outside the pill, so a textured
// shore shows on all four sides.
//
// SPEC DEVIATION (flagged): CATS-66 §1 modeled the lake as an ELLIPSE chord and kept the chord
// purely render-time ("the oval is a render concern … never in the sim"). To confine objects to
// the lake (#3) AND make the whole lake swim-able, the shape now also constrains the SIM — the
// boat's vertical soft-walls and the entity spawn/drift bounds read chordHalf()/lakeMidY() here.
// This is a pure, deterministic function of (x, config) only — no new state, no new time source —
// so the fixed-timestep sim stays deterministic. Documented so the architect can weigh in; the
// shape is a single tunable knob set, so reverting to an ellipse is a one-function edit.

import { getTexture } from './assets.js';

// Vertical center of the lake (world-y). The lake is centered in the GROUND band (everything
// below the sky-landscape strip) so the green shore reads evenly on top and bottom.
export function lakeMidY(cfg) {
  const skyH = cfg.skyLandscape.height;
  return skyH + (cfg.camera.viewportHeight - skyH) / 2;
}

// Half-height of the lake water at a given world-x — the stadium chord.
//   straight body (homeX+capR .. shoreX-capR) → lakeHalfHeight (full width)
//   left cap  (homeX .. homeX+capR)           → semicircle, 0 at homeX → capR at the body
//   right cap (shoreX-capR .. shoreX)          → semicircle, capR at the body → 0 at shoreX
// capR defaults to lakeHalfHeight (a true stadium); exposed as a knob so the round caps can be
// tuned without re-deriving.
export function chordHalf(cfg, x) {
  const { homeX, shoreX, lakeHalfHeight } = cfg.world;
  if (x <= homeX || x >= shoreX) return 0;
  const capR = cfg.world.lakeCapRadius ?? lakeHalfHeight;
  const H = lakeHalfHeight;
  // left semicircle cap
  if (x < homeX + capR) {
    const d = homeX + capR - x; // 0 at body start, capR at the home point
    return Math.sqrt(Math.max(0, H * H - d * d));
  }
  // right semicircle cap
  if (x > shoreX - capR) {
    const d = x - (shoreX - capR);
    return Math.sqrt(Math.max(0, H * H - d * d));
  }
  return H; // straight body
}

// The swim-able vertical bounds [top, bottom] at world-x for an object of radius `r` — the lake
// shape ERODED by r (CATS-97). This is the true erosion of the stadium, not a vertical-only inset:
// in the cap regions the inset boundary is the arc of radius (lakeHalfHeight − r) about the same
// cap center, so a round object clamped to these bounds stays fully inside the water even
// diagonally at the rounded caps (a vertical-only inset let it poke over the shore near a tip).
// With r = 0 this is exactly chordHalf(x). Where the eroded shape is too pinched for the object,
// both bounds collapse to the center line — the object parks mid-channel.
export function swimBoundsAt(cfg, x, r = 0) {
  const mid = lakeMidY(cfg);
  const { homeX, shoreX, lakeHalfHeight: H } = cfg.world;
  const capR = cfg.world.lakeCapRadius ?? H;
  const Rin = H - r; // eroded body half-height = eroded cap arc radius
  if (x <= homeX || x >= shoreX || Rin <= 0) return { top: mid, bottom: mid };
  let half;
  if (x < homeX + capR) {
    const d = homeX + capR - x; // 0 at body start → capR at the home point
    half = Math.sqrt(Math.max(0, Rin * Rin - d * d));
  } else if (x > shoreX - capR) {
    const d = x - (shoreX - capR);
    half = Math.sqrt(Math.max(0, Rin * Rin - d * d));
  } else {
    half = Rin; // straight body
  }
  if (half <= 0) return { top: mid, bottom: mid };
  return { top: mid - half, bottom: mid + half };
}

// CATS-128: where the FINISH approach begins — the start of the lake's right cap, the zone
// in which the water narrows toward the win line (shoreX) and the shore naturally funnels
// the boat to the finish. Border bumps past this x are EXEMPT from dragonfly loss (and the
// steering meter reads green), so crossing the finish line never costs the jar. Pure
// function of config, same cap derivation as swimBoundsAt.
export function finishSafeFromX(cfg) {
  const capR = cfg.world.lakeCapRadius ?? cfg.world.lakeHalfHeight;
  return cfg.world.shoreX - capR;
}

// CATS-128: distance (px) from a hull at (x, y) of radius r to the nearest BEACH LINE —
// the top/bottom swim bounds at its x (the steering hazards). The home-shore wall is a
// taxable border too but sits BEHIND the boat along the crossing axis, not a steering
// hazard, so it is excluded here: the gauge reads "how close is steering about to beach
// me," and red-at-push-off (the boat starts ~6px off the home tip) must not happen. The
// finish approach is likewise not a beach line (it is exempt); callers fold
// finishSafeFromX in themselves. Smaller = closer to losing dragonflies on a bump.
export function beachProximity(cfg, x, y, r = 0) {
  const { top, bottom } = swimBoundsAt(cfg, x, r);
  return Math.min(y - top, bottom - y);
}

// CATS-143 — the finish scene stamp's world rect (round 2 anchor):
//   • RIGHT of the lake — the left edge sits past the win line (shoreX + finishGap),
//     fully on dry ground, so the stamp never touches the lake's round right cap or its
//     banks. It is still bounds-checked against the final frame (the camera's settle after
//     the CATS-98 finish push) so the whole stamp stays visible in the arriving shot.
//   • Vertically centered on the lake's mid line (the stamp is 500×250 — much shorter
//     than the ground band; top-anchoring at the waterline left it floating high), lifted
//     a touch by finishLift (round 3: "a bit up"), clamped into the ground band so it
//     always sits fully on grass.
// Size comes from the decoded texture when available (exact); until then the authored
// footprint from config (shores.art.finishWidth/finishHeight) keeps the rect — and
// everything keyed off it (the festive blend ramp, the party decor ring, the sparkles) —
// stable. Pure function of (cfg, texture cache); reads no state, advances no clock.
export function finishShoreRect(cfg) {
  const art = (cfg.shores && cfg.shores.art) || {};
  let w = art.finishWidth || 500;
  let h = art.finishHeight || 250;
  const tex = getTexture(art.finishShore);
  if (tex && tex.naturalWidth) {
    w = tex.naturalWidth;
    h = tex.naturalHeight;
  }
  // vertical: centered on the lake's mid line, lifted finishLift px, clamped into the band
  const bandTop = cfg.skyLandscape.height;
  const lift = art.finishLift || 0;
  const top = Math.max(bandTop,
                       Math.min(lakeMidY(cfg) - h / 2 - lift, cfg.camera.viewportHeight - h));
  // horizontal: clear of the lake's right cap; right-clamped so the stamp never leaves
  // the final (post-finish-push) frame — "fully fits and is visible" kept.
  const pan = cfg.camera.arrivalPan;
  const frac = pan ? pan.shoreAtFraction : cfg.camera.leadFraction;
  const settleLeft = cfg.world.shoreX - frac * cfg.camera.viewportWidth;
  const left = Math.min(cfg.world.shoreX + (art.finishGap || 10),
                        settleLeft + cfg.camera.viewportWidth - w);
  return { left, top, w, h };
}
