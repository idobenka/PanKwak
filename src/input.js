// input.js — unified continuous steering across keyboard, pointer-drag, and device tilt.
//
// Continuous inputs only (no grab/fire/latch). Keeping inputs continuous is what makes
// Continuous inputs keep the steering feel smooth across every device — see
// game_design.md §Concept 4 Controls. This module reduces three physically different
// input sources to ONE snapshot { left, right, up, down } consumed each fixed step, so the
// boat/loss code never branches on input kind.
//
//   • keyboard    — held arrows / WASD map directly to the four directions.
//   • pointer drag — mouse OR touch (Pointer Events): the delta from the drag anchor sets a
//     steering intent vector. A deadzone keeps a held-but-still drag from jittering the boat
//     (which would itself read as a twitchy boat — we don't want the input device to
//     tax the player). Beyond the deadzone the vector is clamped and decomposed into the
//     same four booleans, so "drag down-right" reads as {down, right}.
//   • device tilt  — gamma (left/right) and beta (forward/back) angles, calibrated to the
//     phone's neutral hold at first sample, with a deadzone. Requires iOS permission, which
//     we request on the first user gesture.
//
// shareability beyond desktop is a Phase 1 goal (CATS-22 scope item 6); a drag works on any
// touch screen and tilt works on a phone, so the same link is playable on desktop + mobile.

export function createInput() {
  const held = { left: false, right: false, up: false, down: false };
  let restartRequested = false;
  let started = false;

  // --- pointer drag state ---
  // anchor = where the current drag started (in canvas px). current = latest pointer pos.
  // null when no drag is active. The drag contributes to `held` each snapshot.
  let anchor = null;
  let current = null;
  let canvasRect = null;

  const DRAG_DEADZONE = 14; // px below which a drag reads as "no input" (no jitter tax)
  const DRAG_FULL = 90; // px at which a drag is at full intent

  // --- tilt state ---
  // Calibrated so the phone's neutral hold reads as zero. null until the first sample.
  let tiltCalib = null; // { gamma, beta }
  let tiltVec = { x: 0, y: 0 }; // -1..1 intent from tilt
  const TILT_DEADZONE = 4; // degrees
  const TILT_FULL = 16; // degrees for full intent

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
  };

  function onKeyDown(e) {
    if (KEYMAP[e.code]) {
      held[KEYMAP[e.code]] = true;
      e.preventDefault();
      started = true;
    }
    if (e.code === 'KeyR') {
      restartRequested = true;
    }
  }

  function onKeyUp(e) {
    if (KEYMAP[e.code]) {
      held[KEYMAP[e.code]] = false;
      e.preventDefault();
    }
  }

  // --- Pointer Events (mouse + touch + pen unified) ---
  // The on-canvas HUD controls (CATS-94/102 speaker + slider) are gone — the shared DOM
  // bar (ui/controls.js, CATS-112) owns sound, so every canvas pointer-down is a steering
  // drag again.
  function onPointerDown(e) {
    anchor = { x: e.clientX, y: e.clientY };
    current = { x: e.clientX, y: e.clientY };
    started = true;
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onPointerMove(e) {
    if (anchor == null) return;
    current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    anchor = null;
    current = null;
  }

  // --- device tilt (mobile) ---
  function requestTiltPermission() {
    // iOS 13+ gates DeviceOrientation behind an explicit permission prompt on a user gesture.
    const D = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission()
        .then((s) => { if (s === 'granted') attachTilt(); })
        .catch(() => {});
    } else {
      attachTilt(); // non-iOS: no permission needed
    }
  }
  function attachTilt() {
    window.addEventListener('deviceorientation', onDeviceOrient, true);
  }
  function onDeviceOrient(e) {
    // gamma = left/right tilt (-90..90), beta = front/back tilt (-180..180).
    if (tiltCalib == null) tiltCalib = { gamma: e.gamma || 0, beta: e.beta || 0 };
    const dx = (e.gamma || 0) - tiltCalib.gamma;
    const dy = (e.beta || 0) - tiltCalib.beta;
    tiltVec = {
      x: applyDeadzone(dx, TILT_DEADZONE, TILT_FULL),
      y: applyDeadzone(dy, TILT_DEADZONE, TILT_FULL),
    };
    started = true;
  }

  function applyDeadzone(v, dead, full) {
    const sign = Math.sign(v);
    const mag = Math.abs(v);
    if (mag <= dead) return 0;
    return sign * Math.min(1, (mag - dead) / (full - dead));
  }

  function attach(target) {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    // Pointer drag attaches to the canvas (set by bindCanvas) — see bindCanvas.
    // First user gesture also requests tilt permission (mobile).
    const gesture = () => {
      requestTiltPermission();
      target.removeEventListener('pointerdown', gesture);
      target.removeEventListener('keydown', gesture);
    };
    target.addEventListener('pointerdown', gesture);
    target.addEventListener('keydown', gesture);
  }

  // Wire pointer events to the canvas element (called from main.js). Drag coords are
  // resolved against the canvas's client rect so they're independent of page layout.
  function bindCanvas(el) {
    canvasRect = () => el.getBoundingClientRect();
    el.style.touchAction = 'none'; // let us own touch gestures (no scroll/zoom fight)
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    // CATS-103: the dblclick→restart listener was removed by design — a double-click
    // on the canvas does nothing now. Restart lives on the R key (and the postcard's
    // Play again button, which routes through game.reset()).
  }

  // Reduce keyboard + drag + tilt to one snapshot for this step.
  function snapshot() {
    const snap = { ...held };

    // --- pointer drag contribution ---
    if (anchor && current) {
      const dx = current.x - anchor.x;
      const dy = current.y - anchor.y;
      const ix = applyDeadzone(dx, DRAG_DEADZONE, DRAG_FULL);
      const iy = applyDeadzone(dy, DRAG_DEADZONE, DRAG_FULL);
      if (ix > 0) snap.right = true;
      else if (ix < 0) snap.left = true;
      if (iy > 0) snap.down = true;
      else if (iy < 0) snap.up = true;
    }

    // --- tilt contribution ---
    if (tiltVec.x > 0.15) snap.right = true;
    else if (tiltVec.x < -0.15) snap.left = true;
    if (tiltVec.y > 0.15) snap.down = true;
    else if (tiltVec.y < -0.15) snap.up = true;

    return snap;
  }

  function consumeRestart() {
    const r = restartRequested;
    restartRequested = false;
    return r;
  }

  function hasStarted() {
    return started;
  }

  return { attach, bindCanvas, snapshot, consumeRestart, hasStarted };
}
