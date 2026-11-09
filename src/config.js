// config.js — the ONLY knob file. All tunables live here, including BOTH balance dials.
// Feel + balance are scalar sweeps over these values, never logic edits.
// See architecture.md §"Design principles baked into the structure" and game_design.md
// §"Dual-pressure balance".

// CATS-94 (audio): the procedural voice recipes are the ASSET (CATS-93) — pure data the
// audio engine (src/systems/audio.js) synthesizes. Importing them here keeps every audible
// scalar inside the one knob file: a feel sweep edits config.audio, never engine logic.
// CATS-101: the ambient bed is a family of variants (the original flat drone read as a
// "doom noise"); BED_VARIANTS + the audio.bedVariant scalar below pick which one ships.
import {
  AUDIO_RECIPES, TIER_MUL, BED_WARMER,
  BED_VARIANTS, DEFAULT_BED_VARIANT,
} from '../assets/audio/recipes.js';

// ---- The two named frogs (CATS-80 welcome card; CATS-111 rename) ----
// The player's frog is Mr. Kwak (Пан Квак) — a fixed character; CATS-111 removed his input
// field from the welcome card. The RECIPIENT is the one player-typed name, and both canonical
// defaults are per-locale. An empty/whitespace entry always falls back to the locale's
// canonical default everywhere (in-run + share URL). This is the ONE place name identity
// lives, so the welcome card, the run, and the end postcard all read the same names.
export const DEFAULT_NAMES = {
  en: { frog: 'Mr. Kwak', fern: 'My best friend' },
  uk: { frog: 'Пан Квак', fern: 'Мій найкращий друг' },
};
export function defaultFrogName(locale) {
  return (DEFAULT_NAMES[locale] || DEFAULT_NAMES.en).frog;
}
export function defaultFernName(locale) {
  return (DEFAULT_NAMES[locale] || DEFAULT_NAMES.en).fern;
}
export const NAME_MAX_LEN = 24;

// canonicalName(raw) — the rule "empty → canonical default." Trims; slices to NAME_MAX_LEN.
// Passes through a non-string as the default so an undefined world name never reads as 'undefined'.
export function canonicalName(raw, fallback) {
  return (typeof raw === 'string' && raw.trim()) ? raw.trim().slice(0, NAME_MAX_LEN) : fallback;
}

