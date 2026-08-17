/* =========================================================================
   motion.js — the in-app motion switch.

   Motion is ON by default for everyone, including visitors whose OS asks
   for reduced motion: most people who turn Windows animations off did it
   for battery or performance and still want to watch the spawn. The switch
   in the header is the single source of truth, and it is deliberately an
   opt-OUT rather than an opt-in.

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
    var icon = document.getElementById('motionIcon');
    /* Two bars rather than U+23F8: it sits in the same Unicode block as the
       play triangle, so both render as monochrome text instead of one of
       them turning into a colour emoji. */
    if (icon) icon.textContent = mode === 'off' ? '▮▮' : '▶';
    btn.setAttribute('aria-pressed', String(mode === 'on'));
    btn.setAttribute('title', mode === 'on'
      ? 'Animation is on — click to turn it off'
      : 'Animation is off — click to turn it on');
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
