// systems/audio.js — the audio engine (CATS-94, per architecture.md §"Audio system
// architecture", CATS-92).
//
// fx.js's sibling: gameplay calls audio.play('dragonfly_spill') and knows nothing about
// how sound is made. The dependency arrow is one-way — gameplay → (named string) → audio —
// exactly the contract fx.spawn() holds. Everything oscillator/gain/buffer lives private
// inside this factory; the module exports only createAudio + AUDIO_EVENTS.
//
// Voice specs are PURE DATA consumed from cfg.audio.events (the CATS-93 recipes,
// assets/audio/recipes.js): { synth: { layers: [...] } } for every shipped voice, with
// { sample: 'path' } as the structural escape hatch the engine treats uniformly. Every
// audible parameter (wave, freq, envelope, filters, vibrato/tremolo) is a scalar there —
// the tuning contract: feel sweeps live in config.js, never here.
//
// Determinism (architecture §3.4): all scheduling reads the Web Audio clock
// (ctx.currentTime), never the fixed-timestep sim clock, and nothing here is ever read
// back into world/boat/gifts. Sound is a cosmetic, real-time output — the
// speaker's equivalent of render.js.
//
// Robustness: audio is additive. A missing AudioContext, a suspended context, a rejected
// resume, or a broken voice spec degrades to a silent no-op — it must never throw into
// the sim loop.

// The locked event set (architecture §2; maps 1:1 to CATS-91's SFX inventory). play()
// rejects anything else loudly — a typo'd event name must fail, not silently no-op.
export const AUDIO_EVENTS = [
  'flower_collect',
  'dragonfly_catch',
  'dragonfly_spill',
  'fish_munch',
  'boat_stun',
  'win',
  'arrived_empty',
  'soft_fail',
  'ambient_bed',
];

// The bed is started/stopped, never play()-per-event.
const BED_EVENT = 'ambient_bed';

