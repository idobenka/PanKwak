// assets/audio/recipes.js — procedural voice specs for every sound in the game.
//
// CATS-93 (Asset Designer). One recipe per voiced event in sound_design.md (CATS-91
// §1/§3): the 7 discrete SFX + the 1 ambient bed. This file is the ASSET — the raw
// material the audio engine (CATS-94, src/systems/audio.js per architecture.md
// §"Audio system architecture") synthesizes. No engine code lives here; every value is
// a scalar so feel-tuning is a config sweep, never a re-synth (the architecture's
// tuning contract).
//
// HOW TO CONSUME (for the Software Engineer, CATS-94):
//   import { AUDIO_RECIPES } from '../assets/audio/recipes.js';
//   CONFIG.audio = { ...master/channels/muted/throttle..., events: AUDIO_RECIPES };
// The object shape matches architecture.md §5's config.audio.events sketch verbatim:
// each event is `{ synth: {...} }` — a pure-data voice spec the engine interprets.
// Swapping any voice to a licensed sample later is `{ sample: 'assets/audio/x.ogg' }`
// for that one key; nothing else changes (see assets/audio/README.md §"Sample swap").
//
// VOICE-SPEC GRAMMAR (the whole DSL the engine needs to implement — nothing more;
// every field below is actually used by at least one recipe):
//   Voice level:
//     loop:        true for the ambient bed only — start/stop it, never play-per-event.
//   layers:        an array of partials/layers mixed in parallel. Everything audible is
//                 a layer; a single-layer voice is the common case.
//   Per layer:
//     id:          optional label (bed layers only) — lets BED_WARMER address a layer.
//     type:        'osc' (oscillator) | 'noise' (a looping noise buffer)
//     wave:        osc only — 'sine' | 'triangle'. (No 'square' anywhere, by design:
//                  square content is the 8-bit/arcade read the spec forbids, §1a P1.)
//     freq:        osc start frequency (Hz)
//     freqEnd:     end frequency (Hz) of the pitch glide; equal to freq = no glide
//     glideCurve:  'exp' (exponential, natural — used everywhere a glide exists)
//     vibrato:     { rate: Hz, depth: cents } — pitch wobble (the flutter family)
//     tremolo:     { rate: Hz, depth: 0..1 } — amplitude wobble (the slosh/cheeks family)
//     attack:      seconds from 0 to full gain (tiny for plinks; >0.05 reads soft)
//     hold:        seconds at full gain before decay begins (Infinity = sustain; used
//                  only by looped bed layers, where decay = the stop-fade)
//     decay:       seconds from full gain to silence (exponential-feel decay assumed)
//     gain:        this layer's peak level, 0..1, BEFORE the channel/master mix
//     delay:       seconds this layer waits before starting (chords/strums/echoes)
//     lowpass:     cutoff (Hz) of a one-pole lowpass on this layer. Almost every layer
//                  has one — it is the main "gentle" knob (bright top end is what makes
//                  synthetic sounds read digital/harsh; rolling it off reads soft/warm)
//     bandpass:    noise only — { center, Q } (+ optional sweepTo: the center glides
//                  center → sweepTo over the layer's life; the water-motion color)
//   Bed 'seq' layers (CATS-101, bed only): type: 'seq' + notes: [...] (one entry per
//                 step; 'rest' or a note layer whose gain is relative to the seq's bus
//                 gain) + secondsPerStep / restBetweenLoops / startIn / gain. The engine
//                 walks the pattern forever on the Web Audio clock — the repeating
//                 melody / croak layers of the bed variants. Full grammar note at
//                 BED_VARIANTS below.
//
// TONE CONTRACT (sound_design.md §0/§4 — the acceptance gate for CATS-95):
//   • Losses depart UPWARD/lightly or read goofy-placid — never downward, percussive,
//     or buzzy (R9). See dragonfly_spill / fish_munch / boat_stun below.
//   • Arrivals settle warmly — no descending sting, no minor cadence, no "you lose"
//     (R7). See win / arrived_empty / soft_fail.
//   • The bed never builds. It is flat weather — filtered noise + a warm drone with
//     slow, shallow tremolo; the loop is amplitude-symmetric so it cannot crescendo.
//     (CATS-101 melodic variants: major-pentatonic, amplitude-flat, slower than a
//     heartbeat, a breath between loops — a lullaby hummed across the lake, still
//     weather, never a score. See BED_VARIANTS.)
//   • Everything is SHORT (gameplay SFX 0.15–0.6 s; arrival settles ≤ ~2.3 s) and QUIET
//     (peak layer gains 0.05–0.42 under a 0.30 master). Silence on all other events is
//     the spec (§3) and is kept.

