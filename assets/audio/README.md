# assets/audio/ — procedural sound recipes (CATS-93)

**Author:** FrogGame / Asset Designer · **License:** Proprietary (project original)
**Upstream:** `sound_design.md` (CATS-91, the SFX inventory + R9 checklist) ·
`architecture.md` §"Audio system architecture" (CATS-92, engine + voice-spec format)
**Consumer:** the audio engine, `src/systems/audio.js` (CATS-94, the SE implementation)

## What this is (and the format decision)

Every sound the game makes is a **procedural recipe** — a pure-data voice spec the Web
Audio engine synthesizes. **There are zero audio files**, including the ambient bed.

Why all-procedural, when the issue allowed sample files:

1. **The engine design set it.** CATS-92 §1: procedural is the default for the 7
   discrete SFX; the bed was the one place a licensed sample was allowed. We take the
   procedural option there too —
2. **The license bar is non-negotiable and procedural clears it by construction.**
   CATS-93: "no unattributed, no rights-unknown." A synthesized recipe *is* code; there
   is no source URL to verify, no attribution to surface, no license to drift. The
   share-link deploy can never inherit an audio-license problem that never existed.
   (CREDITS.md is still updated — the recipes are bespoke project-original assets.)
3. **Tunability is the whole point.** Every parameter below is a scalar. The
   comic-vs-punishing dial (R9) becomes a config sweep — `spill.freqEnd` up = sillier —
   exactly the tuning contract CATS-92 §5 established. A sample can't be swept live.
4. **The repo stays asset-light.** Zero binary files, zero network fetches, no
   decode plumbing. The bed is 4 sustained oscillators/noise layers — cheaper than a
   decoded loop and it never stutters on a cold cache.

The trade-off accepted: synthesized SFX are simpler textures than field recordings.
The spec's own bar decides that ("tone over fidelity" — cute-and-right beats
polished-and-wrong), and Web Audio sine/triangle + filtered noise comfortably reaches
"plink / flutter / munch / slosh" cartoon territory. If feel-review (CATS-95) ever
wants a richer bed, the **sample swap path stays open** — see §"Sample swap" below.

## Files

| File | What |
|------|------|
| `recipes.js` | THE deliverable — `AUDIO_RECIPES` (one voice spec per event), `TIER_MUL`, `BED_WARMER`. Drop-in value for `config.audio.events` (CATS-94). |
| `README.md` | this doc — intent per sound, tone self-checks, audition harness, tuning guide |

## The sound set (maps 1:1 to sound_design.md §1)