export const CONFIG = {
  // ---- Loop ----
  // Fixed timestep so the sim steps identically every frame regardless of display
  // refresh. Load-bearing for deterministic feel (bump loss + spawn cadence), not just
  // nice-to-have.
  fixedDt: 1 / 60, // seconds per update step

  // ---- World ----
  // CATS-64 lake redesign (CATS-65 §1/§8, CATS-66 §1): the world is now a straight horizontal
  // OVAL much longer than the screen. The SIM stays rectilinear on x (determinism + the
  // boat.state.x progress axis are untouched); the oval SHAPE is a render-time chord (see
  // render.js). width/height now mean the VIEWPORT (the camera window = the canvas), NOT the
  // world length — the world runs homeX..shoreX.
  world: {
    width: 900, // = camera viewport width (the render window), NOT the world length
    height: 600, // = camera viewport height
    // The crossing travels left → right. Reach shoreX to win.
    shoreX: 4260, // WAS 880 → homeX + shoreSpan (the far-shore win line)
    // Home shore: the boat pushes off just past the left bank.
    homeX: 60,
    // shore-to-shore traversal length along x. shoreX − homeX. The single biggest change.
    shoreSpan: 4200,
    // Lake geometry. The lake is a STADIUM (pill) — a flat body capped by two semicircles —
    // NOT an ellipse anymore (see geometry.js). lakeHalfHeight = half the water height in the
    // straight body + the cap radius; lakeCapRadius = the semicircle radius (= lakeHalfHeight for
    // a true stadium). Reducing lakeHalfHeight from 300 → 170 leaves a green shore band ABOVE and
    // BELOW the water (the lake no longer fills the whole vertical viewport), so the player sees
    // grass on all four sides (the round left/right caps + the flat upper/lower edges).
    lakeWidth: 4200,
    lakeHalfHeight: 170,
    lakeCapRadius: 170, // = lakeHalfHeight → true stadium (semicircular "round" end caps)
    // Soft walls that keep the boat over water. CATS-68 follow-up: these are now DERIVED from the
    // lake shape (boat.js clamps y to swimBoundsAt(x) from geometry.js), so the WHOLE lake is
    // swim-able, not just a fixed sub-band. The legacy fixed-band values below are kept only as
    // fallbacks for any caller that still reads them directly.
    boatBandTop: 150,
    boatBandBottom: 450,
    // Boat auto-rows forward at a gentle pace so the crossing advances even with no
    // input (keeps the slice's soft deadline meaningful). Steering adds to it.
    // WAS 22 → 8 (CATS-65 §2, the ~210s typical clear) → 11 (CATS-88 faster game:
    // with the 180s sunset the typical clear is now ~150s).
    autoForward: 11, // px/s baseline drift toward the far shore
  },

  // ---- Camera (render-only follow-camera, CATS-66 §2) ----
  // NEW in CATS-64. The camera is a pure view transform: a single ctx.translate applied at the
  // top of render() and undone before the HUD draws. It NEVER touches the sim (game.js /
  // boat.state.x / the shoreX win check stay in world coords). viewportWidth < shoreSpan is the
  // invariant that PROVABLY guarantees "both shores never visible at once" (asserted at load).
  camera: {
    viewportWidth: 900, // = canvas width / world.width (the window into the world)
    viewportHeight: 600, // = canvas height / world.height
    followMode: 'lead', // center the boat with a small rightward lead bias
    leadFraction: 0.40, // boat sits at ~40% of the viewport width
    clampToLake: true, // never scroll past either shore (frames embarkation + arrival)
    // CATS-88 (faster game): start moving the camera sooner. The clamp holds while
    // boatX − leadFraction·viewportWidth < minLeft — with minLeft=0 that is until boatX = 360,
    // so the boat crossed ~300 px of lake (from homeX 60, ~10s at the new pace) on a FROZEN
    // frame before tracking began: a sluggish-feeling open. homeLead pans the camera slightly
    // left of x=0 (negative camLeft): 240 releases the clamp at boatX = 120, just ~60 px
    // (~2s) of push-off, and the start frame shows the boat already at ~33% of the screen
    // (vs 7%) with home-shore grass down the left edge. The grass field + shore strip are
    // drawn with a 2000 px left margin, so the leftward pan shows more home-shore grass,
    // never a gap.
    homeLead: 240, // px of world the camera may show LEFT of x=0 (0 = the old frozen open)
    smoothing: 0, // render-side lerp on camLeft (0 = off); feel knob for the Playtester
    // CATS-98 (review follow-up): the follow now tracks the boat ALL the way to the win line
    // (the right clamp is shoreX − leadFraction·viewportWidth, so the frog holds its lead-
    // biased screen position through the final approach — no end-of-lake freeze). On the finish
    // (won / arrived_empty) the camera then eases a little FURTHER forward past that stop — the
    // finish push — so the party shore sits at shoreAtFraction of the viewport with the festive
    // ground filling the rest of the frame: "move a little more — show the full party scene."
    // Render-only, eased off the arrival clock (fixed-timestep), so the sim stays untouched.
    // shoreAtFraction must stay < leadFraction so the push reads as a deliberate step FURTHER
    // toward the party (never a pull back), and the reveal it opens past shoreX
    // ((1 − shoreAtFraction)·viewportWidth px) must stay inside the drawn grass field margin.
    arrivalPan: {
      shoreAtFraction: 0.30, // where shoreX lands across the viewport once the push settles
      // Just under the end postcard's 1.3s warm-beat delay (main.js WARM_BEAT_MS): the frame
      // settles on the party shore, THEN the card rises over it.
      seconds: 1.1, // push duration, eased in/out (≤0 = snap to the framed position)
    },
  },

  // ---- Boat (steering feel) ----
  boat: {
    radius: 16,
    // Continuous steering: held-steer accelerates the boat sideways (px/s^2).
    // Because input ramps velocity rather than snapping heading, gentle holds read as
    // gentle movement. (Since CATS-128 nothing keys off the Δv — this is feel only.)
    steerAccel: 520, // UNCHANGED — lateral dodge feel is sacred
    // WAS 180 → 70 (CATS-65 §2) → 95 (CATS-88 faster game, rescaled with the forward axis).
    rowAccel: 95, // W/S thrust along the crossing
    // Velocity drag (per second). Higher = snappier stop, also = harder "slam brake".
    drag: 2.4, // UNCHANGED
    // Cap on sideways (steer) speed — keeps evasive arcs bounded.
    maxSideSpeed: 230, // UNCHANGED
    // WAS 85 → 34 (CATS-65 §2) → 46 (CATS-88 faster game). Cruise(11) + hard-row(46) ≈ 51 px/s peak.
    maxRowSpeed: 46,
    // Soft wall bounce on the shores so the boat stays in the water. A bump above
    // wallBump.minImpactPxPerS spills dragonflies (CATS-128, outside the finish zone).
    wallRestitution: 0.25,
    // CATS-113: the lake-border BUMP — when the boat hits a shore hard enough, it gets a
    // visible bump on top of the existing bounce-back. minImpactPxPerS gates it so a boat
    // RESTING on the wall doesn't re-fire every frame.
    // CATS-132: the ONLY shore reaction now is the bump hop below — the contact-point
    // ripple FX and the pad squash are gone ("leave only the 3 jumps").
    // CATS-128 follow-up (rev 2): bumpHop — a recorded shore bump bounces Mr. Kwak + pad
    // off the surface like a ball: hopCount parabolic hops, each lower and quicker than the
    // last (height ×bounciness², duration ×bounciness per hop — real ball energy decay).
    // Render-only, comic not violent per R8/R9. Fires on EVERY recorded bump, including the
    // finish-safe zone (there the jar is exempt but the shore still knocks him bouncing).
    wallBump: {
      minImpactPxPerS: 30, // impact speed (px/s) below which a wall touch is silent
      bumpHop: {
        hopCount: 3,          // bounces per bump — the "3 times" read
        firstHopPx: 22,       // peak lift of the first hop, px above the surface
        bounciness: 0.65,     // per-hop speed retention: height ×k², duration ×k each hop
        firstHopSeconds: 0.5, // duration of the FIRST hop; later hops shrink by bounciness
      },
    },
  },

  // ---- ★ Dual-pressure balance dials (the concept's entire value) ----
  balance: {
    // CATS-128: dragonfly loss now keys off BUMPING THE LAKE BORDER (the beach line),
    // not off how sharply the boat steers. A gentle held arc, a hard reversal, a slam
    // brake — movement itself is FREE now, however abrupt; dragonflies only leave the
    // jar when the hull actually hits a shore (the same impact that fires the CATS-113
    // bump hop, gated by boat.wallBump.minImpactPxPerS). One number, one
    // trigger, readable in one place (game.js reads boat.state.wallBumps).
    //   dragonflies_lost_per_border_bump — how many dragonflies spill per recorded bump.
    //   border_loss_cooldown_frames — frames between spills while the boat GRINDS along a
    //     wall, so a held scrape taxes on a cadence instead of every single frame.
    // The FINISH approach is exempt: past finishExemptX the water narrows to a point, so
    // the border naturally funnels the boat toward shoreX — bumping the right cap's banks
    // on the way to the win line never spills (see game.js). The home wall (left) and the
    // top/bottom beach lines stay taxable everywhere else.
    dragonflies_lost_per_border_bump: 1,
    border_loss_cooldown_frames: 24, // ~0.4s at 60fps between spills on a held scrape

    // flower_loss_per_fish_size: how many flowers each fish tier EATS on contact.
    // Size-scaled, not binary — small = an annoyance, medium = a real threat, big = route
    // around it. The bouquet rides on the boat, but the flower STEMS trail down into the
    // water — so a fish below the surface can still nip them off. (Dragonflies are NOT
    // touched by a fish hit; only the player's own sharp movement spills them.)
    // Indexed by fish tier: 0 = small, 1 = medium, 2 = big.
    // Lowered from [1,3,7] → [1,2,4]: with the slower crossing one big-fish contact at 7 was a
    // near-wipe that read as punishment. 1/2/4 keeps the small→big gradient without the bouquet
    // collapsing on a single contact.
    flower_loss_per_fish_size: [1, 2, 4],

    // A single fish can only eat from the bouquet once per brief window (prevents a
    // parked boat from being drained to zero in one frame).
    fish_eat_cooldown: 0.8, // seconds
  },

  // ---- Fish contact: a STUN reaction (slowdown + control loss + gentle wobble) ----
  // The frog floats on the boat ABOVE the water; the fish swim BELOW the surface. A fish
  // contact does TWO things, both soft: (1) it NIPS flowers off the submerged stems (see
  // balance.flower_loss_per_fish_size above), and (2) it STUNS the boat — a slowdown, a
  // brief loss of control, and a gentle bounded spin/shake. The stun does NOT touch the
  // dragonflies: dragonflies only leave the jar when the hull bumps a lake border/beach
  // (CATS-128, game.js), never from a fish bump. All stun amplitudes are deliberately GENTLE and
  // BOUNDED: the user said "no sharp movements," so the shake is small and the spin is a slow
  // eased rock, never a violent whip. Bigger fish (higher tier) stun a touch longer —
  // readable, still soft.
  fishHit: {
    // How long control is lost after a fish bumps the boat (seconds). Steering/rowing
    // input is ignored while this counts down; the boat keeps drifting and only resumes
    // responding when it elapses. Scaled up a touch by fish tier so a big fish costs more.
    stunSeconds: 1.0,
    stunSecondsPerTier: 0.25, // added per tier above small (medium +0.25s, big +0.5s)

    // Velocity multipliers while stunned: heavy drag slows the boat down (the "slowdown"),
    // and the cruise baseline is cut so even auto-forward is sluggish.
    stunDrag: 6.0, // much higher than boat.drag (2.4) → a near-stop, decaying
    cruiseScaleWhileStunned: 0.4, // auto-forward is 40% while wobbled

    // A per-fish cooldown (seconds) so one parked fish can't re-stun/eat every frame.
    perFishCooldown: 1.2,

    // --- Bounded "no sharp movements" wobble (all small, eased, decaying) ---
    // SPIN: a slow rotation of the boat's drawing, bounded by spinMaxDeg. The render eases it
    // with sin(π·frac) so it ramps up, peaks mid-stun, and settles back to upright — a slow
    // rock-and-settle, never a constant spin or a snap. Keep the peak small.
    spinMaxDeg: 9,
    // SHAKE: a small position jitter (px amplitude) that decays with the stun. Tiny on
    // purpose — enough to read as "the boat is shuddering," not enough to be nauseating.
    shakeMaxPx: 2.2,
    // wobble frequency (Hz). Slow = a gentle rock; kept well below buzz territory so the
    // shake reads as a wobble, not a vibration.
    wobbleHz: 1.6,
  },

  // ---- Entity movement behavior (fish / dragonfly / flower) ----
  // CATS-76. All motion of the live entities is configured here. The three behaviors:
  //   • FISH        — FOLLOW the frog, with random direction changes, moving "sharply" (quick
  //                   zig-zags). The sharper the fish moves the CLOSER the frog is to the finish:
  //                   nearDistMult scales the twitchiness/amplitude by crossing progress (0 at home
  //                   shore → 1 at the far shore), so the pressure ramps as the boat closes in.
  //   • DRAGONFLIES — FLEE the frog (move AWAY from it), but with random "salt" so the escape
  //                   direction wanders instead of a straight-line run.
  //   • FLOWERS     — STABLE. They only drift with the current + a gentle bob; they never react
  //                   to the frog. This is the one constant the player can plan around.
  // All entities also keep their existing leftward current drift (spawn.driftSpeed) and are soft-
  // clamped into the lake chord, so none can leave the water. Fish stay rendered below the surface
  // (the follow happens in y around baseY, never breaking the water layering in render.js).
  behavior: {
    // How strongly progress (0..1 across the crossing) ramps the fish's sharpness. 0 = the fish
    // move at their baseline jitter the whole run; 1 = near the finish they are at full amplitude.
    progressToSharp: 1,
    // CATS-113: the shared ±10° self-rotation both critters rock through around their own
    // center while they move. The render reads each entity's velocity + this knob; it never
    // touches the sim. wobbleHz = how fast the rock cycles; wobbleDeg = the peak tilt (10 = the
    // issue's "10 degrees up and down").
    motionWobble: {
      wobbleDeg: 10, // peak rotation around own center, degrees (the ask)
      wobbleHz: 1.4, // cycles per second — a lazy rock, not a buzz
    },
    fish: {
      // Base wander speed (px/s). Sets how quickly vy snaps toward each new random target (the
      // ambient roaming + the snap rate of the zig-zags).
      baseSpeed: 90,
      // SIGHT radius (px). A fish only NOTICES the frog (and turns to follow it) when the boat is
      // within this distance; outside it the fish just roams. So a fish "sees Mr. Kwak → changes
      // direction toward him," rather than homing from across the whole lake.
      sightRadius: 150,
      // FOLLOW pull toward the boat's y, as a per-second easing rate (1 - e^(-followSpeed·dt)).
      // ~1.5 → the fish noticeably turns toward Mr. Kwak within ~1s of spotting him. High enough that
      // the "sees Mr. Kwak → changes direction toward him" read is visible; the random direction
      // changes still keep it a nosing chase, not a homing lock.
      followSpeed: 1.1,
      // Range (px/s) of the random target velocity chosen each reseed — the "sharply changing
      // direction" zig-zag amplitude. vy snaps toward a fresh target in [-sharpSpeed, +sharpSpeed].
      sharpSpeed: 50,
      // How often a new random direction is chosen, on average (seconds). Lower = twitchier.
      reseedSeconds: 2.5,
      // Multiplier on sharpSpeed as the boat nears the finish: sharpness = 1 + near * thisMul,
      // where `near` scales 0→1 with progress*progressToSharp. So a fish ~3× twitchier at arrival.
      sharpnessNearFinishMul: 1.1,
      // Max vertical wander amplitude (px) around the follow lane, so the chase stays a
      // bounded weave and never a violent whip (the user's "no sharp movements" applies to the
      // boat; the fish read as quick, but bounded).
      wanderAmp: 5,
      // CATS-113: the fish NEVER swims a straight line — a continuous sinusoidal wave is
      // layered onto every fish path (ambient roaming AND chase). This is the wave the issue
      // asks for, on top of (not replacing) the CATS-76 follow/zig-zag behavior.
      //   waveAmp / waveSeconds — the wave's height (px) and period (s). Deliberately small +
      //   slow so it reads as the water carrying the fish, not as a new dodge pressure: the
      //   wave must never push the fish out of reach of the player's own dodging.
      waveAmp: 6,
      waveSeconds: 2.2,
      // CATS-113: when a fish SEES the frog, it never moves straight up or down — the chase is
      // DIAGONAL. minXSpeed is the fish's floor of horizontal closing speed while it sees the
      // boat (px/s, leftward — the drift carries it toward the frog anyway). With any vertical
      // component, the approach vector stays diagonal; minXSpeed = 0 would let a fish park
      // directly under Mr. Kwak and chase purely vertically.
      chaseMinXSpeed: 18,
    },
    dragonfly: {
      // FLEE speed away from the boat (px/s). They pull away when the frog is near.
      fleeSpeed: 80,
      // Ambient wander speed (px/s) when the boat is far — a lazy flit so a still dragonfly
      // still reads as alive.
      baseSpeed: 34,
      // SIGHT / flee radius (px). A dragonfly only NOTICES the frog when the boat is within this
      // distance; inside it the dragonfly ESCAPES — it picks a new direction away from Mr. Kwak (with
      // salt) and accelerates along it. Outside it the dragonfly just ambles. Bumped to match the
      // fish sight radius so "sees Mr. Kwak → reacts" feels consistent across both critters.
      fleeRadius: 150,
      // The random "salt": max angular jitter (radians) added to the flee direction each reseed,
      // so the escape path wanders instead of a straight line away.
      saltRadians: 1.1,
      reseedSeconds: 1,
    },
    flower: {
      // STABLE: no reactive behavior. Only the bob amplitude (px) for life, applied in render.
      bobAmp: 1.5,
    },
  },

  // ---- Gifts ----
  gifts: {
    // CATS-76 review: widened so Mr. Kwak catches more precisely — a near pass now reliably scoops the
    // gift instead of grazing past it. The dragonfly radius stays a touch wider than the flower
    // (it is the moving "steer near" target; the flower is the stable, easy pickup).
    collectRadiusFlower: 34, // proximity pickup for flowers
    collectRadiusDragonfly: 42, // proximity pickup for dragonflies (wider — "steer near")
    // Win requires at least one gift of either type ("not empty-handed").
    minGiftsToWin: 1,
  },

  // ---- Sunset (soft deadline — never a death-clock) ----
  sunset: {
    // Total crossing time budget in seconds. Drains slowly; reaching the far shore wins.
    // Running out = soft fail, not a hard game-over.
    // WAS 90 → 240 (CATS-65 §5, the ~210s crossing) → 180 (CATS-88 faster game): the forward
    // axis is quicker (autoForward 8→11, rowAccel 70→95, maxRowSpeed 34→46), so a typical
    // clear is now ~150s and the sunset expires at 180s — the same ~30s grace window the
    // design kept over a typical run, still comfortably under the <5min criterion.
    duration: 180,
  },

  // ---- Fish-hit invulnerability grace (prevents instant re-stun) ----
  // There is no longer a soft-respawn-with-checkpoint system: a fish bump stuns the boat
  // (slowdown + control loss + gentle wobble), it never teleports or resets the run. To
  // keep one parked fish from re-stunning the boat every single frame, the boat is briefly
  // immune to further fish contact right after a hit, and each fish has its own per-fish
  // cooldown too (see fishHit.perFishCooldown). This is a short safety window, not a
  // respawn.
  fishGrace: {
    // Seconds the boat ignores further fish contact after a hit, so the stun can finish
    // playing out and the player can recover before another bump. Kept short so it never
    // reads as "invincible."
    invulnSeconds: 0.6,
  },

  // ---- Stretch-based progression (Phase 1 layered onboarding) ----
  // The lake unfolds in 4 stretches home-shore → party-shore (game_design.md §Concept 4
  // "Progression"). Each stretch is a band of the lake width; the band the boat is IN
  // decides what spawns. One system is introduced per stretch — never front-loaded — so a
  // fresh player learns the single dodge rule before anything else layers on.
  //
  // Stretch bounds are FRACTIONS of the crossing (0 = home shore, 1 = party shore). They
  // are independent of pixel width, so the progression survives a world resize. There are
  // 4 stretches but only 3 internal boundaries — see stretchBounds (cumulative).
  stretch: {
    // Boundaries between stretches, as cumulative fractions of (shoreX − homeX).
    //   [ 0.25, 0.50, 0.75 ] → stretch 1 = 0..0.25, 2 = 0.25..0.50, 3 = 0.50..0.75, 4 = 0.75..1
    bounds: [0.25, 0.50, 0.75],
    // Per-stretch onboarding labels (shown in the HUD stretch chip; pure data, see story.js).
    labels: [
      'The Gentle Shore', // 1: flowers + tiny fish — learn "dodge to save flowers"
      'Dragonfly Bend',   // 2: dragonflies added — learn "steer smooth to keep them"
      'The Middle Stretch', // 3: medium fish + tighter lanes — the two pressures first collide
      'The Far Reaches',  // 4: big fish + gift clusters — full intensity as sunset shortens
    ],
  },

  // Per-stretch spawn profiles. Spawner keys composition + cadence off the CURRENT
  // stretch the boat occupies. Each profile is the balance dial for that stretch; the
  // layered onboarding lives here as data, not logic.
  //
  //   fishTiers    — weighted pool of {tier, weight} that MAY spawn this stretch. An empty
  //                  set (stretch 1) means no fish. Stretch 2 still has no medium fish —
  //                  dragonflies are the ONLY new thing introduced there, per the spec.
  //   flowerInterval / dragonflyInterval / fishInterval — seconds between spawns (density).
  //   lane          — how tightly fish cluster onto a shared lane line (0 = scattered,
  //                   1 = aligned). Tighter lanes = harder smooth passes in late stretches.
  //   clusterGifts  — when true, flowers/dragonflies spawn biased TOWARD fish positions
  //                   (the late-stretch dual-pressure knot: the gift you want sits by the
  //                   fish you must avoid). Off early so onboarding stays gentle.
  spawn: {
    profiles: [
      // Stretch 1 — The Gentle Shore: flowers only + a few tiny fish. No dragonflies yet.
      // The player learns the single rule "fish eat flowers, so dodge" with tiny fish that
      // barely cost anything, so the lesson is gentle, not punishing.
      // CATS-64: spawn intervals scaled up ~3.5× (a first pass) for the ~4.2× longer crossing —
      // the old cadence would meet the player ~4× more of each entity. Looser, not tighter;
      // the Game Designer (CATS-65 §4) left the final dial to the Playtester (CATS-71).
      {
        flowerInterval: 3.5,
        dragonflyInterval: Infinity, // no dragonflies introduced this stretch
        fishInterval: 14.0,
        fishTiers: [{ tier: 0, weight: 1 }], // tiny fish only
        lane: 0.15,
        clusterGifts: false,
      },
      // Stretch 2 — Dragonfly Bend: DRAGONFLIES are introduced (the only new system here).
      // Fish stay tiny so the new sharp-movement loss can be felt in isolation before the
      // medium fish arrives and the two pressures collide. This is the load-bearing
      // onboarding moment: "steer near to gather, steer smoothly to keep them."
      // CATS-100: dragonflyInterval 7.0 → 4.5 (the "more dragonflies" ask) — the tier-3
      // band of the density retune below.
      {
        flowerInterval: 4.8,
        dragonflyInterval: 4.5,
        fishInterval: 14.0,
        fishTiers: [{ tier: 0, weight: 1 }],
        lane: 0.25,
        clusterGifts: false,
      },
      // Stretch 3 — The Middle Stretch: MEDIUM fish introduced (the real threat the
      // trade-off hinges on) + tighter lanes. Now dodge-sharply and steer-smooth pull in
      // opposite directions for the first time — the dual pressure the concept is built on.
      // CATS-100: dragonfly cadence tightened 7.5 → 5.0 with the rest of the dragonfly retune
      // (the "more dragonflies" half of the report).
      {
        flowerInterval: 4.8,
        dragonflyInterval: 5.0,
        fishInterval: 12.0,
        fishTiers: [{ tier: 0, weight: 2 }, { tier: 1, weight: 5 }],
        lane: 0.55,
        clusterGifts: true,
      },
      // Stretch 4 — The Far Reaches: BIG fish introduced (route-around threats, never
      // predators per R8) + the tightest lanes + gift clusters, at full intensity as the
      // sunset shortens. Both gifts must stay live-and-worth-saving through here.
      // CATS-100: the big-fish fix. Tier-2 previously appeared in ~50% of runs (tier2 weight
      // 2/8 with fishInterval 10.5 over the ~18 s the finish guard lets stretch 4 spawn for
      // — the guard stops all spawns once the party shore is on screen, ~boatX 3720, halfway
      // through this stretch). fishInterval 10.5 → 6.0 and the tier-2 weight 2 → 4 (of 10)
      // lift the expectation to ~2 big fish per typical run; the small-tier weight 2 → 1
      // keeps the big-fish stretch reading big (they are the headliners per game_design.md
      // "route around it", not one shape among three). Verified by a 20k-run headless
      // cadence sim; see the CATS-100 PR description for the before/after table.
      {
        flowerInterval: 5.0,
        dragonflyInterval: 5.0,
        fishInterval: 6.0,
        fishTiers: [{ tier: 0, weight: 1 }, { tier: 1, weight: 5 }, { tier: 2, weight: 4 }],
        lane: 0.75,
        clusterGifts: true,
      },
    ],

    // Shared geometry / constants across all stretches.
    fishRadiusPerTier: [14, 22, 34],
    flowerRadius: 9,
    dragonflyRadius: 7,
    // Entities drift slowly leftward (toward home shore) so the advancing boat meets them.
    driftSpeed: 26,
    // How far ahead of the boat (px, along x) new entities spawn, clamped to the right
    // edge. Spawning ahead-of-boat (not always at the far right) keeps the next onboarding
    // beat arriving promptly and lets a new stretch's content appear as the boat enters it.
    leadAhead: 360,
    // CATS-76: how far past the right edge of the screen new entities appear, so they swim
    // leftward INTO view from the right shore's side (the party shore the boat is heading to)
    // instead of popping into existence mid-lake. Clamped to stay inside the lake.
    rightShoreLead: 220,
    // CATS-97: the home-shore border fade. Entities drifting left touch the lake border (the
    // eroded-lake bound at their own radius); from that touch they fade out over `seconds`
    // and retire at full fade — they softly melt into the shore, never slide onto the grass.
    // The boat is NOT faded (it bounces off the home wall instead).
    borderFade: {
      seconds: 1.6, // fade duration once the border is touched
    },
    // CATS-76 review: pre-fill the lake with flowers when a run starts so Mr. Kwak pushes off into a
    // lake that is ALREADY blooming, not an empty stretch of water. The seed is laid down once at
    // reset (game.js), spread across the lake in front of the home shore (see initialFlowers).
    initialFlowers: {
      // How many flowers to scatter on reset.
      count: 36,
      // The flowers span from this many px ahead of the home shore, across the lake toward the
      // far shore. A lead so the immediate view is full and the bloom thins toward the horizon.
      startLead: 120,
      // Fraction of (shoreX − homeX) the seed field covers, measured from the home shore. 0.85 =
      // bloom reaches most of the way across so there is always something in reach early.
      spanFraction: 0.85,
      // Jitter (px) on each flower's x so the field looks scattered, not gridded.
      scatterX: 40,
    },
    // Cull entities that drift off the left edge.
    // CATS-113: "at least one big fish once the frog passes The Far Reaches." The regular
    // stretch-4 pool only PROBABILISTICALLY yields a big fish; this guarantee fires once per
    // run when the boat first enters stretch 4 (index 3, "The Far Reaches") — if no LIVE big
    // fish exists, one spawns in ahead of the boat from the same right-side entry path as any
    // other fish. One-shot per run (reset clears it), so it never stacks fish on re-entry.
    farReachesBigFish: {
      stretchIndex: 3, // The Far Reaches (cfg.stretch.labels[3])
      tier: 2,         // the big fish tier
      offsetAhead: 480, // px ahead of the boat the guaranteed fish enters at
    },
  },

  // ---- Palette (day-cycle arc; mood only, never a death-clock) ----
  // Four warm stops across the run: sun rises (dawn pastels), peaks (bright noon), and sets
  // (golden sunset → soft warm twilight). The cold 'night' stop is intentionally dropped so
  // an expired run (progress 0) lands on warm dusk, not punishing dark — R7: the fail state
  // never reads as a loss. Each stop tints sky + water + the sun disc + an ambient wash.
  // 'noon' reuses the old 'day' blues; 'sunset' reuses the old 'dusk' golds, so the existing
  // mood the game already ships is preserved at those moments.
  palette: {
    dawn:   { sky: '#f6c6d4', water: '#7a93b8', sun: '#ffe1b0', ambient: '#fff4f8' }, // pastel pink/lavender
    noon:   { sky: '#cfe8ff', water: '#2f6d9c', sun: '#fff4c2', ambient: '#ffffff' }, // bright blue (= old day)
    sunset: { sky: '#f3a86b', water: '#3b4a7a', sun: '#ffd27a', ambient: '#ffe8c8' }, // golden (= old dusk)
    dusk:   { sky: '#5f4878', water: '#243049', sun: '#e07a3a', ambient: '#caa0c0' }, // warm deep twilight (replaces night)
    // Anchor position of each stop on the timer's 1.0→0.0 progress. Strictly descending.
    // noon sits at 0.5 so the palette's brightest moment lines up with the sun's peak.
    anchors: { dawn: 0.90, noon: 0.50, sunset: 0.10, dusk: 0.00 },
  },

  // ---- Sky-landscape timer (replaces the flat sunset bar, CATS-47) ----
  // A sky strip along the top: a sun that arcs left→right as the timer drains, soft
  // semi-transparent clouds, with the palette above tinting sky + water. The sun's left→right
  // position IS the timer readout; the palette shift is mood only (R7: never punishing).
  // Canvas 2D primitives only — arcs (sun), ellipses (clouds), globalAlpha (translucency).
  // Sun/cloud look = Asset Designer recipe (assets/sprites/sky/README.md, CATS-51).
  skyLandscape: {
    // Height of the sky strip in px. The band the sun arcs through; the waterline (top of the
    // water fill) sits at the bottom of this strip.
    // CATS-74: doubled (40 → 80) so the landscape timer strip reads ~2× wider/taller; the whole
    // band scales, so the sun arc, cloud base y, and waterline all move together (no layout shift).
    height: 80,
    // The sun. arcFrac = 1 − progress, so progress 1.0 → sun at LEFT horizon (dawn),
    // progress 0.5 → sun at peak (noon), progress 0.0 → sun at RIGHT horizon (sunset).
    // x = arcFrac · worldWidth; y = waterline − arcLift·height·sin(π·arcFrac).
    sun: {
      radius: 9,
      // Peak lift of the arc above the waterline, as a fraction of skyLandscape.height.
      arcLift: 0.78,
      // Halo: stacked low-alpha flat arcs drawn first (aura, not a body). Tint FIXED across
      // the cycle (stays warm-white so it reads as sun, not a day-cycle color).
      glow: { radiusMul: 2.6, alpha: 0.28, tint: '#fff6e0' },
      // Core: bright warm-white drawn last on top of the disc. FIXED tint — this is what makes
      // a pale dawn sun separate from a pale dawn sky (the weak-read fix, CATS-51).
      core: { radiusMul: 0.55, tint: '#fffdf2' },
      // disc fill = pal.sun (data-driven, NOT a fixed config color) — set each frame.
      // CATS-79: the sun is now an ASSET — sky.js stamps this SVG (halo + disc + core at the
      // authored ratios) and repaints the disc circle in place with the day-cycle fill; the
      // halo + core tints stay fixed in the SVG. Until it decodes, the CATS-51 parametric
      // recipe below stays as the fallback, so a missing asset never breaks the clock.
      sprite: 'assets/sprites/sky/sun.svg',
      // CATS-79 horizon hue boost: at the START and FINISH of a run the sun sits on the horizon,
      // partially hidden behind the shore-strip treeline (drawn OVER the sky band). While the
      // disc is in that window, its fill blends toward this saturated warm gold — "more hue"
      // exactly where the sun kisses the treeline, washing back to the plain day-cycle palette
      // as it climbs. window = fraction of the arc from each end the blend spans; strength =
      // peak blend (1 = fully the glow tint AT the horizon itself).
      horizonGlow: { tint: '#ffb347', window: 0.2, strength: 0.55 },
    },
    // Clouds: a few semi-transparent puffs drifting slowly. Pure decoration — drawn BEFORE the
    // sun every frame so they never occlude the only clock (load-bearing paint order). Drift
    // advances in the fixed-timestep update (deterministic), independent of timer progress.
    clouds: {
      count: 3,
      alpha: 0.55,
      driftSpeed: 8,        // px/s, slow + ambient; NOT a gameplay signal
      puffsPerCloud: 3,
      puff: { radiusMul: 0.42, squash: 0.62, overlap: 0.55 },
      tint: '#fbf6ee',      // warm-white base; lerped toward pal.ambient so clouds warm at sunset
      liftTint: '#ffffff',  // crest puff — the warm-light-bias accent
    },
  },

  // ---- Shores (CATS-68 follow-up: narrower lake + textured green shores all around) ----
  // The whole ground band (below the sky-landscape strip) is the grass field; the lake is a
  // stadium "hole" of water cut into it, so a textured green shore shows on all four sides.
  // Textures are the Asset Designer's tileable SVGs (assets/sprites/lake/*.svg). The field uses
  // the plain home tile; the far (party) shore region is over-stamped with the festive tile so
  // arrival reads as the lit-up destination (per assets/sprites/lake/README.md §2).
  shores: {
    grassTile: 'assets/sprites/lake/shore_grass.png',        // home shore / field
    festiveTile: 'assets/sprites/lake/shore_grass_festive.png', // far (party) shore
    // How wide the festive over-stamp is around the far shore (world-px), so the party shore
    // lights up as Mr. Kwak approaches. Round 2: 900 — a long lead-in. Round 3: 1350 —
    // even softer, the plain meadow dissolves into the party ground across the whole
    // final stretch.
    festiveReach: 1350,
    // CATS-143 (round 2): the blend is a long patchy cross-fade, painted in fixed-width
    // strips of the same pattern. The smoothstep ramp only reaches full strength AT the
    // finish scene art ("fully festive only around the finish_shore"); a smooth sinusoidal
    // PATCH dither (festivePatchDepth) lets regular grass show through here and there for
    // dimension; festiveMaxAlpha < 1 keeps a faint plain-grass presence even at peak.
    // Round 3: finer strips + a lower peak — gentler still.
    festiveBlendStripWidth: 32, // px per blend strip (smaller = smoother)
    festiveMaxAlpha: 0.88,      // peak festive opacity (1 = opaque slab)
    festivePatchDepth: 0.38,    // how deep the grassy patches cut (0 = none, 1 = full)
    // CATS-143: the twinkle of sparkles over the finish scene art. count/size/alpha shape the
    // stars; periodMin..periodMax is each star's twinkle cycle (hash-picked per star), so the
    // glimmer desynchronizes across the art — light playing on the party, never a strobe.
    // Round 2: softer + warm yellow-orange. Round 3: bigger stars (size 3.2).
    finishSparkle: {
      count: 16,
      size: 3.2,     // star arm scale (px)
      alpha: 0.62,   // peak alpha per twinkle
      periodMin: 1.6, // s — fastest twinkle cycle
      periodMax: 3.4, // s — slowest
      colors: ['#ffdf9e', '#ffc76b', '#ffe3ad'],
    },
    // CATS-105: placeholder scene stamps drawn once on the grass bands at the two ends of
    // the crossing — the start reads "frog home + berry/mushroom garden," the finish reads
    // "the party: many happy frogs, lanterns, flower garden." Stamps, not tiles: render.js
    // drawShoreArt anchors homeShore's right edge at homeX; the finish stamp sits clear of
    // the lake's right cap, vertically centered on the lake's mid line (geometry.js
    // finishShoreRect, CATS-143), drawn after the water fill. finishWidth/finishHeight are
    // the pre-decode fallbacks for that anchor (the decoded texture takes over once loaded).
    // A missing SVG degrades to plain grass.
    art: {
      homeShore:   'assets/sprites/shore_art/home_shore.png',
      finishShore: 'assets/sprites/shore_art/finish_shore.png',
      finishWidth: 500,  // authored finish_shore.png footprint (pre-decode fallback)
      finishHeight: 250,
      finishGap: 60,     // px of dry grass between the lake's cap tip and the stamp (r3: a bit right)
      finishLift: 36,    // px the stamp rides above the lake's mid line (r3: a bit up)
    },
  },

  // ---- Grass-bank decoration objects (CATS-123) ----
  // Small hand-drawn objects stamped on the grass banks around the lake (the bands above
  // and below the water) so the shore reads as a lived-in place, not a repeating tile.
  // Three pools in three x-zones (see systems/decor.js): the mid-lake banks use the
  // lake/grass pool; the home-shore approach uses lake/start; the party-shore approach
  // uses lake/finish. Placement is a pure hash of (per-run seed, zone, cell) — stable
  // within a run, but every replay reshuffles it (game.js reset() → rerollDecor()), so
  // each run lays the meadow out anew. cellWidth is tuned so a full 900px camera window
  // holds roughly 14–18 objects (the CATS-123 follow-up doubled the original ≤10 cap;
  // verify_cats123.py sweeps every reachable camLeft).
  decor: {
    scaleMin: 0.8,  // sprite scale range (footprints ~26–67px tall on a 90px bank band)
    scaleMax: 1.05,
    zoneInset: 12,  // px of breathing room between a themed zone and its CATS-105 shore stamp
    zoneWidth: 560, // each themed zone's width (world px), covering the shore-approach view
    zoneGap: 70,    // undecorated gap between a themed zone and the mid-lake zone
    grass: {
      seed: 11, cellWidth: 115, fill: 0.95,
      sprites: [
        'assets/sprites/lake/grass/shore_strip - Copy (11).png',
        'assets/sprites/lake/grass/shore_strip - Copy - Copy (2).png',
        'assets/sprites/lake/grass/shore_strip - Copy - Copy.png',
        'assets/sprites/lake/grass/shore_strip - Copy.png',
        'assets/sprites/lake/grass/stone.png',
        'assets/sprites/lake/grass/white_flower.png',
        'assets/sprites/lake/grass/yellow_flower.png',
      ],
    },
    start: {
      seed: 23, cellWidth: 115, fill: 0.95,
      sprites: [
        'assets/sprites/lake/start/blue_1.png',
        'assets/sprites/lake/start/shore_strip - Copy (10).png',
        'assets/sprites/lake/start/shore_strip - Copy (9).png',
        'assets/sprites/lake/start/strawberry.png',
        'assets/sprites/lake/start/white_flower.png',
      ],
    },
    finish: {
      seed: 37, cellWidth: 115, fill: 0.95,
      // CATS-143: the lake/finish objects pulse with a soft warm glow (see party below).
      // radius = halo size as a fraction of the sprite (round 2: smaller, tighter).
      pulse: { hz: 0.5, color: '255,244,200', strength: 0.35, radius: 0.5 },
      sprites: [
        'assets/sprites/lake/finish/mush.png',
        'assets/sprites/lake/finish/shore_strip - Copy - Copy - Copy.png',
        'assets/sprites/lake/finish/stone.png',
        'assets/sprites/lake/finish/white_1.png',
        'assets/sprites/lake/finish/white_2.png',
      ],
    },
    // CATS-143: the party ring — a DENSE second pass of the same finish pool wrapping the
    // whole arriving frame: partyMargin left of the art, across it, and on to
    // partyRightSpan past the win line. rightBank (round 2) adds band 2 — the open
    // right-side meadow level with the lake — so objects are not only on the top and
    // bottom banks but also on the right shores around the art. overArt: drawn AFTER the
    // finish art (drawFinishDecor). cellWidth 70 + fill 1.0 keeps the destination visibly
    // richer than the approach, the "even more finish objects" ask.
    partyMargin: 90,
    partyRightSpan: 780,
    party: {
      seed: 51, cellWidth: 70, fill: 1.0, overArt: true, rightBank: true,
      rightBankCellWidth: 28, // band 2's finer lattice — the visible right ground is narrow
      pulse: { hz: 0.55, color: '255,244,200', strength: 0.4, radius: 0.5 },
      sprites: [
        'assets/sprites/lake/finish/mush.png',
        'assets/sprites/lake/finish/shore_strip - Copy - Copy - Copy.png',
        'assets/sprites/lake/finish/stone.png',
        'assets/sprites/lake/finish/white_1.png',
        'assets/sprites/lake/finish/white_2.png',
      ],
    },
    // CATS-143 round 3: a few random mushrooms hugging the finish scene stamp's EDGE —
    // straddling its border so the art reads planted in the meadow. Hash-scattered per
    // run (same reshuffle contract as the zones), drawn with the party ring's soft pulse.
    edgeScatter: {
      seed: 67, count: 6,
      sprite: 'assets/sprites/lake/finish/mush.png',
      scaleMin: 0.8, scaleMax: 1.05,
    },
  },

  // ---- Sprite paths (CATS-76) ----
  // Where the SVG for each entity/object lives, so render.js drawX functions swap the graybox
  // primitives for sprites by keying off these (one path per entity kind; fish keyed by tier).
  // A missing/failed SVG load degrades gracefully to the graybox primitive (assets.js resolves
  // to null and the draw function no-ops the overlay) — art never breaks the loop. The lily-pad
  // boat base stays a canvas ellipse (matches the palette exactly per assets/HANDOFF.md); Mr. Kwak
  // sits on top of it.
  sprites: {
    frog: {
      // Pose-keyed: idle default, steer-lean while steering (mirrored left/right), clutch when a
      // fish is near. See assets/HANDOFF.md.
      idle:          'assets/sprites/pip/pip_idle.png',
      steer:         'assets/sprites/pip/pip_steer_lean.png',
      clutch:        'assets/sprites/pip/pip_clutch_bouquet.png',
    },
    // Fish tiers, indexed 0/1/2. Face LEFT (toward the boat), matching the graybox drawFish.
    fish: [
      'assets/sprites/fish/fish_tier0_small.png',
      'assets/sprites/fish/fish_tier1_medium.png',
      'assets/sprites/fish/fish_tier2_big.png',
    ],
    flower:     'assets/sprites/flower/flower.png',
    dragonfly:  'assets/sprites/dragonfly/dragonfly.png',
  },

  // ---- CATS-113: the wake trace on the water where Mr. Kwak swam ----
  // A trail of fading foam marks dropped behind the boat as it moves. World-space, aged on
  // the fixed timestep (never wall-clock), drawn UNDER the boat. `dropSeconds` = spacing of the
  // drops along the path (the trace reads as a dotted wake line, not a solid smear);
  // `lifetime` = how long each mark lingers on the water; `minSpeed` = the boat must be moving
  // at least this fast to leave a mark (a parked boat leaves no trace).
  wake: {
    dropSeconds: 0.22,
    lifetime: 3.2,
    minSpeed: 6, // px/s total speed below which no mark drops
    maxMarks: 30, // hard cap on live marks (oldest dropped) — same guardrail as fx.js
  },

  // ---- Visual-effect (particle) layer (CATS-60 foundation) ----
  // Canvas-primitive only — no art pipeline (same budget as render.js). The three environmental
  // reactions (CATS-61 sparkle/shine, CATS-62 ripple) spawn into this; render.js paints each type.
  //   lifetime     — seconds an effect of this type lives before retiring (aged on the fixed
  //                  timestep, never wall-clock — see systems/fx.js).
  //   maxConcurrent — hard cap on live effects of one type (oldest is dropped past it): the burst
  //                  flood guardrail flagged in the PO review.
  //   minInterval  — min seconds between spawns of one type (collapses a sub-interval burst to one
  //                  spawn). Both throttle knobs are on; either can be widened with no logic change.
  //   params       — per-type render knobs, stored on each spawned effect so render reads a flat
  //                  field (a spawn call may override any of these).
  fx: {
    types: {
      // Sparkle — dragonfly catch (CATS-61). The cute reward: brief twinkle + dissolve.
      sparkle: {
        lifetime: 0.7,
        maxConcurrent: 8,
        minInterval: 0.04,
        params: { count: 6, reach: 16, size: 1.6, colors: ['#fff6c8', '#ffe08a', '#ffffff'] },
      },
      // Shine — flower pickup (CATS-61). The wholesome reward: a warm swell on the water.
      shine: {
        lifetime: 0.9,
        maxConcurrent: 6,
        minInterval: 0.06,
        params: { radius: 22, color: '#fff3d6' },
      },
      // Ripple — sharp-movement spill + fish meet (CATS-62). TONE-LOCKED (R9): a gentle, lazy
      // expanding ring, same calm family as the ambient fish ripple. Never a warning cue.
      ripple: {
        lifetime: 1.2,
        maxConcurrent: 12,
        minInterval: 0.05,
        params: { radius: 30, width: 2, color: 'rgba(223,243,255,0.8)' },
      },
    },
  },

  // ---- Progression markers (CATS-68 follow-up: backstroke-flag lines at stretch boundaries) ----
  // A line of backstroke flags at each stretch boundary, labeled with the stretch you are
  // entering. Lives in WORLD space (scrolls with the camera). The labels reuse config.stretch.
  // labels (the Stretch-based progression labels) — localized, set in main.js.
  progression: {
    // Pennant count along each boundary's flag line (spans the swim-able water height).
    pennants: 6,
    // Pennant size (px). Small triangular flags hanging off a taut string.
    pennantW: 10,
    pennantH: 14,
    // Pennant + label colors. Warm + soft — never a warning read (R7).
    lineColor: 'rgba(255,255,255,0.35)',
    pennantColors: ['#f3c969', '#e8a87c', '#c38d9e'],
    labelColor: 'rgba(255,250,235,0.92)',
  },

  // ---- Readout ----
  debug: {
    // CATS-130: the on-screen steering/sharpness meter is GONE (user ask). This knob now
    // only gates the fx.js verbose console warning for unknown effect types during tuning.
    showSharpnessMeter: true,
    // Draw vertical lines at stretch boundaries + the current stretch label, so the
    // layered-onboarding progression is visible during the graybox pass.
    showStretchGuides: true,
  },

  // ---- CATS-128 follow-up: the escaped-dragonfly fly-away beat ----
  // When a border bump spills dragonflies, one transient dragonfly takes off from the boat
  // and flies away from the frog so the loss reads as "it flew off," not "it vanished."
  // CATS-132: the escapee always departs LEFT (toward the home shore), never toward the
  // side beaches — and it is the ONLY loss visual (the stars/sparkle burst is gone).
  // World-space transients (world.escapedDragonflies, the wake-trace pattern): moved + aged
  // on the fixed timestep in game.js, drawn pure in render.js, capped + retired like fx.
  escapedDragonfly: {
    seconds: 1.6,   // lifetime of the fly-away (fade starts partway)
    speed: 110,     // px/s leftward away from the frog (toward the home shore)
    wobbleAmp: 10,  // px sideways flit (a living escape arc, not a straight line)
    maxLive: 6,     // hard cap on live escapees (oldest dropped past it)
  },

  // ---- CATS-128: the steering gauge's beach-proximity bands ----
  // The gauge (ui/hud.js) shows yellow then orange then red as the hull closes on the
  // nearest TAXABLE beach line. Distances are px from the hull's edge to the shore; red
  // is "about to bump — dragonflies at risk." Inside the finish-safe zone (the right cap,
  // see geometry.finishSafeFromX) the gauge is always GREEN: the finish line never
  // threatens the jar. yellowPx must stay > orangePx > redPx so the bands read as a ramp.
  steeringMeter: {
    yellowPx: 90, // closer than this to the beach → yellow
    orangePx: 55, // → orange
    redPx: 26,    // → red (bump territory — one more push spills dragonflies)
  },

  // ---- Audio (CATS-94, per architecture.md §"Audio system architecture" §5) ----
  // The whole mix scales off master. channels.bed sits under channels.sfx so the lake
  // bed reads "just above inaudible" (CATS-91 §5). muted is the IN-MEMORY default —
  // the runtime toggle overrides it and it is NEVER persisted (stateless MVP).
  // events = the CATS-93 procedural recipes (one voice spec per voiced event); tierMul
  // + bedWarmer are the two behavioral add-ons the engine applies from that same data.
  // throttle mirrors the config.fx knobs: minInterval collapses a sustained swerve /
  // multi-fish frame to one sound; maxConcurrentPerEvent caps stacked voices.
  // CATS-101: bedVariant picks the ambient bed from BED_VARIANTS — 'lake_lullaby'
  // (default: nature floor + a slow pentatonic lullaby + a bullfrog), 'croak_lake'
  // (nature + frogs, no melody), or 'dusk_drone' (the original flat bed, kept for
  // A/B). One scalar; swapping the bed never touches engine logic or the event set.
  audio: {
    // CATS-102 review: raised 0.30 → 0.50 (user request "louder"). Everything scales
    // off master, so the bed/SFX balance is unchanged — only overall loudness moves.
    master: 0.50,
    channels: {
      sfx: 1.0,
      bed: 0.6,
    },
    muted: false,
    bedVariant: DEFAULT_BED_VARIANT,
    events: { ...AUDIO_RECIPES, tierMul: TIER_MUL, bedWarmer: BED_WARMER },
    throttle: { minInterval: 0.08, maxConcurrentPerEvent: 4 },
  },
};