export const AUDIO_RECIPES = {
  // ── P1 · flower_collect — "a light, rewarding plink … a dewdrop" (§1a) ──────────
  // A single sine with a fast exponential drop from a fifth above its target down to
  // the target — the classic water-drop "plip." No harmonics above ~2 kHz (lowpass),
  // no square/zap content, so it cannot read as a coin/arcade grab. Sub-150 ms.
  flower_collect: {
    synth: {
      layers: [
        {
          type: 'osc', wave: 'sine',
          freq: 1318.5, freqEnd: 880, glideCurve: 'exp', // E6 → A5 drop = the dewdrop plip
          attack: 0.004, hold: 0.0, decay: 0.13,
          gain: 0.42, lowpass: 1800,
        },
        // a whisper of an octave below, one layer only in effect: fattens the drop
        // without adding brightness (keeps it a "petal," not a "coin").
        {
          type: 'osc', wave: 'sine',
          freq: 440, freqEnd: 440,
          attack: 0.004, hold: 0.0, decay: 0.09,
          gain: 0.12, lowpass: 900,
        },
      ],
    },
  },

  // ── P2 · dragonfly_catch — "soft, fluttery capture … a tiny jar plip" (§1a) ─────
  // Distinct from P1 on every axis (airier timbre, higher register, faster flutter,
  // longer tail) so the two pickups are audibly different at the same low volume. The
  // flutter is vibrato (pitch wobble), never a buzz: 26 Hz is wing-flutter rate, and a
  // ±40-cent sine wobble at that rate reads as "wings," while anything tremolo-heavy or
  // square-wave reads as insect-aggression (forbidden — §1a P2).
  dragonfly_catch: {
    synth: {
      layers: [
        {
          type: 'osc', wave: 'sine',
          freq: 1568, freqEnd: 1760, glideCurve: 'exp', // G6 → A6, a light upward plip
          vibrato: { rate: 26, depth: 40 },
          attack: 0.006, hold: 0.02, decay: 0.16,
          gain: 0.30, lowpass: 2600,
        },
        // the "jar plip": a soft low body underneath the flutter, slightly delayed so
        // the flutter lands first and the plip closes it.
        {
          type: 'osc', wave: 'triangle',
          freq: 587.3, freqEnd: 523.3, glideCurve: 'exp', // D5 → C5 settle
          attack: 0.005, hold: 0.0, decay: 0.12, delay: 0.03,
          gain: 0.18, lowpass: 1200,
        },
      ],
    },
  },

  // ── L1 · dragonfly_spill — R9 TONE-CRITICAL. "Comic 'wander off / flutter away'" ─
  // The one the whole task is graded on. Three properties carry the comedy, each a
  // scalar the feel-review can dial:
  //   1. It departs UPWARD (A5 → E6, a rising major-ish gesture) — "a thing leaving,"
  //      per §4-L1 ("must depart upward and lightly, like a thing leaving"). A falling
  //      pitch is the "you lost it" read and is forbidden.
  //   2. The vibrato is silly-fast (18 Hz, ±70 cents) — an exaggerated cartoon flit.
  //      Deep vibrato + rising pitch = "well! off I go" — goofiness through exaggeration.
  //   3. It fades fast (decay 0.28) — the dragonfly leaves the scene, the moment ends.
  //      A long tail would dwell on the loss (the drip-drip R9 warns about).
  // Two fluttering voices in loose unison (the second detuned + delayed 40 ms) read as
  // "a couple of wings," richer and funnier than one clean glide. No noise burst, no
  // downward component, no percussion of any kind.
  dragonfly_spill: {
    synth: {
      layers: [
        {
          type: 'osc', wave: 'sine',
          freq: 880, freqEnd: 1318.5, glideCurve: 'exp', // A5 → E6: departs UP
          vibrato: { rate: 18, depth: 70 },
          attack: 0.012, hold: 0.04, decay: 0.28,
          gain: 0.34, lowpass: 2000,
        },
        {
          type: 'osc', wave: 'sine',
          freq: 830.6, freqEnd: 1244.5, glideCurve: 'exp', // G#5 → D#6: detuned partner
          vibrato: { rate: 21, depth: 80 },
          attack: 0.012, hold: 0.04, decay: 0.24, delay: 0.04,
          gain: 0.22, lowpass: 2000,
        },
      ],
    },
  },

  // ── L2 · fish_munch — R8/R9 TONE-CRITICAL. "Goofy, oafish … a cartoonish chomp" ──
  // The anti-predator sound. Four properties keep it goofy, all scalars:
  //   1. LOW and SLOW. Everything lives ~147–330 Hz — an oaf's register, far below any
  //      bite/teeth snap (which live >1 kHz with fast transients). The "munch" gesture
  //      is two soft low thumps ~160 ms apart (open-mouth, close-mouth), each a slow
  //      sine drop, not a snap.
  //   2. WOBBLY, not sharp. 6.5 Hz tremolo on the body = cheeks moving. Transient-free
  //      (attack 30 ms, lowpassed at 700 Hz) — nothing percussive anywhere.
  //   3. SATISFIED. After both chomps, a warm little "mm" swell (E4 held, sine, quiet)
  //      — snacking with an uncomprehending face, not taking by force. Remove the mm
  //      and it gets hungrier/meaner; deepen it and it gets dopier.
  //   4. SIZED BY TIER. tierMul (per-tier frequency multiplier: 1.0 / 0.82 / 0.62) is
  //      applied by the engine from the fish_ate event's tier — bigger oaf = lower and
  //      slower. The multipliers are data, right here, not engine logic.
  fish_munch: {
    synth: {
      // engine multiplies every freq/freqEnd by TIER_MUL[event.tier ?? 1] (see below)
      layers: [
        { // chomp 1 — mouth opens/closes: a soft low drop, cheeky wobble
          type: 'osc', wave: 'sine',
          freq: 261.6, freqEnd: 164.8, glideCurve: 'exp', // C4 → E3
          tremolo: { rate: 6.5, depth: 0.35 },
          attack: 0.03, hold: 0.03, decay: 0.14,
          gain: 0.40, lowpass: 700,
        },
        { // chomp 2 — the second bite, a touch higher (going back for more)
          type: 'osc', wave: 'sine',
          freq: 220.0, freqEnd: 146.8, glideCurve: 'exp', // A3 → D3
          tremolo: { rate: 5.5, depth: 0.35 },
          attack: 0.03, hold: 0.03, decay: 0.16, delay: 0.16,
          gain: 0.40, lowpass: 700,
        },
        { // the satisfied "mm" — a warm quiet swell after both chomps. THE comic
          // layer: this is the uncomprehending face. A predator has no "mm."
          type: 'osc', wave: 'sine',
          freq: 329.6, freqEnd: 329.6, // E4 held
          attack: 0.06, hold: 0.08, decay: 0.22, delay: 0.34,
          gain: 0.14, lowpass: 500,
        },
      ],
    },
  },

  // ── L3 · boat_stun — "gentle water-slosh / comic spin, brief. No crash." (§1b) ───
  // Water moving and a dizzy spin, full stop. The slosh is bandpassed noise sweeping
  // its center DOWN (500 → 220 Hz — water falling away from the ear, the opposite of a
  // rising impact whoosh) under a 4 Hz tremolo (the rock-and-settle rhythm — matches
  // the visual wobbleHz family in config.fishHit, deliberately slower). Beneath it a
  // quiet triangle drifts UP then the voice is done: the "whoa" head-tilt. No thump,
  // no click transient, no sub-bass layer of any kind (a sub-hit is a "damage thud,"
  // §4-L3) — the noise settles at a 220 Hz center and the only pitched layer enters
  // at 247 Hz, quiet.
  boat_stun: {
    synth: {
      layers: [
        { // the slosh — filtered water noise, rocking
          type: 'noise',
          bandpass: { center: 500, sweepTo: 220, Q: 1.2 },
          tremolo: { rate: 4, depth: 0.5 },
          attack: 0.02, hold: 0.05, decay: 0.38,
          gain: 0.30, lowpass: 900,
        },
        { // the dizzy drift — a soft upward triangle = the boat's slow eased spin
          type: 'osc', wave: 'triangle',
          freq: 246.9, freqEnd: 329.6, glideCurve: 'exp', // B3 → E4, tips up then out
          attack: 0.03, hold: 0.04, decay: 0.34,
          gain: 0.16, lowpass: 800,
        },
      ],
    },
  },

  // ── P3 · win — "warm resolution … a soft major chord that settles" (§1a) ─────────
  // A soft arpeggiated A-major (A4-C#5-E5-A5, 55 ms apart — a strum, not a block hit)
  // on sines/triangles, everything lowpassed at 1.6 kHz, settling over ~1.6 s. Small
  // and warm on purpose: two frogs at dusk, not a stadium (forbidden: fanfare that
  // overshadows the moment). The arpeggio lands bottom-up which reads "arrival smile";
  // a simultaneous block chord reads "ta-da!," which is already too much.
  win: {
    synth: {
      layers: [
        { type: 'osc', wave: 'sine',     freq: 440.0, attack: 0.02, hold: 0.1, decay: 1.3, gain: 0.30, lowpass: 1600 },
        { type: 'osc', wave: 'sine',     freq: 554.4, attack: 0.02, hold: 0.1, decay: 1.3, gain: 0.24, lowpass: 1600, delay: 0.055 },
        { type: 'osc', wave: 'sine',     freq: 659.3, attack: 0.02, hold: 0.1, decay: 1.3, gain: 0.24, lowpass: 1600, delay: 0.11 },
        { type: 'osc', wave: 'triangle', freq: 880.0, attack: 0.03, hold: 0.08, decay: 1.1, gain: 0.16, lowpass: 1600, delay: 0.165 },
      ],
    },
  },

  // ── A1 · arrived_empty — R7 TONE-CRITICAL. "Warm anticlimax … a shy 'aww'" (§1c) ─
  // NOT sad — fond. Three deliberate choices:
  //   1. It goes UP, gently (C5 → E5 → settles on E5's warmth). A descending line is
  //      the defeat read; this one lifts, because Fern waves Pip in anyway.
  //   2. The intervals are small and major-flavored (C→E, then E holding with a soft
  //      G# color from the triangle). Nothing minor, nothing resolving downward.
  //   3. It is QUIET (peak 0.26) and unhurried (1.4 s) — a shy little "aww," not a
  //      theme. No reverb-tail drama; it just settles.
  arrived_empty: {
    synth: {
      layers: [
        { // the "aww" figure: C5 rising to E5, soft and slightly slow on the uptake
          type: 'osc', wave: 'sine',
          freq: 523.3, freqEnd: 659.3, glideCurve: 'exp',
          attack: 0.05, hold: 0.12, decay: 0.9,
          gain: 0.26, lowpass: 1200,
        },
        { // a warm pad underneath: E major color (E + G#), entering as the figure lands
          type: 'osc', wave: 'triangle', freq: 329.6, // E4
          attack: 0.12, hold: 0.3, decay: 0.9, delay: 0.18,
          gain: 0.14, lowpass: 900,
        },
        { type: 'osc', wave: 'triangle', freq: 415.3, // G#4
          attack: 0.12, hold: 0.3, decay: 0.9, delay: 0.22,
          gain: 0.10, lowpass: 900 },
      ],
    },
  },

  // NOTE on the win/empty relationship: A1 deliberately does NOT re-voice P3's A-major
  // arpeggio — the empty arrival is a single soft rising figure, not a chord. Arriving
  // with nothing is a different, smaller moment and must SOUND smaller (R7: the
  // anticlimax is the point). Same family (sine+triangle, lowpass, settle), different
  // sentence.

  // ── A2 · soft_fail — "the party will wait" — "the sun going down softly" (§1c) ──
  // The most constrained voice: it must be unhurried, hopeful, and contain zero
  // information that says "over." A warm two-note gesture — A4 held, then D5 added
  // above it (a suspension that never resolves down; it just warms and fades) — over
  // a quiet A3 root. Everything swells in slowly (attack 0.15–0.2 s), sits, and fades
  // over ~2.2 s total. No downward cadence exists anywhere in the voice. If a
  // feel-review wants it even gentler: raise attack, lower gain — do not add motion.
  soft_fail: {
    synth: {
      layers: [
        { type: 'osc', wave: 'sine', freq: 440.0, // A4 — the held warmth
          attack: 0.2, hold: 0.5, decay: 1.4, gain: 0.22, lowpass: 1000 },
        { type: 'osc', wave: 'sine', freq: 587.3, // D5 above — added late, never falling
          attack: 0.18, hold: 0.4, decay: 1.3, gain: 0.18, lowpass: 1000, delay: 0.45 },
        { type: 'osc', wave: 'triangle', freq: 220.0, // A3 root — the ground under it
          attack: 0.22, hold: 0.5, decay: 1.5, gain: 0.12, lowpass: 700 },
      ],
    },
  },

  // ── P4 · ambient_bed — "the lake at dusk" — flat weather with a gentle melody ───
  // CATS-101: the original flat drone bed read as a "doom noise" (PO feedback). The
  // bed is now a family of VARIANTS (see BED_VARIANTS below) — config.audio.bedVariant
  // picks which one ships; `ambient_bed` here is the DEFAULT variant, re-exported so
  // the engine's locked event name and config.js's spread stay byte-compatible.
  //
  // All variants keep the spec's P4 contract (CATS-91 §1a/§2): a bed, never a score —
  // no tension build, no minor cadence, nothing that reads as a clock or a danger
  // swell. The melodic beds add a slow MAJOR-PENTATONIC lullaby pattern + occasional
  // frog croaks over the same nature floor. Melody runs on the engine's 'seq' layer
  // type (a repeating note pattern on the Web Audio clock, CATS-101): the pattern is
  // authored amplitude-flat (no note louder than the first) and the loop is followed
  // by a breath of rests, so it cannot crescendo and cannot lock into a pulse.
  ambient_bed: null, // resolved from BED_VARIANTS at the bottom of this file
};