| Event key | Spec row | Sound, in one line | Length |
|---|---|---|---|
| `flower_collect` | P1 | dewdrop plip — a sine dropping E6→A5 with a soft octave under it | 0.13 s |
| `dragonfly_catch` | P2 | airy flutter-plip — vibrato sine G6→A6 over a D5→C5 triangle "jar plip" | 0.24 s |
| `dragonfly_spill` | L1 ★ | comic flutter-away — two detuned sines gliding UP A5→E6 with silly 18 Hz vibrato | 0.33 s |
| `fish_munch` | L2 ★ | goofy double chomp — two slow low sine drops + a satisfied "mm"; pitched down per fish tier | 0.72 s |
| `boat_stun` | L3 ★ | water slosh — bandpass noise sweeping down + rocking tremolo + a soft up-drift | 0.45 s |
| `win` | P3 | arrival smile — a soft A-major strum (A-C#-E-A, 55 ms apart) settling over ~1.5 s | 1.6 s |
| `arrived_empty` | A1 ★ | shy fond "aww" — C5→E5 rise over a warm E-major pad, quiet and unhurried | 1.5 s |
| `soft_fail` | A2 | "the party will wait" — A4 held, D5 added above, fading over ~2.2 s; no downward cadence | 2.2 s |
| `ambient_bed` | P4 | **variant** (see §"The ambient bed family") — default `lake_lullaby`: nature floor + a slow A-major-pentatonic lullaby + a bullfrog's lazy reply + the dusk warmer; flat, never builds | loop |

★ = the R9/R7 tone-critical sounds. T1 (stretch transitions) and every §3 silent
event stay **silent** — the recipe set implements exactly the 8-voice ceiling the spec
set, no more.

## How the engine consumes it (for CATS-94)

```js
import { AUDIO_RECIPES, TIER_MUL, BED_WARMER } from './assets/audio/recipes.js';
// per architecture.md §5:
CONFIG.audio = {
  master: 0.30, channels: { sfx: 1.0, bed: 0.6 }, muted: false,
  events: AUDIO_RECIPES,
  throttle: { minInterval: 0.08, maxConcurrentPerEvent: 4 },
};
```

`recipes.js`'s header comment is the **complete voice-spec grammar** — every field the
engine must implement, nothing extra. The one behavioral add-on the engine owns:
`fish_munch` scales every `freq`/`freqEnd` by `TIER_MUL[event.tier]` and stretches
durations by `1/√mul` (a big oaf is lower *and* lazier), and the bed's `dusk_warmth`
layer starts at gain 0 and fades to its listed gain when timer progress crosses
`BED_WARMER.warmBelowProgress` (see `BED_WARMER`). Both are data-driven from this file.

## Audition harness (feel-review + dev)

No engine needed — paste into any browser console (or a scratch HTML page) to hear each
recipe exactly as specified. The three ★ tone-critical sounds should be auditioned
**in isolation**, per the acceptance gate.

```js
// paste recipes.js contents first (or <script type="module"> import it), then:
const ctx = new AudioContext();
function playLayer(L, t0) {
  const src = L.type === 'noise'
    ? Object.assign(ctx.createBufferSource(), { loop: true, buffer: noiseBuffer(ctx) })
    : Object.assign(ctx.createOscillator(), { type: L.wave });
  const g = ctx.createGain(); const f = ctx.createBiquadFilter();
  Object.assign(f, { type: 'lowpass', frequency: L.lowpass ?? 20000 });
  const t = t0 + (L.delay ?? 0);
  const peak = L.gain, a = L.attack, d = L.decay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + (L.hold ?? 0) + d);
  if (L.type === 'osc') {
    src.frequency.setValueAtTime(L.freq, t);
    if (L.freqEnd !== L.freq) src.frequency.exponentialRampToValueAtTime(L.freqEnd, t + a + (L.hold ?? 0) + d * 0.6);
    if (L.vibrato) { /* LFO osc → gain(depth cents→Hz ratio) → src.frequency */ }
  }
  if (L.tremolo) { /* LFO osc → gain(depth*peak) → g.gain */ }
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + a + (L.hold ?? 0) + d + 0.1);
}
function noiseBuffer(ctx) { // 1 s white noise, cached
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function audition(key) { AUDIO_RECIPES[key].synth.layers.forEach(L => playLayer(L, ctx.currentTime + 0.05)); }
// audition('dragonfly_spill'); audition('fish_munch'); audition('boat_stun'); ...
// (noise layers: wire bandpass — the playLayer sketch lowpasses; bandpass center/Q/sweepTo
//  is where the slosh/water color comes from)
// (bed variants: import BED_VARIANTS and audition a variant's sustained layers the same
//  way; its 'seq' layers need the engine's scheduler — quickest audition is in-game with
//  config.audio.bedVariant set, or paste buildBedSeq's walk from src/systems/audio.js)
```

(For noise layers the sketch above omits the bandpass wiring for brevity — see the
grammar in `recipes.js`; `bandpass.center/Q/sweepTo` is what colors the slosh and the
bed's water-lap.)

## Tone self-check — the R9/R7 checklist (CATS-91 §4, the acceptance gate)

Each row answers the spec's two questions: *why is this comic/warm?* and *what single
change would break it?* If a feel-review wants to adjust a sound, tune the named scalar
in the "breaks it" direction's opposite — the recipes were built so every failure mode
is one scalar away, on purpose.

| Sound | Why it's comic/warm (the recipe's argument) | What breaks it (and the scalar that guards it) |
|---|---|---|
| **dragonfly_spill (L1)** | Departs **upward** (A5→E6) with exaggerated 18 Hz ±70¢ vibrato — "well! off I go then." Two detuned flutters read as wings, not a tone. Fast fade (0.28 s) so the moment doesn't dwell. | Any downward glide (`freq < freqEnd` must hold — invert the pair and it's a "lost it" sound); vibrato depth ≤30¢ (reads nervous); slower attack (reads deliberate = punitive). |
| **fish_munch (L2)** | Two **slow low** sine drops (C4→E3, A3→D3) with cheek-tremolo, then a satisfied **"mm"** swell (E4). Transient-free, 700 Hz lowpass on the chomps — no snap, no teeth register (>1 kHz). TIER_MUL drops bigger fish further. | Removing the "mm" layer (hungrier/meaner); faster attack (<10 ms — that's a snap); raising the lowpass past ~1.2 kHz (bite definition becomes audible); adding a noise transient (never — a crunch is teeth). |
| **boat_stun (L3)** | Bandpass noise sweeping **down** (500→220 Hz — water settling away) with a slow 4 Hz rock, plus a soft up-drift (B3→E4) = the dizzy "whoa." Brief (0.45 s). | Sweeping **up** instead (rising whoosh = impact); any click/thump layer (percussion = hit); sub-80 Hz content (that's a damage thud); tremolo >6 Hz (vibration = damage). |
| **win (P3)** | A-major strum bottom-up, sines only, 1.6 kHz ceiling, 1.6 s settle. Reads as a warm exhale, not a fanfare. | Simultaneous block attack (reads "ta-da"); faster arpeggio (<30 ms gap = flourish); brighter lowpass (>3 kHz); louder top voice (A5 gain above the root's = orchestral hit territory). |
| **arrived_empty (A1)** | **Rises** C5→E5 (Fern waves him in anyway), warm E/G# pad joins, quiet (0.26) and unhurried. Fond "aww," not sad. | Inverting the figure (E5→C5 descending = sad trombone energy); minor color (swap G#4 415.3 Hz → G4 392.0 Hz — that one Hz-ish swap is the whole fail-read); louder gain (a theme = a statement). |
| **soft_fail (A2)** | A4 held, **D5 added above** (a suspension that never resolves down — it warms and fades). Swells in over 0.2 s, fades over ~2.3 s. Zero downward motion exists in the voice. | Resolving D5 down to C#4 (a cadence = "the end"); shortening decay (<0.8 s = a sting); raising gain (importance = weight); adding any low minor third. |
| **ambient_bed (P4)** | Flat weather with a lullaby: water-lap noise (0.11 Hz tremolo ≈ a lap every 9 s), faint air, a slow A-major-pentatonic hum + one bullfrog, amplitude-flat pattern with a breath between loops — **cannot** crescendo by construction. Dusk adds warmth (C#4 fades in), never darkness. | Any rising envelope (a build = tension); faster tremolo (>0.5 Hz = rhythm/pulse = a clock — the death-clock read); a melody note LOUDER than the first (the flat-pattern rule — louder-later = a build); speeding `secondsPerStep` past ~1.5 s (a walking pace = a pulse); minor-pentatonic or a resolving cadence (the pattern must wander, never arrive); more than 2 croaks per loop (a chorus = a crowd = a texture that can hide a build); brighter noise (hiss = wind/tension). |
| **flower_collect (P1)** | Dewdrop: fast E6→A5 sine drop + octave whisper. 1.8 kHz ceiling, no square content — a petal, not a coin. | Brighter (lowpass >3 kHz), square wave, or louder gain — any of those three is the arcade "ding." |
| **dragonfly_catch (P2)** | Vibrato (26 Hz ±40¢) = wings; rises G6→A6 = scooped up; triangle D5→C5 = the jar's soft plip. Distinct from P1 on register, timbre, and motion. | Replacing vibrato with tremolo or square (buzz-sting — the forbidden read); dropping the low plip (loses the "jar"); matching P1's envelope (the two pickups become indistinguishable). |

**Net:** no predator path exists (no teeth register, no snap transient, no impact
sweep-up anywhere), no defeat path exists (no descending arrival figure, no minor
cadence, no sting), and the bed cannot build. If any single scalar is pushed into its
"breaks it" column, feel-review flags that scalar — the failure is one knob, not a
re-synth.

## Tuning guide (for the feel pass)

- **Louder/quieter overall:** `config.audio.master` (never per-layer gains).
- **Sillier spill:** raise `dragonfly_spill` layers' `vibrato.depth` (70→90¢) or widen
  the rise (`freqEnd` 1318.5→1568).
- **Dopier fish:** deepen `TIER_MUL` spread (0.82/0.62 → 0.75/0.55) or raise the "mm"
  layer's `gain`.
- **Gentler everything:** every layer's `lowpass` −200 Hz, `master` −0.05. That is
  usually enough; the set is authored warm already.
- **Bed presence:** `channels.bed` (0.6) and the water_lap layer's `gain` (0.14). The
  spec target is "just above inaudible" — when in doubt, quieter.
- **Bed variant (CATS-101):** `config.audio.bedVariant` — `'lake_lullaby'` (default,
  melody + nature + croaks), `'croak_lake'` (nature + croaks, no melody), `'dusk_drone'`
  (the original flat drone bed). One scalar; a typo throws at config load.
- **Melody too prominent:** the lullaby seq layer's `gain` (0.16 → 0.12), or widen
  `secondsPerStep` (2.7 → 3.2 — slower = more subliminal). NEVER speed it up.
- **More/less frog:** the bullfrog seq's `gain` (0.11) — or move its notes earlier in
  the `notes` array for more frequent calls. Keep ≤2 calls per loop.

## The ambient bed family (CATS-101)

The first-shipped bed (now `dusk_drone`) read as a **"doom noise"** — a sustained
A2/E3 drone with no motion lands as a low ominous hum even with warm intervals. The
PO asked for "some melody with sounds of nature, maybe croaks, maybe in a dungeon
synth style." The bed is therefore now a **variant family** in `recipes.js`
(`BED_VARIANTS`), selected by the single scalar `config.audio.bedVariant`:

| Variant | What it is | Pick it when |
|---|---|---|
| **`lake_lullaby`** (default) | The nature floor (water-lap + air) + a slow A-major-pentatonic lullaby on warm triangles (one note per 2.7 s, long decays, 10 rests + a breath between loops) + one bullfrog replying once per loop + the dusk warmer. "Some melody with sounds of nature, maybe croaks" — the full ask. | You want the game to feel gently musical while staying ambient. |
| `croak_lake` | Nature floor + three unhurried bullfrog calls per loop, no melody. | You want pure nature ambience — the most conservative option. |
| `dusk_drone` | The original CATS-93 bed, unchanged (A2/E3 drone). | A/B-ing the retune, or you liked the original. |

All variants keep the P4 contract (§2 of the spec): **a bed, never a score** — the
melodic patterns are major-pentatonic, amplitude-flat (no note louder than the
first), slower than a heartbeat, and followed by a breath of rests, so no loop point
can crescendo and nothing reads as a pulse. The dusk layer still only ADDS warmth.

The dungeon-synth direction was folded INTO `lake_lullaby` rather than shipped as its
own variant: the essence of dungeon synth that fits this game is slow pentatonic
melody over a drone on round, dark-ish timbres — which is exactly the lullaby layer
(triangles under a 1.4 kHz lowpass). A *genre-accurate* dungeon synth bed (minor
keys, tape hiss, ominousness) is an R7/R8 tone violation by definition (the spec
forbids minor-key drones and tension reads outright), so it cannot ship. If
feel-review wants the lullaby *darker*, the two safe knobs are the seq `lowpass`
(1400 → 900 Hz — rounder, more candlelit) and swapping wave `triangle` → `sine` on
individual notes (softer attack color); nothing else.

**The one engine add-on** this needed: `'seq'` bed layers — a repeating note pattern
the engine walks forever on the Web Audio clock (`notes` + `secondsPerStep` +
`restBetweenLoops` + `startIn` + `gain`; each note is an ordinary voice-spec layer
whose gain is relative to the seq's bus). Grammar is documented in `recipes.js`'s
header comment. No gameplay file, event name, or config shape changed.

## Sample swap (the escape hatch, hopefully unused)

If feel-review ever insists a sound needs a real recording, swap that **one** event to
`{ sample: 'assets/audio/<name>.ogg' }` in `recipes.js` (the engine treats `{ synth }`
and `{ sample }` uniformly, CATS-92 §1). The file must then get a `assets/CREDITS.md`
entry — verifiable source URL + CC-BY-class license + author — before it can ship; an
un-credited sample is a review failure by house rule. Everything else (trigger points,
volumes, mute) is untouched by a swap.
