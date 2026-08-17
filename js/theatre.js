/* =========================================================================
   theatre.js — the spawn show for a single Frogspawn.

   Replays an already-simulated run; it never rolls anything itself, so what
   you watch is exactly what the totals say. The sequence follows the game:

     1. open one column per point of Lootfrog Capacity
     2. drop the base frog into each column, left to right
     3. run the Triple row  — hit spawns 2 more, miss stamps a red X
     4. run the 10x row     — hit spawns 9 more, miss stamps a red X
     5. collapse the grid; every frog falls into one bowl
     6. roll Big, then Massive on the winners — they swell and shove
     7. roll Golden — winners swap to their gilded twin
     8. pop them all open and hand off to the reward grid

   Layout note: grid, bowl and sprite layer all live inside one relatively
   positioned box of the same width, and the sprite layer sits at its top
   left. During the grid phase the grid occupies that origin; when the grid
   collapses to zero height the bowl inherits it. So a sprite's coordinates
   mean the same thing throughout and "falling into the bowl" is nothing but
   a change of transform — no reparenting, no scroll desync.

   Bowl placement is circle packing: each frog is the circle inscribed in
   its sprite box, relaxed until nothing overlaps, which is why growing a
   frog visibly shoves its neighbours aside.
   ========================================================================= */