// ── The ambient bed family (CATS-101 — "the bed sounds like doom noise; let's try ──
// some other alternatives. Some melody with sounds of nature, maybe croaks, maybe in
// a dungeon synth style"). Three variants, all pure data in the same grammar plus the
// one new 'seq' layer type. Which one ships is a single scalar, config.audio.bedVariant
// ('lake_lullaby' default) — the whole point of the tuning contract: swapping the bed
// is a one-knob feel change, never a re-synth or an engine edit.
//
// Shared design rules, inherited from CATS-91 §2 (the P4 contract):
//   • MELODY = LULLABY, NOT MUSIC. Every pattern is major-pentatonic (A C# E F# B —
//     the D-major/A-major family the rest of the game's warm voices live in), slower
//     than a heartbeat, with rests and a breath between loops. It must read as
//     "something humming to itself across the lake," not a track. If it draws
//     attention to itself, lower the seq gain — never speed it up (a fast pattern is
//     a rhythm, and rhythm is a pulse, and a pulse is the death-clock read).
//   • AMPLITUDE-FLAT BY CONSTRUCTION. No note is louder than the first, no loop
//     repetition builds, the dusk layer only ever ADDS warmth (a C#/E color fading in,
//     never a minor third). The bed cannot crescendo any more than the original could.
//   • NATURE STAYS. The water-lap / open-air floor is kept in every variant — the
//     "sounds of nature" half of the ask — at the same near-inaudible gains.
//   • CROAKS ARE CHARACTERS, NOT PERCUSSION. A croak is a single low "brrp" figure:
//     a short sine flutter (fast shallow vibrato) in the 90–110 Hz bullfrog register,
//     one or two per loop at most, always from the same quiet register so it reads as
//     one frog with a personality, never a chorus or a beat.
//
// ── 'seq' LAYER GRAMMAR (the one engine add-on, CATS-101) ──
//   type: 'seq'        — marks a repeating note sequence (bed only).
//   notes: [...]       — the pattern, one entry per step. An entry is 'rest' or an
//                        ordinary voice-spec layer object (wave/freq/freqEnd/vibrato/
//                        tremolo/attack/hold/decay/gain/lowpass) whose gain is
//                        relative to the seq's bus level.
//   secondsPerStep: S  — the pattern clock (one step = S seconds).
//   restBetweenLoops: S — silence inserted after each full pass (the breath).
//   startIn: S         — seconds after bed start before the pattern begins (lets the
//                        nature floor establish first; a melody that starts with the
//                        water reads as emerging from it).
//   gain: 0..1         — the BUS level every note routes through (under channels.bed).
export const BED_VARIANTS = {

  // ── lake_lullaby (DEFAULT) — "some melody with sounds of nature, maybe croaks" ──
  // The full ask in one bed: the nature floor, a slow pentatonic lullaby on warm
  // triangles, a bullfrog croaking a lazy reply, and the dusk warmer. The melody's
  // contour is deliberately FIFTH-heavy and aimless-wandering (A→E→F#→C#, long
  // decays so notes bleed like a music box winding down, never a phrase that
  // resolves = never a statement).
  lake_lullaby: {
    synth: {
      loop: true,
      layers: [
        // nature floor — identical to the original bed's water + air (kept gains)
        { id: 'water_lap',
          type: 'noise', bandpass: { center: 240, Q: 0.8 },
          tremolo: { rate: 0.11, depth: 0.45 },
          attack: 1.2, hold: Infinity, decay: 1.5,
          gain: 0.14, lowpass: 600 },
        { id: 'open_air',
          type: 'noise', bandpass: { center: 2200, Q: 2.0 },
          attack: 2.0, hold: Infinity, decay: 2.0,
          gain: 0.05, lowpass: 6000 },
        // the lullaby — A-major pentatonic (A C# E F# B) in the C#4..C#5 register,
        // one note per 2.7 s, amplitude-flat, 10 rests in-pattern + a 4-step breath
        // between loops. Envelope: soft attack, long decay — a hummed note, not a
        // plucked one (a pluck is a performance; a hum is just the evening).
        { id: 'lullaby', type: 'seq',
          secondsPerStep: 2.7, restBetweenLoops: 4 * 2.7, startIn: 6, gain: 0.16,
          notes: [
            { type: 'osc', wave: 'triangle', freq: 277.18, // C#4
              attack: 0.55, hold: 0.4, decay: 1.7, gain: 1.0, lowpass: 1400 },
            'rest',
            { type: 'osc', wave: 'triangle', freq: 440.0, // A4
              attack: 0.6, hold: 0.4, decay: 1.6, gain: 0.8, lowpass: 1400 },
            'rest',
            { type: 'osc', wave: 'triangle', freq: 369.99, // F#4
              attack: 0.6, hold: 0.4, decay: 1.8, gain: 0.8, lowpass: 1400 },
            'rest',
            { type: 'osc', wave: 'sine', freq: 329.63, // E4
              attack: 0.65, hold: 0.5, decay: 1.9, gain: 0.75, lowpass: 1400 },
            'rest',
            { type: 'osc', wave: 'triangle', freq: 554.37, // C#5
              attack: 0.7, hold: 0.3, decay: 1.6, gain: 0.6, lowpass: 1400 },
            'rest', 'rest',
            { type: 'osc', wave: 'triangle', freq: 440.0, // A4
              attack: 0.6, hold: 0.4, decay: 1.8, gain: 0.75, lowpass: 1400 },
            'rest',
            { type: 'osc', wave: 'sine', freq: 277.18, // C#4
              attack: 0.6, hold: 0.4, decay: 2.1, gain: 0.7, lowpass: 1400 },
            'rest', 'rest', 'rest',
          ] },
        // the frog — ONE bullfrog with a lazy two-syllable "brrp … brrp," replying
        // to the melody once per loop. 24 Hz vibrato at ±120 cents on a ~100 Hz sine
        // IS the croak timbre (amplitude wobble reads as a growl; that's a frog, not
        // a filter). Never more than two calls: a chorus is a crowd, and a crowd is
        // a texture that can hide a build.
        { id: 'bullfrog', type: 'seq',
          secondsPerStep: 2.7, restBetweenLoops: 0, startIn: 9, gain: 0.11,
          notes: [
            'rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest',
            { type: 'osc', wave: 'sine', freq: 103, // ~G#2 — the bullfrog register
              vibrato: { rate: 24, depth: 120 },
              attack: 0.10, hold: 0.16, decay: 0.55, gain: 1.0, lowpass: 500 },
            'rest',
            { type: 'osc', wave: 'sine', freq: 92, // a touch lower — the second syllable
              vibrato: { rate: 22, depth: 110 },
              attack: 0.12, hold: 0.14, decay: 0.6, gain: 0.8, lowpass: 500 },
            'rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest',
          ] },
        // the dusk warmer — kept from the original bed (C#4 fades in toward sunset)
        { id: 'dusk_warmth', type: 'osc', wave: 'sine', freq: 277.18, // C#4 — see bedWarmer
          attack: 6.0, hold: Infinity, decay: 4.0,
          gain: 0.05, lowpass: 500 },
      ],
    },
  },

  dungeon_water: {
    synth: {
      loop: true,
      layers: [
          { id: 'water_lap',
            type: 'noise', 
            // bandpass: { center: 1000, Q: 0.8 },
            // tremolo: { rate: 0.11, depth: 0.45 },
            // attack: 1.2, hold: Infinity, decay: 1.5,
            // gain: 0.14, lowpass: 600 },
            bandpass: { center: 600, Q: 0.7 },
            tremolo: { rate: 0.25, depth: 0.25 },
            attack: 0.4,
            hold: Infinity,
            decay: 0.8,
            gain: 0.14,
            lowpass: 400
          },
          { id: 'opening', type: 'seq',
            secondsPerStep: 0.75,
            restBetweenLoops: 1,
            startIn: 0.3,
            gain: 0.14,
            notes: [
            { type: 'osc', wave: 'triangle', freq: 523.25, // C5
              attack: 0.04, hold: 0.15, decay: 1.5, gain: 0.55, lowpass: 2200 },
            { type: 'osc', wave: 'sine', freq: 523.25, // C5
              attack: 0.04, hold: 0.15, decay: 1.5, gain: 0.55, lowpass: 2200 },
            { type: 'osc', wave: 'sine', freq: 659.25, // E5
              attack: 0.03, hold: 0.12, decay: 1.3, gain: 0.42, lowpass: 2600 },
            'rest',
            { type: 'osc', wave: 'triangle', freq: 783.99, // G5
              attack: 0.04, hold: 0.12, decay: 1.6, gain: 0.38, lowpass: 2500 },
            { type: 'osc', wave: 'triangle', freq: 783.99, // G5
              attack: 0.04, hold: 0.12, decay: 1.6, gain: 0.38, lowpass: 2500 },
            { type: 'osc', wave: 'sine', freq: 659.25, // E5
              attack: 0.03, hold: 0.12, decay: 1.3, gain: 0.42, lowpass: 2600 },
            ] },
          { id: 'bells', type: 'seq',
            secondsPerStep: 0.75,
            restBetweenLoops: 1,
            startIn: 0.3,
            gain: 0.14,
            notes: [
            { type: 'osc', wave: 'sine', freq: 987.77, // B5
              attack: 0.015, hold: 0.08, decay: 0.45, gain: 0.32, lowpass: 3200 },
            { type: 'osc', wave: 'sine', freq: 1174.66, // D6
              attack: 0.015, hold: 0.07, decay: 0.5, gain: 0.28, lowpass: 3500 },
            { type: 'osc', wave: 'sine', freq: 1046.50, // C6
              attack: 0.1, hold: 0.02, decay: 0.55, gain: 0.30, lowpass: 3300 },
            { type: 'osc', wave: 'sine', freq: 1046.50, // C6
              attack: 0.1, hold: 0.02, decay: 0.55, gain: 0.30, lowpass: 3300 },
            { type: 'osc', wave: 'sine', freq: 1046.50, // C6
              attack: 0.1, hold: 0.02, decay: 0.55, gain: 0.30, lowpass: 3300 },
            'rest',
            'rest',
          ] },
        {
          id: 'water_drops',
          type: 'seq',
          secondsPerStep: 0.75,
          restBetweenLoops: 1,
          startIn: 0.3,
          gain: 0.14,
          notes: [
            { type: 'osc', wave: 'sine', freq: 523.25, // C5
              attack: 0.03, hold: 0.08, decay: 0.7, gain: 0.28, lowpass: 3000 },
            { type: 'osc', wave: 'sine', freq: 587.33, // D5
              attack: 0.03, hold: 0.08, decay: 0.7, gain: 0.26, lowpass: 3000 },
            { type: 'osc', wave: 'sine', freq: 659.25, // E5
              attack: 0.03, hold: 0.08, decay: 0.8, gain: 0.25, lowpass: 3000 },
            { type: 'osc', wave: 'sine', freq: 783.99, // G5
              attack: 0.04, hold: 0.10, decay: 1.2, gain: 0.30, lowpass: 2800 },
            { type: 'osc', wave: 'triangle', freq: 196.00, // G3
              attack: 0.02, hold: 0.12, decay: 0.65, gain: 0.32, lowpass: 900 },
            { type: 'osc', wave: 'triangle', freq: 146.83, // D3
              attack: 0.02, hold: 0.10, decay: 0.55, gain: 0.27, lowpass: 800 },
            'rest',
        ] },
        {
          id: 'dungeon_synth',
          type: 'seq',
          secondsPerStep: 0.75,
          restBetweenLoops: 1,
          startIn: 0.3,
          gain: 0.14,
          notes: [
            
            { type: 'osc', wave: 'triangle', freq: 196.00, // G3
              attack: 0.30, hold: 0.30, decay: 2.4, gain: 0.25, lowpass: 750 },
            { type: 'osc', wave: 'triangle', freq: 196.00, // G3
              attack: 0.30, hold: 0.30, decay: 2.4, gain: 0.25, lowpass: 750 },
            { type: 'osc', wave: 'triangle', freq: 130.81, // C3
              attack: 0.35, hold: 0.35, decay: 2.2, gain: 0.28, lowpass: 650 },
            { type: 'osc', wave: 'triangle', freq: 130.81, // C3
              attack: 0.35, hold: 0.35, decay: 2.2, gain: 0.28, lowpass: 650 },
            { type: 'osc', wave: 'triangle', freq: 164.81, // E3
              attack: 0.30, hold: 0.30, decay: 2.0, gain: 0.23, lowpass: 700 },
            { type: 'osc', wave: 'triangle', freq: 196.00, // G3
              attack: 0.30, hold: 0.30, decay: 2.4, gain: 0.25, lowpass: 750 },
            { type: 'osc', wave: 'triangle', freq: 164.81, // E3
              attack: 0.30, hold: 0.30, decay: 2.0, gain: 0.23, lowpass: 700 },
          ] },
      ],
    },
  },

  // ── croak_lake — "sounds of nature, maybe croaks," no melody ──────────────────
  // The most conservative alternative: the pure nature bed plus the frog characters.
  // For a feel-review A/B that wants to hear what melody adds vs. subtracts.
  croak_lake: {
    synth: {
      loop: true,
      layers: [
        { id: 'water_lap',
          type: 'noise', bandpass: { center: 240, Q: 0.8 },
          tremolo: { rate: 0.11, depth: 0.45 },
          attack: 1.2, hold: Infinity, decay: 1.5,
          gain: 0.14, lowpass: 600 },
        { id: 'open_air',
          type: 'noise', bandpass: { center: 2200, Q: 2.0 },
          attack: 2.0, hold: Infinity, decay: 2.0,
          gain: 0.05, lowpass: 6000 },
        // the frog, alone with the lake — three unhurried calls per loop with long
        // gaps, the register drifting a touch each call (a real frog moves).
        { id: 'bullfrog', type: 'seq',
          secondsPerStep: 2.7, restBetweenLoops: 4 * 2.7, startIn: 5, gain: 0.12,
          notes: [
            'rest', 'rest', 'rest',
            { type: 'osc', wave: 'sine', freq: 98,
              vibrato: { rate: 23, depth: 115 },
              attack: 0.10, hold: 0.18, decay: 0.6, gain: 1.0, lowpass: 500 },
            'rest',
            { type: 'osc', wave: 'sine', freq: 98,
              vibrato: { rate: 23, depth: 115 },
              attack: 0.12, hold: 0.15, decay: 0.55, gain: 0.85, lowpass: 500 },
            'rest', 'rest', 'rest', 'rest',
            { type: 'osc', wave: 'sine', freq: 105,
              vibrato: { rate: 24, depth: 120 },
              attack: 0.10, hold: 0.16, decay: 0.6, gain: 0.9, lowpass: 500 },
            'rest', 'rest', 'rest', 'rest', 'rest', 'rest',
          ] },
        { id: 'dusk_warmth', type: 'osc', wave: 'sine', freq: 277.18, // C#4 — see bedWarmer
          attack: 6.0, hold: Infinity, decay: 4.0,
          gain: 0.05, lowpass: 500 },
      ],
    },
  },

  // ── dusk_drone — the ORIGINAL CATS-93 bed, unchanged, kept for A/B ─────────────
  // The flat A2/E3 drone + water-lap bed as first shipped. Kept so feel-review can
  // A/B the melodic variants against it (and so anyone who liked the original can
  // restore it with one config scalar). This is the variant the PO called a "doom
  // noise" — it ships LAST, not as default.
  dusk_drone: {
    synth: {
      loop: true,
      layers: [
        { id: 'water_lap',
          type: 'noise', bandpass: { center: 240, Q: 0.8 },
          tremolo: { rate: 0.11, depth: 0.45 },
          attack: 1.2, hold: Infinity, decay: 1.5,
          gain: 0.14, lowpass: 600 },
        { id: 'open_air',
          type: 'noise', bandpass: { center: 2200, Q: 2.0 },
          attack: 2.0, hold: Infinity, decay: 2.0,
          gain: 0.05, lowpass: 6000 },
        { id: 'warm_pad_a', type: 'osc', wave: 'sine', freq: 110.0, // A2
          vibrato: { rate: 0.2, depth: 6 },
          attack: 2.5, hold: Infinity, decay: 2.5,
          gain: 0.10, lowpass: 400 },
        { id: 'warm_pad_b', type: 'osc', wave: 'triangle', freq: 164.8, // E3
          vibrato: { rate: 0.15, depth: 5 },
          attack: 3.0, hold: Infinity, decay: 2.5,
          gain: 0.07, lowpass: 400 },
        { id: 'dusk_warmth', type: 'osc', wave: 'sine', freq: 277.18, // C#4 — see bedWarmer
          attack: 6.0, hold: Infinity, decay: 4.0,
          gain: 0.05, lowpass: 500 },
      ],
    },
  },
};

