/* =========================================================================
   motion.js — the in-app motion switch.

   Motion is ON by default for everyone, including visitors whose OS asks
   for reduced motion: most people who turn Windows animations off did it
   for battery or performance and still want to watch the spawn. The switch
   in the launch row is the single source of truth, and it is deliberately an
   opt-OUT rather than an opt-in. It sits beside Show speed because that is
   the control it governs — flipping it off is a decision about the spawn
   show, and the show is what the launch card is for.

   The choice lives on <html data-motion>, so CSS can silence every
   animation and the simulator can decide whether to run the spawn show,
   both from one attribute.
   ========================================================================= */

(function () {
  'use strict';

  var KEY = 'frogspawn.motion';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-motion') === 'off' ? 'off' : 'on';
  }

  function paint(btn, mode) {
    var on = mode === 'on';
    /* The word is the state, never the action: a play/pause glyph flips its
       meaning depending on which one the reader assumes, and a paused page
       showing pause bars is exactly where that goes wrong. The title carries
       the action instead, where there is room to spell it out. */
    var state = document.getElementById('motionState');
    if (state) state.textContent = on ? 'On' : 'Off';
    btn.setAttribute('aria-checked', String(on));
    btn.setAttribute('title', on
      ? 'Animation is on — click to turn it off'
      : 'Animation is off — click to turn it on');

    /* Show speed times a show that is not going to play. */
    var speed = document.getElementById('optSpeed');
    if (speed) speed.disabled = !on;
  }

  function init() {
    var btn = document.getElementById('motionToggle');
    if (!btn) return;

    root.setAttribute('data-motion', current());
    paint(btn, current());

    btn.addEventListener('click', function () {
      var next = current() === 'on' ? 'off' : 'on';
      root.setAttribute('data-motion', next);
      try { localStorage.setItem(KEY, next); } catch (err) { /* noop */ }
      paint(btn, next);
      /* The launch note explains why the spawn show is or is not going to
         play, so it has to be redrawn the moment this changes. */
      if (typeof window.LFRefreshLaunchNote === 'function') window.LFRefreshLaunchNote();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