(function (global) {
  'use strict';

  var D = global.LFData;

  /* Sprite size inside the grid. Small on purpose — the grid is a tally of
     rolls, not a portrait gallery, and it has to fit `capacity` columns. */
  var GRID_W = 30;
  var GRID_H = 31;

  var COL_MIN = 52;
  var COL_MAX = 76;
  var COL_GAP = 4;
  var LABEL_W = 38;

  var HEAD_H = 16;
  var ROW_BASE = 42;
  var ROW_TRIPLE = 60;
  var ROW_TENX = 166;

  var BOWL_MIN_H = 240;
  var BOWL_PAD = 16;
  var PACK_FILL = 2.1;      // slack over raw circle area so packing can settle
  var PACK_ITERATIONS = 240;
  var PACK_PAD = 2.5;       // absorbs the rounding in place(), so no visible kiss
  var PACK_EPS = 0.6;       // settled enough to stop relaxing

  /* Baseline tempo. The reader's Show speed multiplies all of it, and the
     same multiplier reaches the stylesheet as --show-speed so the CSS
     transitions stretch with the script rather than against it. */
  var SPEED = 1.1;

  var T_BASE = {
    grid: 420,
    fall: 950,
    grow: 640,
    gild: 640,
    pop: 700
  };

  /* Natural per-column tempo: one Frogspawn always plays at this pace. */
  var STEP_BASE = 45;
  var STEP_ROLL = 66;
  var STEP_SETTLE = 260;

  /* The grid cycles once per Frogspawn, so several would otherwise take
     several times as long. Past the budget the cycles compress, down to a
     floor that keeps each one readable. */
  var GRID_BUDGET_BASE = 6000;
  var USE_MIN_BASE = 430;

  var timers = [];
  var running = false;
  var finishNow = null;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  /* ------------------------------------------------------------ columns -- */

  /**
   * Rebuild the column layout from a simulated use. `groupSize` records what
   * the column won — 1 neither, 3 Triple, 10 tenx, 12 both — and the frogs
   * are stored base-first, so the split back out is unambiguous.
   */
  /**
   * Split a run into its Frogspawn uses, keeping each one's offset into the
   * flat frog list so a column index can still reach the right sprite.
   */
  function toUses(frogs) {
    var uses = [];
    var current = null;
    for (var i = 0; i < frogs.length; i++) {
      if (!current || frogs[i].use !== current.use) {
        current = { use: frogs[i].use, offset: i, frogs: [] };
        uses.push(current);
      }
      current.frogs.push(frogs[i]);
    }
    return uses;
  }

  function toColumns(frogs) {
    var columns = [];
    var i = 0;
    while (i < frogs.length) {
      var size = frogs[i].groupSize;
      var col = { start: i, size: size, triple: false, tenx: false, tripleAt: -1, tenxAt: -1 };
      var n = 1;
      if (size === 3 || size === 12) { col.triple = true; col.tripleAt = i + n; n += 2; }
      if (size === 10 || size === 12) { col.tenx = true; col.tenxAt = i + n; n += 9; }
      columns.push(col);
      i += size;
    }
    return columns;
  }

  /* ------------------------------------------------------------ sprites -- */

  function artFor(frog, golden) {
    var list = golden ? D.FROG_ART_GOLD : D.FROG_ART;
    return list[(frog.art || 0) % list.length];
  }

  /* A sprite is a zero-size anchor that gets moved, with the image centred
     on it, so position and size animate independently. */
  function makeSprite(frog, layer) {
    var el = document.createElement('div');
    el.className = 'tf is-hidden';

    var img = document.createElement('img');
    img.src = artFor(frog, false);
    img.alt = '';
    img.draggable = false;
    img.style.width = GRID_W + 'px';
    img.style.height = GRID_H + 'px';

    el.appendChild(img);
    layer.appendChild(el);

    return { el: el, img: img, frog: frog, px: 0, py: 0, r: GRID_W / 2 };
  }

  function place(sprite, x, y) {
    sprite.px = x;
    sprite.py = y;
    sprite.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
  }

  function resize(sprite, w, h) {
    sprite.r = w / 2;
    sprite.img.style.width = w + 'px';
    sprite.img.style.height = h + 'px';
  }

  /* ----------------------------------------------------- circle packing -- */

  /**
   * Relax circles until they stop overlapping, keeping every one inside the
   * bowl. Deliberately not a physics engine: it solves for a resting layout
   * and CSS transitions carry the frogs there, which stays smooth no matter
   * how many frogs there are or how large they grow.
   */
  function packCircles(bodies, width, height, rand) {
    var i, j, a, b, dx, dy, d, overlap, push, iter;

    for (i = 0; i < bodies.length; i++) {
      a = bodies[i];
      a.pr = a.r + PACK_PAD;
      if (!a.placed) {
        a.px = a.pr + rand() * Math.max(1, width - 2 * a.pr);
        a.py = a.pr + rand() * Math.max(1, height - 2 * a.pr);
        a.placed = true;
      }
    }

    /* Biggest first: they have the least room to manoeuvre, so letting them
       claim space before the small ones settle avoids stranding one. */
    var order = bodies.slice().sort(function (m, n) { return n.pr - m.pr; });
    var n = order.length;
    for (i = 0; i < n; i++) order[i].idx = i;

    /* Broad phase. Two circles can only touch if their centres are within
       the largest diameter, so a grid of that cell size means each one need
       only look at its own cell and the eight around it. Comparing every
       pair is what made big crowds quadratic and unusable. */
    var maxR = 0;
    for (i = 0; i < n; i++) if (order[i].pr > maxR) maxR = order[i].pr;
    var cell = Math.max(8, maxR * 2);
    var cols = Math.max(1, Math.ceil(width / cell) + 1);
    var rows = Math.max(1, Math.ceil(height / cell) + 1);
    var head = new Int32Array(cols * rows);
    var next = new Int32Array(n);
    var cx, cy, gx, gy, k, worst;

    for (iter = 0; iter < PACK_ITERATIONS; iter++) {
      head.fill(-1);
      for (i = 0; i < n; i++) {
        a = order[i];
        cx = Math.min(cols - 1, Math.max(0, Math.floor(a.px / cell)));
        cy = Math.min(rows - 1, Math.max(0, Math.floor(a.py / cell)));
        a.cx = cx;
        a.cy = cy;
        k = cy * cols + cx;
        next[i] = head[k];
        head[k] = i;
      }

      worst = 0;
      for (i = 0; i < n; i++) {
        a = order[i];
        for (gy = a.cy - 1; gy <= a.cy + 1; gy++) {
          if (gy < 0 || gy >= rows) continue;
          for (gx = a.cx - 1; gx <= a.cx + 1; gx++) {
            if (gx < 0 || gx >= cols) continue;
            for (j = head[gy * cols + gx]; j !== -1; j = next[j]) {
              if (j <= i) continue;          // resolve each pair once
              b = order[j];
              dx = b.px - a.px;
              dy = b.py - a.py;
              d = Math.sqrt(dx * dx + dy * dy);
              overlap = a.pr + b.pr - d;
              if (overlap <= 0) continue;
              if (overlap > worst) worst = overlap;
              if (d < 0.0001) { dx = rand() - 0.5; dy = rand() - 0.5; d = 1; }
              push = overlap / d / 2;
              a.px -= dx * push;
              a.py -= dy * push;
              b.px += dx * push;
              b.py += dy * push;
            }
          }
        }
      }

      for (i = 0; i < n; i++) {
        a = order[i];
        a.px = Math.max(a.pr, Math.min(Math.max(a.pr, width - a.pr), a.px));
        a.py = Math.max(a.pr, Math.min(Math.max(a.pr, height - a.pr), a.py));
      }
      /* Stop as soon as the layout has settled. The remaining slack lives in
         PACK_PAD, which also absorbs the rounding in place(). */
      if (worst < PACK_EPS) break;
    }
  }

  /** Bowl tall enough that packing has slack instead of jamming. */
  function bowlHeight(bodies, width) {
    var area = 0;
    var widest = 0;
    for (var i = 0; i < bodies.length; i++) {
      area += Math.PI * bodies[i].r * bodies[i].r;
      widest = Math.max(widest, bodies[i].r * 2);
    }
    return Math.max(
      BOWL_MIN_H,
      Math.ceil(widest + BOWL_PAD * 2),
      Math.ceil(area * PACK_FILL / Math.max(1, width))
    );
  }

  /* --------------------------------------------------------- clustering -- */

  /* Arrange n frogs inside a cell: 1 centred, 2 offset, 9 as a staggered
     two-wide stack that reads as a pile rather than a table. */
  function clusterOffsets(n, cw, ch) {
    if (n === 1) return [{ x: cw / 2, y: ch / 2 }];
    if (n === 2) {
      return [
        { x: cw / 2 - GRID_W * 0.46, y: ch / 2 - GRID_H * 0.3 },
        { x: cw / 2 + GRID_W * 0.46, y: ch / 2 + GRID_H * 0.3 }
      ];
    }
    var out = [];
    var perRow = 2;
    var rowCount = Math.ceil(n / perRow);
    var stepY = Math.min(GRID_H * 0.9, (ch - GRID_H) / Math.max(1, rowCount - 1));
    var y0 = (ch - stepY * (rowCount - 1)) / 2;
    var stepX = GRID_W * 0.8;
    for (var k = 0; k < n; k++) {
      var row = Math.floor(k / perRow);
      var inRow = Math.min(perRow, n - row * perRow);
      var x0 = cw / 2 - stepX * (inRow - 1) / 2;
      out.push({ x: x0 + (k % perRow) * stepX + (row % 2 ? 4 : -4), y: y0 + row * stepY });
    }
    return out;
  }

  function cross() {
    var x = document.createElement('span');
    x.className = 'tg-x';
    x.setAttribute('aria-hidden', 'true');
    return x;
  }

  function flash(sprite, kind) {
    sprite.el.classList.add('is-' + kind, 'is-flash');
    later(function () { sprite.el.classList.remove('is-flash'); }, 420);
  }

  /* --------------------------------------------------------------- show -- */

  /**
   * @param {Object} opts
   *   run    simulated run; every Frogspawn in it cycles through one grid
   *   els    { root, stage, inner, grid, bowl, frogs, phase }
   *   rand   optional RNG for bowl scatter
   *   onDone called once, whether the show ran out or was skipped
   */
  function play(opts) {
    stop();
    running = true;

    var els = opts.els;
    var rand = opts.rand || Math.random;
    var frogs = opts.run.frogs;
    var uses = toUses(frogs);

    var speed = SPEED * (opts.speed > 0 ? opts.speed : 1);
    var T = {};
    Object.keys(T_BASE).forEach(function (k) { T[k] = Math.round(T_BASE[k] * speed); });
    var STEP_B = Math.round(STEP_BASE * speed);
    var STEP_R = Math.round(STEP_ROLL * speed);
    var STEP_S = Math.round(STEP_SETTLE * speed);
    var GRID_BUDGET = Math.round(GRID_BUDGET_BASE * speed);
    var USE_MIN = Math.round(USE_MIN_BASE * speed);
    /* Every Frogspawn rolls the same number of columns, so the first one
       sizes the grid and the rest reuse it. */
    var columns = toColumns(uses[0].frogs);
    var done = opts.onDone || function () {};

    /* Unhide before measuring — a hidden card reports zero width, which would
       silently collapse the whole layout to the fallback. Measure the stage,
       not the card, so padding is already excluded. */
    els.root.hidden = false;
    els.root.classList.remove('is-bowl');
    els.root.style.setProperty('--show-speed', String(opts.speed > 0 ? opts.speed : 1));

    var availW = Math.max(240, els.stage.clientWidth || els.root.clientWidth || 900);
    var colW = Math.max(COL_MIN, Math.min(COL_MAX,
      Math.floor((availW - LABEL_W) / columns.length) - COL_GAP));
    var gridW = LABEL_W + columns.length * (colW + COL_GAP);
    var gridH = HEAD_H + ROW_BASE + ROW_TRIPLE + ROW_TENX;
    var stageW = Math.max(availW, gridW);
    var gridX = Math.floor(Math.max(0, stageW - gridW) / 2);

    /* A Massive frog is 256px wide and simply will not fit a narrower bowl,
       so on very small screens every size shrinks by the same factor and the
       relative scale between basic, Big and Massive is preserved. */
    var spriteScale = Math.min(1, stageW / (D.FROG_SPRITE.massive.w + BOWL_PAD * 2));

    function sized(key) {
      var s = D.FROG_SPRITE[key];
      return { w: Math.round(s.w * spriteScale), h: Math.round(s.h * spriteScale) };
    }
    els.grid.innerHTML = '';
    els.frogs.innerHTML = '';
    els.bowl.classList.remove('is-open');
    els.bowl.style.height = '0px';
    els.inner.style.width = stageW + 'px';
    els.grid.style.width = stageW + 'px';
    els.grid.style.height = gridH + 'px';
    els.frogs.style.width = stageW + 'px';

    function phase(text) { if (els.phase) els.phase.textContent = text; }

    /* --- grid scaffolding ----------------------------------------------- */

    var rows = {
      base: { top: HEAD_H, h: ROW_BASE },
      triple: { top: HEAD_H + ROW_BASE, h: ROW_TRIPLE },
      tenx: { top: HEAD_H + ROW_BASE + ROW_TRIPLE, h: ROW_TENX }
    };

    ['triple', 'tenx'].forEach(function (key) {
      var lab = document.createElement('div');
      lab.className = 'tg-label';
      lab.style.top = rows[key].top + 'px';
      lab.style.left = gridX + 'px';
      lab.style.height = rows[key].h + 'px';
      lab.style.width = LABEL_W + 'px';
      lab.textContent = key === 'triple' ? '3×' : '10×';
      els.grid.appendChild(lab);
    });

    var cells = columns.map(function (col, c) {
      var left = gridX + LABEL_W + c * (colW + COL_GAP);

      var head = document.createElement('div');
      head.className = 'tg-head';
      head.style.left = left + 'px';
      head.style.width = colW + 'px';
      head.style.height = HEAD_H + 'px';
      head.textContent = String(c + 1);
      els.grid.appendChild(head);

      var byRow = {};
      Object.keys(rows).forEach(function (key) {
        var cell = document.createElement('div');
        cell.className = 'tg-cell';
        cell.style.left = left + 'px';
        cell.style.top = rows[key].top + 'px';
        cell.style.width = colW + 'px';
        cell.style.height = rows[key].h + 'px';
        cell.style.animationDelay = (c * 14) + 'ms';
        els.grid.appendChild(cell);
        byRow[key] = cell;
      });

      return { col: col, left: left, byRow: byRow };
    });

    /* --- sprites, parked above the grid --------------------------------- */

    var sprites = frogs.map(function (f) { return makeSprite(f, els.frogs); });
    sprites.forEach(function (s) { place(s, gridX + gridW / 2, -50); });

    function reveal(sprite, x, y) {
      sprite.el.classList.remove('is-hidden');
      sprite.el.classList.add('is-drop');
      place(sprite, x, y);
    }

    /* Wipe the hit/miss marks so the same grid can roll the next Frogspawn. */
    function clearMarks() {
      cells.forEach(function (cell) {
        Object.keys(cell.byRow).forEach(function (key) {
          var el = cell.byRow[key];
          el.classList.remove('is-hit', 'is-miss');
          var x = el.querySelector('.tg-x');
          if (x) el.removeChild(x);
        });
      });
    }

    /* ================================ script ============================= */

    /* A single Frogspawn runs at the natural tempo. More than one compresses
       to fit the budget, but never below the floor that keeps a cycle
       readable — so the show grows with use count, just far more slowly. */
    var natural = columns.length * (STEP_B + 2 * STEP_R) + 2 * STEP_S;
    var scale = Math.min(1, GRID_BUDGET / (natural * uses.length));
    scale = Math.max(scale, Math.min(1, USE_MIN / natural));

    var baseStep = Math.max(4, Math.round(STEP_B * scale));
    var rollStep = Math.max(4, Math.round(STEP_R * scale));
    var settle = Math.max(40, Math.round(STEP_S * scale));
    var many = uses.length > 1;

    var t = 0;

    phase('Opening ' + columns.length + ' column' + (columns.length === 1 ? '' : 's'));
    els.grid.classList.add('is-in');
    t += T.grid;

    uses.forEach(function (use, u) {
      var cols = toColumns(use.frogs);
      var label = many ? 'Frogspawn ' + (u + 1) + '/' + uses.length + ' · ' : '';

      /* Reset the grid, and stow the previous Frogspawn's frogs so the cells
         are free. They stay in the layer, just invisible, ready to drop. */
      later(function () {
        clearMarks();
        if (u > 0) {
          var prev = uses[u - 1];
          for (var i = 0; i < prev.frogs.length; i++) {
            sprites[prev.offset + i].el.classList.remove('is-drop');
            sprites[prev.offset + i].el.classList.add('is-stowed');
          }
        }
        phase(label + 'Spawning the base Lootfrogs');
      }, t);

      cols.forEach(function (col, c) {
        later(function () {
          var off = clusterOffsets(1, colW, ROW_BASE)[0];
          reveal(sprites[use.offset + col.start], cells[c].left + off.x, rows.base.top + off.y);
        }, t + c * baseStep);
      });
      t += cols.length * baseStep + settle;

      [
        { key: 'triple', text: 'Rolling the 3× row', at: 'tripleAt', count: 2 },
        { key: 'tenx', text: 'Rolling the 10× row', at: 'tenxAt', count: 9 }
      ].forEach(function (row) {
        later(function () { phase(label + row.text); }, t);
        cols.forEach(function (col, c) {
          later(function () {
            var cellEl = cells[c].byRow[row.key];
            if (!col[row.key]) {
              cellEl.classList.add('is-miss');
              cellEl.appendChild(cross());
              return;
            }
            cellEl.classList.add('is-hit');
            var offs = clusterOffsets(row.count, colW, rows[row.key].h);
            for (var k = 0; k < row.count; k++) {
              reveal(sprites[use.offset + col[row.at] + k],
                cells[c].left + offs[k].x, rows[row.key].top + offs[k].y);
            }
          }, t + c * rollStep);
        });
        t += cols.length * rollStep + settle;
      });
    });

    /* 5 — collapse the grid; every Frogspawn's catch drops in together */
    later(function () {
      phase('Tipping ' + frogs.length + ' Lootfrogs into the bowl');
      sprites.forEach(function (s) { s.el.classList.remove('is-stowed'); });
      els.root.classList.add('is-bowl');
      els.grid.style.height = '0px';
      els.bowl.classList.add('is-open');
      sprites.forEach(function (s) {
        s.el.classList.add('is-falling');
        resize(s, sized('basic').w, sized('basic').h);
      });
      repack();
    }, t);
    t += T.fall;

    /* 6 — Big, then Massive on the winners */
    later(function () {
      phase('Rolling Big');
      sprites.forEach(function (s) {
        if (s.frog.size === 'big' || s.frog.size === 'massive') {
          resize(s, sized('big').w, sized('big').h);
          flash(s, 'big');
        }
      });
      repack();
    }, t);
    t += T.grow;

    later(function () {
      phase('Rolling Massive');
      sprites.forEach(function (s) {
        if (s.frog.size === 'massive') {
          resize(s, sized('massive').w, sized('massive').h);
          flash(s, 'massive');
        }
      });
      repack();
    }, t);
    t += T.grow;

    /* 7 — Golden swaps each winner for its gilded twin */
    later(function () {
      phase('Rolling Golden');
      sprites.forEach(function (s) {
        if (!s.frog.golden) return;
        s.img.src = artFor(s.frog, true);
        flash(s, 'gold');
      });
    }, t);
    t += T.gild;

    /* 8 — pop them open; the reward grid takes it from here */
    later(function () {
      phase('Popping them open');
      sprites.forEach(function (s, i) {
        later(function () { s.el.classList.add('is-pop'); }, (i % 20) * 20);
      });
    }, t);
    t += T.pop;

    later(finish, t);

    /* --------------------------------------------------------- helpers -- */

    function repack() {
      var width = stageW;
      var h = bowlHeight(sprites, width);
      els.bowl.style.height = h + 'px';
      packCircles(sprites, width, h, rand);
      sprites.forEach(function (s) { place(s, s.px, s.py); });
    }

    function finish() {
      if (!running) return;
      running = false;
      finishNow = null;
      clearTimers();
      phase('Loot');
      done();
    }

    finishNow = finish;
  }

  function stop() {
    running = false;
    finishNow = null;
    clearTimers();
  }

  /** Cut the show short; the caller's onDone still fires exactly once. */
  function skip() {
    if (finishNow) finishNow();
    else stop();
  }

  function isRunning() { return running; }

  function hide(els) {
    stop();
    els.root.hidden = true;
    els.frogs.innerHTML = '';
    els.grid.innerHTML = '';
  }

  global.LFTheatre = {
    play: play,
    stop: stop,
    skip: skip,
    hide: hide,
    isRunning: isRunning,
    toColumns: toColumns,
    packCircles: packCircles,
    bowlHeight: bowlHeight
  };
})(window);
