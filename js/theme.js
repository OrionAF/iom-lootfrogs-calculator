/* =========================================================================
   Theme toggle — "press" (dark ink) and "newsprint" (light stock).

   The stylesheet drives everything off custom properties, so switching is a
   single attribute on <html>. Nothing else in the app needs to know.
   ========================================================================= */

(function () {
  'use strict';

  var KEY = 'frogspawn.theme';
  var root = document.documentElement;

  function systemPrefersLight() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  /* No attribute means "follow the system", so resolve it the same way CSS does. */
  function effective() {
    var set = root.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return systemPrefersLight() ? 'light' : 'dark';
  }

  function paint(btn, theme) {
    var icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = theme === 'light' ? '○' : '●';
    btn.setAttribute('aria-label',
      theme === 'light' ? 'Newsprint theme — switch to press' : 'Press theme — switch to newsprint');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#e8e4d5' : '#0d0f0b');
  }

  function init() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;

    paint(btn, effective());

    btn.addEventListener('click', function () {
      var next = effective() === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (err) { /* noop */ }
      paint(btn, next);
    });

    /* Only track the system while the reader has not chosen for themselves. */
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var onChange = function () {
        if (!root.getAttribute('data-theme')) paint(btn, effective());
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