// CATS-64 (CATS-66 §2): the shore-visibility invariant — "both shores never visible at once" —
// is PROVABLY enforced by viewportWidth < shore-to-shore distance. Encode it as an assertion at
// config-load so a future knob change can't silently break the guarantee. console.assert is a
// no-op in browsers that hide its output, so throw explicitly on violation.
{
  const _vw = CONFIG.camera.viewportWidth;
  const _span = CONFIG.world.shoreSpan;
  if (!(_vw < _span)) {
    const msg = `[config] shore-visibility invariant violated: camera.viewportWidth (${_vw}) ` +
      `must be < world.shoreSpan (${_span}) so both shores can't be on screen at once.`;
    console.error(msg);
    throw new Error(msg);
  }
}

// CATS-101: resolve the ambient bed from the bedVariant knob. A typo'd variant name
// must fail loudly (mirroring the invariant above), never silently ship the default
// bed — the PO picked the variant they want to hear.
{
  const _variant = CONFIG.audio.bedVariant;
  const _bed = BED_VARIANTS[_variant];
  if (!_bed) {
    const msg = `[config] audio.bedVariant "${_variant}" is not a bed variant; ` +
      `expected one of ${Object.keys(BED_VARIANTS).join(', ')}.`;
    console.error(msg);
    throw new Error(msg);
  }
  CONFIG.audio.events.ambient_bed = _bed;
}