// The default bed. config.js resolves `ambient_bed` from BED_VARIANTS here (keeping
// the engine's locked event name + the config spread untouched); config.audio.bedVariant
// selects any other by key.
export const DEFAULT_BED_VARIANT = 'dungeon_water';

// The ambient_bed event = the selected variant. Set once at module load so the recipe
// object stays plain data (the engine reads events.ambient_bed exactly as before).
AUDIO_RECIPES.ambient_bed = BED_VARIANTS[DEFAULT_BED_VARIANT];

// Per-tier munch scaling for L2 (fish_munch). The engine applies tierMul to every
// freq/freqEnd in the voice when the fish_ate event carries a tier (0 small / 1 medium /
// 2 big): bigger oaf = lower + slower. Durations scale by 1/sqrt(mul) so a big fish's
// chomps are also more leisurely — oafishness on both axes. Data, not engine logic.
export const TIER_MUL = [1.0, 0.82, 0.62];

// The bed's optional dusk-warmth mix-in: the 'dusk_warmth' layer id above is silent
// (gain 0) until timer progress < warmBelowProgress, then fades to its listed gain over
// warmFadeSeconds. The engine fades the LAYER's gain; the recipe stays flat data.
// (If the engine opts out of this nicety the bed is simply 4 layers — still complete.)
export const BED_WARMER = {
  layerId: 'dusk_warmth',
  warmBelowProgress: 0.25, // last quarter of the run = the sunset→dusk palette band
  warmFadeSeconds: 8.0,
};

// Convenience re-export: the full config.audio.events value (CATS-94 spreads this in).
export const AUDIO_EVENTS = Object.keys(AUDIO_RECIPES);