export function createAudio(cfg) {
  const acfg = cfg.audio || {};
  const events = acfg.events || {};
  const throttle = acfg.throttle || { minInterval: 0, maxConcurrentPerEvent: Infinity };

  // --- lazily-created audio graph -------------------------------------------
  // The context starts suspended (autoplay policy) and is resumed exactly once by
  // unlock() on the first user gesture. Graph shape:
  //   [layer sources] → [filters] → [tremolo] → layerGain → (channel) → master → destination

  let _ctx = null;        // the AudioContext (null until first unlock attempt)
  let _master = null;     // master GainNode
  let _channels = null;   // { sfx: GainNode, bed: GainNode }
  let _noiseBuf = null;   // shared 1s white-noise buffer (built once per context)
  let _muted = !!acfg.muted;
  // Player volume 0..1 — an in-memory multiplier ON TOP of cfg master (never persisted,
  // same stateless stance as mute). 1 = cfg master untouched (CATS-102).
  let _volume = 1;
  // startBed() can be called in the same task as unlock() (the Start gesture does
  // both), before resume() has landed. Park the intent; resume's .then starts it.
  let _bedWanted = false;
  // A one-shot parked the same way (CATS-117): a shared postcard link wants its
  // arrival voice on the first gesture, but the page loads with no gesture yet.
  // Cleared once fired, or by reset() between runs.
  let _pendingShot = null; // { name, opts }

  // Throttle bookkeeping — per event name, on the Web Audio clock.
  const _lastPlay = Object.create(null);   // name → ctx.currentTime of last fire
  const _liveCount = Object.create(null);  // name → voices still sounding

  // The ambient bed's live layers, by layer id (startBed/stopBed/setBedProgress).
  let _bed = null; // { layers: Map(id → { gain, sources }), warmer, warmerOn, warmerGain }
  // Bed 'seq' layers: repeating note sequences (CATS-101). Each entry is
  // { bus, stop(t) } — the bus is a GainNode the scheduled notes route through, so the
  // bed's layer fade can duck the whole melody while it keeps sequencing.
  const _bedSeqs = [];

  function ensureContext() {
    if (_ctx) return _ctx;
    const AC = (typeof AudioContext !== 'undefined')
      ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) return null;
    try {
      _ctx = new AC();
    } catch (_) {
      _ctx = null;
      return null;
    }
    _master = _ctx.createGain();
    _master.gain.value = _muted ? 0 : effectiveGain();
    _master.connect(_ctx.destination);
    const chans = acfg.channels || {};
    const mk = (v) => {
      const g = _ctx.createGain();
      g.gain.value = v;
      g.connect(_master);
      return g;
    };
    _channels = { sfx: mk(chans.sfx ?? 1), bed: mk(chans.bed ?? 1) };
    // CATS-111 follow-up: flush a parked bed intent the moment the context ACTUALLY runs,
    // however it gets there — our own resume(), or the browser resuming it once the user
    // gesture lands. The story page parked the bed while the context was still suspended;
    // nothing re-called startBed() when it later became runnable, so the intro music only
    // began after a mute off/on cycle. BED ONLY: the parked one-shot (CATS-117) must wait
    // for a genuine gesture — in a permissive browser the context can reach 'running' at
    // load with no interaction, and the postcard's arrival voice must not sound then.
    _ctx.onstatechange = () => {
      if (_ctx && _ctx.state === 'running' && _bedWanted) startBed();
    };
    return _ctx;
  }

  function masterGain() {
    return typeof acfg.master === 'number' ? acfg.master : 0.3;
  }

  // The master gain node's target value: cfg master × player volume. Mute overrides to 0.
  function effectiveGain() {
    return masterGain() * _volume;
  }

  // 1s of white noise, built once. Layer bandpass/lowpass filters color it per voice.
  function noiseBuffer(ctx) {
    if (_noiseBuf) return _noiseBuf;
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    _noiseBuf = b;
    return b;
  }

  // --- the one public trigger gameplay touches ------------------------------
  //
  // play(name, opts?) — fire-and-forget. No-ops internally (returns fast, never throws)
  // when the context is missing/still suspended, the name is unknown, the event is
  // muted, or the throttle collapses the call. opts:
  //   tier — 0|1|2 fish tier for fish_munch (per-tier pitch/duration scaling, CATS-93)
  //   pan  — -1..1 stereo nudge from the entity's screen position (feel flourish)
  function play(name, opts = {}) {
    if (!AUDIO_EVENTS.includes(name)) {
      // Reject unknown names loudly — mirrors fx.js's FX_TYPES rejection (a typo'd
      // event must fail, not silently no-op).
      console.warn(`[audio] unknown event "${name}"; expected one of ${AUDIO_EVENTS.join(', ')}`);
      return;
    }
    if (name === BED_EVENT) return; // the bed is started/stopped, never play-per-event
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running') return;
    if (_muted) return;

    // Throttle on the Web Audio clock (audio is a real-time cosmetic, §3.4).
    const now = ctx.currentTime;
    const last = _lastPlay[name];
    if (last !== undefined && (now - last) < throttle.minInterval) return;
    if ((_liveCount[name] || 0) >= throttle.maxConcurrentPerEvent) return;
    _lastPlay[name] = now;
    _liveCount[name] = (_liveCount[name] || 0) + 1;

    const spec = events[name];
    if (!spec) { retireVoice(name); return; }
    if (spec.sample) { playSample(name, spec.sample); return; }
    if (!spec.synth || !Array.isArray(spec.synth.layers)) { retireVoice(name); return; }

    // fish_munch is sized by tier (CATS-93 TIER_MUL — data, applied here at the
    // engine boundary so the recipe stays flat): bigger oaf = lower AND lazier.
    let tierMul = 1;
    let durMul = 1;
    if (name === 'fish_munch' && typeof opts.tier === 'number' && events.tierMul) {
      tierMul = events.tierMul[opts.tier] ?? 1;
      durMul = 1 / Math.sqrt(tierMul);
    }

    let endsAt = 0;
    for (const L of spec.synth.layers) {
      const t = buildLayer(ctx, L, now, { tierMul, durMul, pan: opts.pan });
      if (t > endsAt) endsAt = t;
    }
    // Retire the voice's throttle count when its last layer has sounded (setTimeout is
    // bookkeeping only — audible timing is entirely the Web Audio graph's).
    scheduleRetire(ctx, name, endsAt);
  }

  function retireVoice(name) {
    _liveCount[name] = Math.max(0, (_liveCount[name] || 1) - 1);
  }

  function scheduleRetire(ctx, name, endsAt) {
    if (!isFinite(endsAt)) return; // sustained layers only exist in the bed path
    const ms = Math.max(0, (endsAt - ctx.currentTime) * 1000) + 60;
    setTimeout(() => retireVoice(name), ms);
  }

  // Build one one-shot layer of a voice at time t0. Returns the ctx time the layer
  // finishes. Structural reads: every audible value comes from the layer spec (L.*) —
  // the engine contributes only graph wiring and the envelope the spec's
  // attack/hold/decay scalars describe. `dest` overrides the mix destination (the bed
  // seq bus routes its scheduled notes through their own gain, CATS-101); default the
  // sfx channel.
  function buildLayer(ctx, L, t0, { tierMul = 1, durMul = 1, pan = null, dest = null }) {
    const t = t0 + (L.delay || 0) * durMul;
    const attack = (L.attack ?? 0) * durMul;
    const hold = (L.hold ?? 0) * durMul;
    const decay = L.decay * durMul;
    const peak = L.gain ?? 0.3;
    const end = t + attack + hold + decay;

    // --- source ---
    let src;
    if (L.type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
    } else {
      src = ctx.createOscillator();
      src.type = L.wave || 'sine';
      const f0 = Math.max(0.0001, (L.freq || 440) * tierMul);
      src.frequency.setValueAtTime(f0, t);
      const f1 = Math.max(0.0001, (L.freqEnd !== undefined ? L.freqEnd : L.freq) * tierMul);
      if (f1 !== f0 && L.glideCurve === 'exp') {
        // Glide over attack+hold + most of the decay — the "plip" lands early so the
        // tail settles. Exponential = natural pitch motion.
        src.frequency.exponentialRampToValueAtTime(f1, t + attack + hold + decay * 0.6);
      }
      // vibrato: an LFO into frequency (depth in cents → Hz), the flutter family.
      if (L.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = L.vibrato.rate;
        const amt = ctx.createGain();
        amt.gain.value = f0 * (L.vibrato.depth / 1200);
        lfo.connect(amt);
        amt.connect(src.frequency);
        lfo.start(t);
        lfo.stop(end + 0.05);
      }
    }

    // --- filters: bandpass colors noise (the water motion); lowpass rolls off every
    //     layer's top end — the main "gentle" knob per CATS-93 ---
    let head = src;
    if (L.type === 'noise' && L.bandpass) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(L.bandpass.center, t);
      bp.Q.value = L.bandpass.Q ?? 1;
      if (L.bandpass.sweepTo !== undefined) {
        bp.frequency.exponentialRampToValueAtTime(L.bandpass.sweepTo, t + attack + hold + decay);
      }
      head.connect(bp);
      head = bp;
    }
    if (L.lowpass !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = L.lowpass;
      head.connect(lp);
      head = lp;
    }
    if (pan !== null && typeof ctx.createStereoPanner === 'function' && pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      head.connect(p);
      head = p;
    }

    // --- tremolo: an LFO into a gain BEFORE the envelope gain, so the envelope's
    //     silence at the tail fully closes the voice (the cheeks/lap wobble) ---
    if (L.tremolo) {
      const tg = ctx.createGain();
      tg.gain.value = 1 - L.tremolo.depth;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = L.tremolo.rate;
      const amt = ctx.createGain();
      amt.gain.value = L.tremolo.depth;
      lfo.connect(amt);
      amt.connect(tg.gain);
      lfo.start(t);
      lfo.stop(end + 0.05);
      head.connect(tg);
      head = tg;
    }

    // --- envelope (exponential-feel, from the spec's attack/hold/decay) ---
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + Math.max(0.0001, attack));
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0001, peak), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    head.connect(g);
    g.connect(dest || _channels.sfx);

    src.start(t);
    src.stop(end + 0.05);
    return end;
  }

  // --- sample playback (the escape hatch — treats { sample } uniformly, §1) ---
  // Samples are cached by URL; a failed fetch silently no-ops (additive audio).
  const _sampleCache = new Map();
  function playSample(name, url) {
    const ctx = _ctx;
    if (!ctx) return;
    const cached = _sampleCache.get(url);
    if (cached === null) { retireVoice(name); return; } // already failed — never retry
    if (cached) { startSampleVoice(name, cached); return; }
    _sampleCache.set(url, false); // false = fetch in flight
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        _sampleCache.set(url, buf);
        startSampleVoice(name, buf);
      })
      .catch(() => {
        _sampleCache.set(url, null);
        retireVoice(name);
      });
  }
  function startSampleVoice(name, buf) {
    if (_muted) { retireVoice(name); return; }
    const src = _ctx.createBufferSource();
    src.buffer = buf;
    src.connect(_channels.sfx);
    src.start();
    src.onended = () => retireVoice(name);
  }

  // --- parked one-shot (CATS-117: a shared postcard link's arrival voice) ----
  //
  // playOnUnlock(name, opts) parks a single one-shot for the first user interaction,
  // whatever the browser's autoplay posture. The shared postcard link opens mid-end-state
  // — the run's arrival voice would have played during the landing the sender played, but
  // the receiver's fresh page has no gesture yet. Parking it re-creates the beat on the
  // receiver's first interaction with the card. The flush is gesture-driven only
  // (unlock()'s two branches), so the voice waits for the first interaction even in a
  // permissive browser that would allow sound at load. Last park wins; reset() drops it.
  function playOnUnlock(name, opts = {}) {
    if (!AUDIO_EVENTS.includes(name)) {
      console.warn(`[audio] unknown event "${name}"; expected one of ${AUDIO_EVENTS.join(', ')}`);
      return;
    }
    if (name === BED_EVENT) { startBed(); return; }
    _pendingShot = { name, opts };
  }

  // --- autoplay unlock (called from main.js on the first user gesture) ------
  // Retries resume() on EVERY gesture until the context is actually running. The old
  // one-shot latch marked the context unlocked before resume() landed; when that first
  // resume resolved or rejected without starting the context (autoplay-policy timing),
  // later gestures no-op'd and the parked bed intent was never flushed. No-ops (and
  // never throws) when Web Audio is absent or the context is already running — the game
  // stays fully playable silent.
  function unlock() {
    const ctx = ensureContext();
    if (!ctx || ctx.state === 'running') {
      // Already running (a permissive autoplay posture, or the browser resumed it): a
      // gesture arrived and nothing is waiting on a resume — flush anything parked now
      // so the first interaction still sounds immediately.
      if (ctx && ctx.state === 'running') flushParkedIntents();
      return;
    }
    try {
      const p = ctx.resume && ctx.resume();
      if (p && typeof p.then === 'function') {
        p.then(() => { if (ctx.state === 'running') flushParkedIntents(); }).catch(() => {});
      }
    } catch (_) { /* resume unavailable; the onstatechange flush still covers recovery */ }
  }

  // Fire every parked intent (the bed + the pending one-shot) on the first user
  // interaction. Called ONLY from unlock()'s gesture-driven branches, so parked sound
  // always waits for the first interaction and never plays at load — even in a permissive
  // browser where the context itself could run earlier (onstatechange flushes only the
  // bed, never the parked one-shot).
  function flushParkedIntents() {
    if (_bedWanted) startBed();
    if (_pendingShot) {
      const { name, opts } = _pendingShot;
      _pendingShot = null;
      play(name, opts);
    }
  }

  // --- mute (in-memory / per-session; NEVER persisted — stateless MVP) ------
  //
  // Ramps the master gain to 0 / back over a short fade so toggling mid-sound doesn't
  // pop. The boolean lives here, on the audio object.
  const MUTE_FADE = 0.04; // s — just enough to de-click the toggle
  function setMuted(m) {
    _muted = !!m;
    if (!_ctx) return;
    const now = _ctx.currentTime;
    _master.gain.cancelScheduledValues(now);
    _master.gain.setValueAtTime(Math.max(0.0001, _master.gain.value), now);
    _master.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, _muted ? 0 : effectiveGain()), now + MUTE_FADE);
  }
  function isMuted() { return _muted; }

  // --- volume (in-memory multiplier on cfg master; NEVER persisted — stateless MVP) --
  //
  // setVolume(v) clamps to 0..1 and ramps the master gain over the same short fade as
  // mute, so stepping mid-sound doesn't pop. Muted stays muted (the ramp target is 0
  // while _muted holds) — unmuting then lands at the CURRENT volume, not cfg default.
  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (!_ctx) return;
    const now = _ctx.currentTime;
    _master.gain.cancelScheduledValues(now);
    _master.gain.setValueAtTime(Math.max(0.0001, _master.gain.value), now);
    _master.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, _muted ? 0 : effectiveGain()), now + MUTE_FADE);
  }
  function getVolume() { return _volume; }

  // --- the ambient bed (P4 — started/stopped, never play-per-event) ---------
  //
  // startBed builds the bed's sustained layers once and lets them run; the recipe is
  // authored amplitude-symmetric (slow shallow tremolo around a flat mean) so looping
  // can't crescendo. setBedProgress mixes in the optional dusk-warmth layer (BED_WARMER
  // data, CATS-93) as the run's timer crosses warmBelowProgress — rising warmth at
  // dusk, never darkening.
  function startBed() {
    const ctx = ensureContext();
    if (!ctx) return;
    // If the context is still awaiting its unlock resume, remember the intent —
    // unlock's resume().then starts the bed the moment audio is actually live.
    if (ctx.state !== 'running') { _bedWanted = true; return; }
    if (_muted || _bed) return;
    const spec = events[BED_EVENT];
    if (!spec) return;
    if (spec.sample) { playSample(BED_EVENT, spec.sample); return; }
    if (!spec.synth || !Array.isArray(spec.synth.layers)) return;

    const warmer = events.bedWarmer || null;
    const layers = new Map();
    for (const L of spec.synth.layers) {
      // A repeating note sequence (the melody/croak layers, CATS-101): scheduled notes
      // on the Web Audio clock routed through one bus gain, so the bed's stop fade can
      // duck the whole sequence. Not a sustained layer — never in `layers`.
      if (L.type === 'seq') { _bedSeqs.push(buildBedSeq(ctx, L)); continue; }
      // The warmth layer starts silent (gain 0) — setBedProgress fades it in at dusk.
      const silent = warmer && L.id === warmer.layerId;
      layers.set(L.id || layers.size, buildBedLayer(ctx, L, silent ? 0 : undefined));
    }
    _bed = {
      layers,
      warmer,
      warmerOn: false,
      warmerGain: warmer ? layers.get(warmer.layerId) : null,
    };
    _bedWanted = false;
  }

  // A sustained bed layer: same grammar as a one-shot layer, but hold=Infinity means
  // the envelope's decay IS the stop fade. Returns the layer's gain node (so stopBed
  // can fade it out and the warmer can be addressed).
  function buildBedLayer(ctx, L, gainOverride) {
    const t = ctx.currentTime;
    const attack = L.attack ?? 0;
    const peak = gainOverride !== undefined ? gainOverride : (L.gain ?? 0.3);
    const bedStops = []; // oscillating sources + LFOs, stopped by stopBed

    let src;
    if (L.type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
    } else {
      src = ctx.createOscillator();
      src.type = L.wave || 'sine';
      src.frequency.value = L.freq || 440;
      if (L.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = L.vibrato.rate;
        const amt = ctx.createGain();
        amt.gain.value = (L.freq || 440) * (L.vibrato.depth / 1200);
        lfo.connect(amt);
        amt.connect(src.frequency);
        lfo.start(t);
        bedStops.push(lfo);
      }
    }
    let head = src;
    if (L.type === 'noise' && L.bandpass) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = L.bandpass.center;
      bp.Q.value = L.bandpass.Q ?? 1;
      head.connect(bp);
      head = bp;
    }
    if (L.lowpass !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = L.lowpass;
      head.connect(lp);
      head = lp;
    }
    if (L.tremolo) {
      const tg = ctx.createGain();
      tg.gain.value = 1 - L.tremolo.depth;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = L.tremolo.rate;
      const amt = ctx.createGain();
      amt.gain.value = L.tremolo.depth;
      lfo.connect(amt);
      amt.connect(tg.gain);
      lfo.start(t);
      bedStops.push(lfo);
      head.connect(tg);
      head = tg;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + Math.max(0.0001, attack));
    head.connect(g);
    g.connect(_channels.bed);
    src.start(t);
    // Park every stoppable node of this layer on its gain so stopBed can end the
    // looping sources + LFOs cleanly (they never end on their own).
    g._stops = [...bedStops, src];
    return g;
  }

  // --- bed 'seq' layers: a repeating note sequence (CATS-101 — the melody / croak / ──
  // dungeon-synth beds). Everything audible is still recipe data: `notes` is a list of
  // note steps (a step may be `rest`), `secondsPerStep` is its clock, and each note is
  // an ordinary voice-spec layer EXCEPT that its `gain` is relative to the seq's own
  // `gain` (the bus level). The engine contributes only scheduling: a lookahead
  // scheduler on the Web Audio clock (audio is a real-time cosmetic, §3.4) walks the
  // pattern forever, reusing buildLayer per note with the bed channel as destination.
  // R7/R9 stay data-enforced: patterns are authored amplitude-flat (no note louder
  // than the first), so a loop point can't crescendo, and the bus gain rides under
  // channels.bed exactly like a sustained layer.
  function buildBedSeq(ctx, L) {
    const bus = ctx.createGain();
    bus.gain.value = L.gain ?? 0.1;
    bus.connect(_channels.bed);
    const noop = { bus, stop() { try { bus.disconnect(); } catch (_) {} } };
    const steps = (L.notes || []).map((n) => (n === 'rest' ? null : n));
    if (!steps.length) return noop;
    const spb = L.secondsPerStep ?? 1;
    // Schedule a rolling ~1.5 s window ahead of the clock; the interval keeps firing
    // until stop() clears it (a timer, like the throttle bookkeeping — the audible
    // result is entirely the Web Audio graph's). Notes in flight at stop time end on
    // their own envelopes under the bus's 0.3 s fade.
    let nextNote = ctx.currentTime + (L.delay ?? 0) + (L.startIn ?? 4);
    let nextIdx = 0;
    const timer = setInterval(() => {
      const now = ctx.currentTime;
      // If the timer was throttled (hidden tab), the schedule fell behind the clock;
      // resync to the next future step WITHOUT scheduling — stale notes would all
      // fire at once as a burst (the one shape a bed must never make).
      while (nextNote < now - 0.1) {
        nextNote += spb;
        nextIdx = (nextIdx + 1) % steps.length;
        if (nextIdx === 0) nextNote += L.restBetweenLoops ?? 0;
      }
      const horizon = now + 1.5;
      while (nextNote < horizon) {
        const note = steps[nextIdx];
        if (note) {
          buildLayer(ctx, note, nextNote, { pan: null, dest: bus });
        }
        nextNote += spb;
        nextIdx = (nextIdx + 1) % steps.length;
        if (nextIdx === 0) nextNote += L.restBetweenLoops ?? 0; // a breath between repeats
      }
    }, 500);
    return {
      bus,
      stop(t) {
        clearInterval(timer);
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        setTimeout(() => { try { bus.disconnect(); } catch (_) {} }, 450);
      },
    };
  }

  // Fade the bed out and stop its sources (looping sources never end on their own —
  // stopping them is what keeps restarts from leaking oscillators).
  function stopBed() {
    if (!_ctx) return;
    const ctx = _ctx;
    const bed = _bed;
    _bed = null;
    const t = ctx.currentTime;
    const out = t + 0.3;
    // seqs are independent of the sustained-layer map — stop them even if startBed
    // bailed between pushing a seq and setting _bed (belt-and-suspenders).
    for (const seq of _bedSeqs.splice(0)) seq.stop(t);
    if (!bed) return;
    for (const g of bed.layers.values()) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, out);
      for (const node of g._stops || []) {
        try { node.stop(out + 0.05); } catch (_) {}
      }
      setTimeout(() => { try { g.disconnect(); } catch (_) {} }, 450);
    }
  }

  // progress = the timer's 0..1 daylight-left value. When it crosses
  // warmBelowProgress the dusk-warmth layer fades to its listed gain over
  // warmFadeSeconds (data from BED_WARMER; flat weather otherwise).
  function setBedProgress(progress) {
    if (!_bed || !_bed.warmer || !_bed.warmerGain) return;
    const w = _bed.warmer;
    const want = progress < w.warmBelowProgress;
    if (want === _bed.warmerOn) return;
    _bed.warmerOn = want;
    const spec = events[BED_EVENT];
    const layer = spec && spec.synth
      ? spec.synth.layers.find((l) => l.id === w.layerId) : null;
    if (!layer) return;
    const ctx = _ctx;
    const t = ctx.currentTime;
    _bed.warmerGain.gain.cancelScheduledValues(t);
    _bed.warmerGain.gain.setValueAtTime(Math.max(0.0001, _bed.warmerGain.gain.value), t);
    _bed.warmerGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, want ? layer.gain : 0),
      t + w.warmFadeSeconds,
    );
  }

  // --- reset (between runs) ---------------------------------------------------
  // The bed is faded out so a fresh run starts from silence and the dusk-warmth state
  // re-arms; short one-shots still sounding from the ended run finish naturally (they
  // retire on the Web Audio clock). Throttle clocks keep running — audio is a
  // real-time cosmetic and is never part of the deterministic sim reset.
  function reset() {
    _bedWanted = false;
    _pendingShot = null;
    stopBed();
  }

  return { play, playOnUnlock, unlock, setMuted, isMuted, setVolume, getVolume, startBed, stopBed, setBedProgress, reset };
}
