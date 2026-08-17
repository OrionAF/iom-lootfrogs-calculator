/* =========================================================================
   app.js — UI: stat entry, the spawn show, saved totals, odds tables.
   ========================================================================= */
(function (global) {
  'use strict';

  var D = global.LFData;
  var Sim = global.LFSim;
  var An = global.LFAnalytics;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* How much show we put on: full reel animation up to ANIMATE_CAP frogs,
     a fast cascade beyond that, and we stop building DOM at RENDER_CAP. */
  var ANIMATE_CAP = 60;
  var RENDER_CAP = 600;

  var STORE = {
    stats: 'lfcalc.stats',
    options: 'lfcalc.options',
    vault: 'lfcalc.vault',
    sound: 'lfcalc.sound'
  };

  var state = {
    currentRun: null,
    saved: false,
    animating: false,
    abort: false,
    timer: null,
    sound: false,
    vault: emptyVault()
  };

  function emptyVault() {
    return { runs: [], totals: {}, byType: {}, uses: 0, frogs: 0, seq: 0 };
  }

  /* ===================================================== formatting ==== */

  var SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function fmtInt(n) {
    n = Math.round(n);
    if (Math.abs(n) < 1e6) return n.toLocaleString('en-US');
    return fmtCompact(n);
  }

  function fmtCompact(n) {
    if (!isFinite(n)) return '∞';
    var neg = n < 0;
    n = Math.abs(n);
    var tier = n < 1000 ? 0 : Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIX.length) return (neg ? '-' : '') + n.toExponential(2);
    var scaled = n / Math.pow(1000, tier);
    var str = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
    return (neg ? '-' : '') + str.replace(/\.0+$/, '') + SUFFIX[tier];
  }

  /* Decimal-friendly formatter for expected values. */
  function fmtNum(n) {
    if (!isFinite(n)) return '—';
    if (n === 0) return '0';
    if (n >= 1e6) return fmtCompact(n);
    if (n >= 1000) return Math.round(n).toLocaleString('en-US');
    if (n >= 100) return n.toFixed(0);
    if (n >= 10) return n.toFixed(1);
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(3);
    return n.toPrecision(2);
  }

  function fmtPct(p) {
    var v = p * 100;
    if (v === 0) return '0%';
    if (v >= 10) return v.toFixed(1) + '%';
    if (v >= 1) return v.toFixed(2) + '%';
    if (v >= 0.01) return v.toFixed(3) + '%';
    return v.toPrecision(2) + '%';
  }

  function fmtMult(m) {
    if (m >= 1000) return '×' + fmtCompact(m);
    return '×' + (m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2));
  }

  function fmtOneIn(x) {
    if (!isFinite(x)) return '—';
    return x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1);
  }

  /* ===================================================== icon helper ==== */

  function makeIcon(resId, cls) {
    var res = D.RESOURCES[resId];
    var img = document.createElement('img');
    img.src = res.icon;
    img.alt = '';
    img.className = cls;
    img.loading = 'lazy';
    img.addEventListener('error', function () {
      var span = document.createElement('span');
      span.className = cls + ' fb';
      span.textContent = D.FALLBACK[resId] || '❓';
      span.setAttribute('role', 'img');
      span.setAttribute('aria-label', res.name);
      if (img.parentNode) img.parentNode.replaceChild(span, img);
    });
    return img;
  }

  /* The two hardcoded <img> tags in the markup need the same emoji safety
     net as the generated reward icons. */
  function guardStaticIcons() {
    document.querySelectorAll('img[data-fallback]').forEach(function (img) {
      img.addEventListener('error', function () {
        var span = document.createElement('span');
        span.className = img.className + ' fb';
        span.textContent = img.dataset.fallback;
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', 'Frogspawn');
        if (img.parentNode) img.parentNode.replaceChild(span, img);
      });
      if (img.complete && img.naturalWidth === 0) img.dispatchEvent(new Event('error'));
    });
  }

  /* ================================================== stats + config ==== */

  function buildStatGrid() {
    var grid = $('#statGrid');
    D.STAT_DEFS.forEach(function (def) {
      var label = document.createElement('label');
      label.className = 'field stat-field';
      label.innerHTML =
        '<span class="field-label">' + def.label +
        (def.unit ? ' <span class="unit">' + def.unit + '</span>' : '') + '</span>' +
        '<input type="number" id="stat_' + def.key + '" min="0" step="any" placeholder="' + def.def + '">' +
        '<em class="field-help">' + (def.help || '') + '</em>';
      grid.appendChild(label);
    });
  }

  function readStats() {
    var stats = {};
    D.STAT_DEFS.forEach(function (def) {
      var raw = $('#stat_' + def.key).value.trim();
      if (raw !== '') {
        var n = parseFloat(raw);
        if (isFinite(n)) stats[def.key] = n;
      }
    });
    return stats;
  }

  function writeStats(stats) {
    D.STAT_DEFS.forEach(function (def) {
      var input = $('#stat_' + def.key);
      var v = stats[def.key];
      input.value = (v === undefined || v === null || !isFinite(v)) ? '' : trimFloat(v);
    });
  }

  /* Game JSON carries long floats — keep them useful but readable. */
  function trimFloat(v) {
    var r = Math.round(v * 1e6) / 1e6;
    return String(r);
  }

  function readOptions() {
    return {
      overflow: $('#optOverflow').checked,
      massiveStacksBig: $('#optMassiveStacks').checked,
      frogurtOneIn: parseFloat($('#optFrogurt').value) || D.BASE_POOL,
      seed: $('#optSeed').value.trim()
    };
  }

  function currentConfig() {
    return Sim.buildConfig(readStats(), readOptions());
  }

  /* ======================================================= JSON paste ==== */

  function parseJsonInput() {
    var status = $('#parseStatus');
    var text = $('#jsonInput').value.trim();
    if (!text) return setStatus(status, 'err', 'Paste your exported stats first.');

    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return setStatus(status, 'err', 'That is not valid JSON — copy the whole export, braces included.');
    }

    var stats = (data && data.stats) || data;
    if (!stats || typeof stats !== 'object') {
      return setStatus(status, 'err', 'No stats object found in that JSON.');
    }

    var found = 0;
    var picked = {};
    D.STAT_DEFS.forEach(function (def) {
      var v = stats[def.key];
      if (typeof v === 'number' && isFinite(v)) {
        picked[def.key] = v;
        found++;
      }
    });

    if (!found) {
      return setStatus(status, 'err', 'Found no lootfrog_* stats in that JSON.');
    }

    writeStats(picked);
    onStatsChanged();
    setStatus(status, 'ok', 'Loaded ' + found + ' of ' + D.STAT_DEFS.length + ' lootfrog stats.' +
      (found < D.STAT_DEFS.length ? ' The rest fall back to their base values.' : ''));
  }

  function setStatus(el, kind, msg) {
    el.className = 'parse-status ' + kind;
    el.textContent = msg;
  }

  var EXAMPLE_STATS = {
    lootfrog_capacity: 19,
    lootfrog_loot_multi: 4.2028105257551394,
    lootfrog_golden_chance: 12.651906638134399,
    lootfrog_golden_multi: 5.81015,
    lootfrog_triple_spawn_chance: 16.55,
    lootfrog_10x_spawn_chance: 1.25,
    lootfrog_big_chance: 4.93,
    lootfrog_big_multi: 8.259064,
    lootfrog_massive_chance: 0,
    lootfrog_massive_multi: 3
  };

  /* ================================================ summary + persist ==== */

  function onStatsChanged() {
    var cfg = currentConfig();
    renderStatsSummary(cfg);
    renderLaunchNote(cfg);
    renderOdds(cfg);
    persist();
  }

  function renderStatsSummary(cfg) {
    $('#statsSummary').innerHTML =
      '<span><b>' + cfg.capacity + '</b> capacity</span>' +
      '<span><b>' + fmtMult(cfg.lootMulti) + '</b> loot</span>' +
      '<span><b>' + fmtPct(cfg.goldenChance) + '</b> golden</span>' +
      '<span><b>' + fmtPct(cfg.bigChance) + '</b> big</span>';
  }

  function renderLaunchNote(cfg) {
    var uses = spawnCountValue();
    var perUse = An.expectedFrogsPerUse(cfg);
    var note = 'Each Frogspawn fills the screen to <b>' + cfg.capacity + '</b> lootfrog' +
      (cfg.capacity === 1 ? '' : 's') +
      (cfg.overflow && perUse > cfg.capacity + 1e-9
        ? ' — about <b>' + fmtNum(perUse) + '</b> on average once multi-spawn overflow is counted'
        : '') + '. ';
    note += 'Using <b>' + fmtInt(uses) + '</b> means roughly <b>' + fmtInt(uses * perUse) + '</b> frogs.';
    if (uses * perUse > RENDER_CAP) {
      note += ' Only the first ' + RENDER_CAP + ' are drawn; totals still count every frog.';
    }
    $('#launchNote').innerHTML = note;
  }

  function persist() {
    try {
      localStorage.setItem(STORE.stats, JSON.stringify(readStats()));
      localStorage.setItem(STORE.options, JSON.stringify(readOptions()));
    } catch (err) { /* private mode — run without persistence */ }
  }

  function restore() {
    try {
      var stats = JSON.parse(localStorage.getItem(STORE.stats) || 'null');
      if (stats) writeStats(stats);

      var opts = JSON.parse(localStorage.getItem(STORE.options) || 'null');
      if (opts) {
        $('#optOverflow').checked = opts.overflow !== false;
        $('#optMassiveStacks').checked = opts.massiveStacksBig !== false;
        if (opts.frogurtOneIn) $('#optFrogurt').value = opts.frogurtOneIn;
        if (opts.seed) $('#optSeed').value = opts.seed;
      }

      var vault = JSON.parse(localStorage.getItem(STORE.vault) || 'null');
      if (vault && vault.runs) state.vault = vault;

      state.sound = localStorage.getItem(STORE.sound) === '1';
    } catch (err) { /* ignore corrupt storage */ }
  }

  function saveVault() {
    try {
      localStorage.setItem(STORE.vault, JSON.stringify(state.vault));
    } catch (err) { /* over quota — keep the in-memory vault */ }
  }

  /* ======================================================= the show ===== */

  var rolling = [];          // cards mid-spin
  var tickerRunning = false;
  var lastBlip = 0;
  var jackpotQueue = [];
  var jackpotBusy = false;

  function spawnCountValue() {
    var n = parseInt($('#spawnCount').value, 10);
    if (!isFinite(n) || n < 1) n = 1;
    return Math.min(n, 1000);
  }

  function updateSpawnButton() {
    var n = spawnCountValue();
    $('#spawnBtnLabel').textContent = 'Use ' + fmtInt(n) + ' Frogspawn';
  }

  function runSimulation() {
    if (state.animating) return;

    var cfg = currentConfig();
    var opts = readOptions();
    var rng = Sim.makeRng(opts.seed === '' ? null : opts.seed);
    var uses = spawnCountValue();

    state.currentRun = Sim.simulateRun(cfg, uses, rng);
    state.saved = false;

    $('#simEmpty').hidden = true;
    $('#runArea').hidden = false;
    $('#saveBtn').disabled = true;
    $('#runTotals').hidden = true;

    renderRunStats(state.currentRun);
    playRun(state.currentRun);
  }

  function renderRunStats(run) {
    var t = run.byType;
    var golden = t.basic_gold + t.big_gold + t.massive_gold;
    var big = t.big + t.big_gold;
    var massive = t.massive + t.massive_gold;

    var tiles = [
      { k: 'Frogspawn used', v: fmtInt(run.uses), cls: '' },
      { k: 'Lootfrogs', v: fmtInt(run.frogCount), cls: 'frog' },
      { k: 'Golden', v: fmtInt(golden), cls: 'gold' },
      { k: 'Big', v: fmtInt(big), cls: 'big' },
      { k: 'Massive', v: fmtInt(massive), cls: 'massive' }
    ];

    $('#runStats').innerHTML = tiles.map(function (tile) {
      return '<div class="stat-tile ' + tile.cls + '"><div class="k">' + tile.k + '</div>' +
        '<div class="v">' + tile.v + '</div></div>';
    }).join('');
  }

  function playRun(run) {
    var grid = $('#frogGrid');
    grid.innerHTML = '';
    rolling.length = 0;

    var list = run.frogs.slice(0, RENDER_CAP);
    var animated = list.length <= ANIMATE_CAP;

    state.animating = true;
    state.abort = false;
    $('#skipBtn').hidden = false;
    $('#spawnBtn').disabled = true;
    $('#spawnBtn').classList.add('is-busy');

    var i = 0;
    var stepDelay = animated ? 85 : Math.max(10, Math.round(1100 / list.length));
    var chunkSize = animated ? 1 : Math.max(1, Math.ceil(list.length / 45));

    function step() {
      if (state.abort) {
        while (i < list.length) grid.appendChild(makeFrogCard(list[i++], false));
        flushRolling();
        return finish();
      }
      for (var c = 0; c < chunkSize && i < list.length; c++) {
        grid.appendChild(makeFrogCard(list[i++], animated));
      }
      updateProgress(i, run, false);
      if (i < list.length) {
        state.timer = setTimeout(step, stepDelay);
      } else {
        finish();
      }
    }

    /* The run isn't really over until the last card stops spinning — hold
       the totals and the save button back so nothing spoils the reveal. */
    function finish() {
      clearTimeout(state.timer);
      if (rolling.length) {
        state.timer = setTimeout(finish, 60);
        return;
      }
      state.animating = false;
      state.abort = false;
      $('#skipBtn').hidden = true;
      $('#spawnBtn').disabled = false;
      $('#spawnBtn').classList.remove('is-busy');
      $('#saveBtn').disabled = false;
      updateProgress(list.length, run, true);
      renderRunTotals(run);
    }

    step();
  }

  /* Skip: land every spinning card at once, no flourish. */
  function flushRolling() {
    rolling.forEach(function (item) { settleCard(item.el, item.frog, false); });
    rolling.length = 0;
  }

  function updateProgress(shown, run, done) {
    var pill = $('#frogProgress');
    if (!done) {
      pill.textContent = fmtInt(shown) + ' / ' + fmtInt(run.frogCount);
    } else if (shown < run.frogCount) {
      pill.textContent = fmtInt(shown) + ' shown of ' + fmtInt(run.frogCount) + ' frogs';
    } else {
      pill.textContent = fmtInt(run.frogCount) + ' frogs';
    }
  }

  function makeFrogCard(frog, animated) {
    var card = document.createElement('div');
    card.className = 'frog-card';
    card.dataset.size = frog.size;
    card.dataset.golden = String(frog.golden);
    card.dataset.tier = frog.reward.tier;

    var name = (frog.golden ? 'Golden ' : '') + D.SIZE_LABEL[frog.size];
    card.innerHTML =
      '<span class="mult-chip">' + fmtMult(frog.multiplier) + '</span>' +
      '<span class="frog-tag">' + name + '</span>' +
      '<div class="reward-icon-wrap"></div>' +
      '<div class="qty">0</div>' +
      '<span class="reward-name"></span>' +
      (frog.capped ? '<span class="cap-chip">CAPPED</span>' : '');

    card.title = name + ' • ' + frog.reward.label + ' • base ' + frog.base + ' ' + fmtMult(frog.multiplier);

    if (animated) {
      card.classList.add('is-rolling');
      card.querySelector('.reward-icon-wrap').appendChild(makeIcon(randomResource(), 'reward-icon'));
      rolling.push({
        el: card,
        frog: frog,
        settleAt: performance.now() + 260 + Math.random() * 220,
        nextSwap: 0
      });
      startTicker();
    } else {
      settleCard(card, frog, false);
    }
    return card;
  }

  function randomResource() {
    return D.RESOURCE_ORDER[Math.floor(Math.random() * D.RESOURCE_ORDER.length)];
  }

  function settleCard(card, frog, withFlourish) {
    var wrap = card.querySelector('.reward-icon-wrap');
    wrap.innerHTML = '';
    wrap.appendChild(makeIcon(frog.reward.res, 'reward-icon'));
    card.querySelector('.reward-name').textContent = D.RESOURCES[frog.reward.res].name;
    card.classList.remove('is-rolling');

    var qtyEl = card.querySelector('.qty');
    if (withFlourish) {
      card.classList.add('just-landed');
      setTimeout(function () { card.classList.remove('just-landed'); }, 500);
      countUp(qtyEl, frog.qty);
      blip(frog.reward.tier);
      if (frog.reward.tier === 'legendary') {
        queueJackpot(D.RESOURCES[frog.reward.res].name.toUpperCase() + ' ×' + frog.qty + '!');
      }
    } else {
      qtyEl.textContent = fmtInt(frog.qty);
    }
  }

  function countUp(el, target) {
    var start = performance.now();
    var dur = 380;
    function frame(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmtInt(target * eased);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = fmtInt(target);
    }
    requestAnimationFrame(frame);
  }

  function startTicker() {
    if (tickerRunning) return;
    tickerRunning = true;
    requestAnimationFrame(tick);
  }

  function tick(now) {
    for (var i = rolling.length - 1; i >= 0; i--) {
      var item = rolling[i];
      if (now >= item.settleAt) {
        settleCard(item.el, item.frog, true);
        rolling.splice(i, 1);
      } else if (now >= item.nextSwap) {
        item.nextSwap = now + 80;
        var wrap = item.el.querySelector('.reward-icon-wrap');
        wrap.innerHTML = '';
        wrap.appendChild(makeIcon(randomResource(), 'reward-icon'));
      }
    }
    if (rolling.length) requestAnimationFrame(tick);
    else tickerRunning = false;
  }

  /* ------------------------------------------------------- jackpot ----- */

  function queueJackpot(text) {
    if (jackpotQueue.length > 2) return;
    jackpotQueue.push(text);
    drainJackpot();
  }

  function drainJackpot() {
    if (jackpotBusy || !jackpotQueue.length) return;
    jackpotBusy = true;
    var el = $('#jackpot');
    $('#jackpotText').textContent = '🎉 ' + jackpotQueue.shift();
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
    chime();
    setTimeout(function () {
      el.classList.remove('show');
      jackpotBusy = false;
      drainJackpot();
    }, 1550);
  }

  /* --------------------------------------------------------- sound ----- */

  var audioCtx = null;

  function ctx() {
    if (!audioCtx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type, gain) {
    var ac = ctx();
    if (!ac) return;
    var osc = ac.createOscillator();
    var vol = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain || 0.05, ac.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(vol).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  }

  var TIER_NOTE = { common: 420, uncommon: 520, rare: 640, epic: 780, legendary: 960 };

  function blip(tier) {
    if (!state.sound) return;
    var now = performance.now();
    if (now - lastBlip < 55) return;
    lastBlip = now;
    tone(TIER_NOTE[tier] || 440, 0.09, 'triangle', 0.04);
  }

  function chime() {
    if (!state.sound) return;
    [784, 988, 1319].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.22, 'sine', 0.06); }, i * 90);
    });
  }

  /* ==================================================== totals views ==== */

  function totalsGrid(container, totals, opts) {
    opts = opts || {};
    container.innerHTML = '';
    D.RESOURCE_ORDER.forEach(function (resId) {
      var res = D.RESOURCES[resId];
      var value = totals[resId] || 0;
      if (opts.hideZero && !value) return;

      var chip = document.createElement('div');
      chip.className = 'total-chip' + (value ? '' : ' is-zero');
      chip.appendChild(makeIcon(resId, 'chip-icon'));
      var text = document.createElement('div');
      text.innerHTML = '<span class="t-name">' + res.name + '</span>' +
        '<span class="t-val">' + (opts.decimals ? fmtNum(value) : fmtInt(value)) + '</span>';
      chip.appendChild(text);
      chip.title = res.name + ': ' + (opts.decimals ? value.toFixed(4) : Math.round(value).toLocaleString('en-US'));
      container.appendChild(chip);
    });
  }

  function renderRunTotals(run) {
    $('#runTotals').hidden = false;
    totalsGrid($('#runTotalsGrid'), run.totals, {});
  }

  /* ========================================================== vault ===== */

  function saveCurrentRun() {
    if (!state.currentRun || state.saved) return;
    var run = state.currentRun;
    var v = state.vault;

    v.seq += 1;
    v.uses += run.uses;
    v.frogs += run.frogCount;

    Object.keys(run.totals).forEach(function (res) {
      v.totals[res] = (v.totals[res] || 0) + run.totals[res];
    });
    Object.keys(run.byType).forEach(function (type) {
      v.byType[type] = (v.byType[type] || 0) + run.byType[type];
    });

    v.runs.unshift({
      id: v.seq,
      at: Date.now(),
      uses: run.uses,
      frogs: run.frogCount,
      totals: run.totals,
      byType: run.byType
    });
    if (v.runs.length > 200) v.runs.length = 200;

    state.saved = true;
    $('#saveBtn').disabled = true;
    saveVault();
    renderVault();
    bumpVaultBadge();
  }

  function bumpVaultBadge() {
    var badge = $('#vaultBadge');
    badge.hidden = false;
    badge.textContent = state.vault.runs.length;
  }

  function renderVault() {
    var v = state.vault;
    var hasRuns = v.runs.length > 0;

    $('#vaultMeta').innerHTML = hasRuns
      ? '<b>' + fmtInt(v.uses) + '</b> Frogspawn used across <b>' + fmtInt(v.runs.length) +
        '</b> saved run' + (v.runs.length === 1 ? '' : 's') + ', hatching <b>' + fmtInt(v.frogs) + '</b> lootfrogs.' +
        frogspawnLedger(v)
      : 'Nothing saved yet. Run a simulation and hit <b>Save results</b>.';

    totalsGrid($('#vaultTotals'), v.totals, {});

    $('#vaultTypes').innerHTML = D.FROG_TYPES.map(function (t) {
      return '<span class="tally-chip" data-size="' + t.size + '" data-golden="' + t.golden + '">' +
        t.label + ' <b>' + fmtInt(v.byType[t.key] || 0) + '</b></span>';
    }).join('');

    var tbody = $('#vaultRuns tbody');
    tbody.innerHTML = '';
    v.runs.forEach(function (run) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>#' + run.id + '</td>' +
        '<td class="muted">' + new Date(run.at).toLocaleString() + '</td>' +
        '<td>' + fmtInt(run.uses) + '</td>' +
        '<td>' + fmtInt(run.frogs) + '</td>' +
        '<td>' + highlights(run.totals) + '</td>' +
        '<td><button type="button" class="ghost-btn small" data-remove="' + run.id + '">Remove</button></td>';
      tbody.appendChild(tr);
    });

    if (hasRuns) bumpVaultBadge();
    else $('#vaultBadge').hidden = true;
  }

  /* Did the run pay for the Frogspawn it burned? */
  function frogspawnLedger(v) {
    var gained = v.totals.frogspawn || 0;
    var net = gained - v.uses;
    var word = net >= 0 ? 'up' : 'down';
    return ' Frogspawn found: <b>' + fmtInt(gained) + '</b> — net ' + word + ' <b>' +
      fmtInt(Math.abs(net)) + '</b>.';
  }

  function highlights(totals) {
    var parts = [];
    ['frogspawn', 'lantern', 'frogurt', 'skill'].forEach(function (res) {
      if (totals[res]) parts.push(fmtInt(totals[res]) + '× ' + D.RESOURCES[res].name);
    });
    return parts.length ? parts.join(', ') : '<span class="muted">—</span>';
  }

  function removeRun(id) {
    var v = state.vault;
    var idx = -1;
    for (var i = 0; i < v.runs.length; i++) {
      if (v.runs[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;

    var run = v.runs[idx];
    v.runs.splice(idx, 1);
    v.uses -= run.uses;
    v.frogs -= run.frogs;
    Object.keys(run.totals).forEach(function (res) {
      v.totals[res] = Math.max(0, (v.totals[res] || 0) - run.totals[res]);
    });
    Object.keys(run.byType).forEach(function (type) {
      v.byType[type] = Math.max(0, (v.byType[type] || 0) - run.byType[type]);
    });
    saveVault();
    renderVault();
  }

  function exportVaultCsv() {
    var v = state.vault;
    if (!v.runs.length) return;

    var cols = ['run', 'timestamp', 'frogspawn_used', 'frogs'].concat(D.RESOURCE_ORDER);
    var lines = [cols.join(',')];

    v.runs.slice().reverse().forEach(function (run) {
      var row = [run.id, new Date(run.at).toISOString(), run.uses, run.frogs];
      D.RESOURCE_ORDER.forEach(function (res) { row.push(run.totals[res] || 0); });
      lines.push(row.join(','));
    });

    var totalRow = ['TOTAL', '', v.uses, v.frogs];
    D.RESOURCE_ORDER.forEach(function (res) { totalRow.push(v.totals[res] || 0); });
    lines.push(totalRow.join(','));

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'frogspawn-totals.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* =========================================================== odds ===== */

  var selectedType = 'basic';

  function renderOdds(cfg) {
    var s = An.summary(cfg);
    renderKpis(cfg, s);
    renderTypeTable(cfg, s);
    totalsGrid($('#oddsYield'), s.perUse, { decimals: true });
    renderTypePicker(s);
    renderRewardTable(s);
  }

  function renderKpis(cfg, s) {
    var net = s.netFrogspawn;
    var kpis = [
      {
        k: 'Lootfrogs per Frogspawn', v: fmtNum(s.frogsPerUse), cls: 'good',
        sub: 'capacity ' + cfg.capacity + (cfg.overflow ? ', with overflow' : ', hard capped')
      },
      {
        k: 'Frogspawn returned', v: fmtNum(s.frogspawnReturned),
        cls: net >= 0 ? 'good' : 'bad',
        sub: net >= 0 ? 'self-sustaining (+' + fmtNum(net) + ' per use)' : 'net ' + fmtNum(net) + ' per use'
      },
      {
        k: 'Chance of any Frogspawn', v: fmtPct(s.pAnyFrogspawn), cls: 'warn',
        sub: 'at least one per Frogspawn used'
      },
      {
        k: 'Chance of any Lantern', v: fmtPct(s.pAnyLantern), cls: 'warn',
        sub: 'at least one per Frogspawn used'
      },
      {
        k: 'Gems per Frogspawn', v: fmtNum(s.perUse.gems), cls: '',
        sub: fmtNum(s.perFrog.gems) + ' per frog'
      },
      {
        k: 'Average spawn group', v: fmtNum(s.expectedGroupSize), cls: '',
        sub: fmtPct(cfg.tenxChance) + ' 10x · ' + fmtPct((1 - cfg.tenxChance) * cfg.tripleChance) + ' triple'
      }
    ];

    $('#oddsKpis').innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="k">' + k.k + '</div>' +
        '<div class="v">' + k.v + '</div><div class="sub">' + k.sub + '</div></div>';
    }).join('');
  }

  function renderTypeTable(cfg, s) {
    var tbody = $('#typeTable tbody');
    tbody.innerHTML = '';
    s.types.forEach(function (t) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + t.label + '</td>' +
        '<td>' + fmtPct(t.p) + '</td>' +
        '<td class="muted">' + (t.p > 0 ? fmtOneIn(1 / t.p) : '—') + '</td>' +
        '<td>' + fmtMult(t.multiplier) + '</td>' +
        '<td>' + fmtNum(t.p * s.frogsPerUse) + '</td>';
      tbody.appendChild(tr);
    });
  }

  function renderTypePicker(s) {
    var picker = $('#typePicker');
    picker.innerHTML = '';
    s.types.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'type-btn' + (t.key === selectedType ? ' is-active' : '');
      btn.textContent = t.label + ' (' + fmtMult(t.multiplier) + ')';
      btn.dataset.type = t.key;
      picker.appendChild(btn);
    });
  }

  function renderRewardTable(s) {
    var block = null;
    for (var i = 0; i < s.matrix.length; i++) {
      if (s.matrix[i].type.key === selectedType) { block = s.matrix[i]; break; }
    }
    if (!block) block = s.matrix[0];

    var tbody = $('#rewardTable tbody');
    tbody.innerHTML = '';

    block.rows.forEach(function (row) {
      var r = row.reward;
      var range = r.min === r.max ? String(r.min) : r.min + '–' + r.max;
      var after = row.min === row.max ? fmtInt(row.min) : fmtInt(row.min) + '–' + fmtInt(row.max);
      var capNote = row.cap !== null
        ? ' <span class="capped" title="Capped at ' + row.cap + '">⛔ ' + row.cap + '</span>'
        : '';

      var tr = document.createElement('tr');
      tr.dataset.tier = r.tier;
      var cell = document.createElement('td');
      cell.className = 'name-cell';
      cell.appendChild(makeIcon(r.res, 'row-icon'));
      var span = document.createElement('span');
      span.textContent = r.label;
      cell.appendChild(span);

      tr.appendChild(cell);
      tr.insertAdjacentHTML('beforeend',
        '<td>' + fmtPct(row.p) + '</td>' +
        '<td class="muted">' + fmtOneIn(row.oneIn) + '</td>' +
        '<td class="muted">' + range + '</td>' +
        '<td>' + after + capNote + '</td>' +
        '<td>' + fmtNum(row.mean) + '</td>' +
        '<td class="muted">' + fmtNum(row.expectedPerFrog) + '</td>');
      tbody.appendChild(tr);
    });
  }

  /* ============================================================ wire ==== */

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (btn) {
      var on = btn.dataset.tab === name;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.id === 'tab-' + name);
    });
  }

  function wire() {
    /* stat inputs */
    var debounce = null;
    $('#statGrid').addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(onStatsChanged, 150);
    });

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.mode-btn').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        $('#modeManual').classList.toggle('is-active', btn.dataset.mode === 'manual');
        $('#modeJson').classList.toggle('is-active', btn.dataset.mode === 'json');
      });
    });

    $('#statsToggle').addEventListener('click', function () {
      var card = $('#statsCard');
      var collapsed = card.classList.toggle('is-collapsed');
      this.setAttribute('aria-expanded', String(!collapsed));
    });

    $('#jsonParse').addEventListener('click', parseJsonInput);
    $('#jsonExample').addEventListener('click', function () {
      $('#jsonInput').value = JSON.stringify({ version: 'v2.2.6', stats: EXAMPLE_STATS }, null, 2);
      parseJsonInput();
    });

    ['#optOverflow', '#optMassiveStacks', '#optFrogurt', '#optSeed'].forEach(function (sel) {
      $(sel).addEventListener('input', onStatsChanged);
      $(sel).addEventListener('change', onStatsChanged);
    });

    /* simulator */
    $('#spawnCount').addEventListener('input', function () {
      updateSpawnButton();
      renderLaunchNote(currentConfig());
    });
    $('#spawnBtn').addEventListener('click', runSimulation);
    $('#skipBtn').addEventListener('click', function () { state.abort = true; });
    $('#saveBtn').addEventListener('click', saveCurrentRun);
    $('#clearRunBtn').addEventListener('click', function () {
      clearTimeout(state.timer);
      rolling.length = 0;
      state.animating = false;
      state.abort = false;
      state.currentRun = null;
      $('#skipBtn').hidden = true;
      $('#spawnBtn').disabled = false;
      $('#spawnBtn').classList.remove('is-busy');
      $('#runArea').hidden = true;
      $('#simEmpty').hidden = false;
      $('#frogGrid').innerHTML = '';
    });

    /* tabs */
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    /* vault */
    $('#vaultRuns').addEventListener('click', function (e) {
      var id = e.target && e.target.dataset && e.target.dataset.remove;
      if (id) removeRun(parseInt(id, 10));
    });
    $('#clearVault').addEventListener('click', function () {
      if (!state.vault.runs.length) return;
      if (!confirm('Clear every saved run and total?')) return;
      state.vault = emptyVault();
      saveVault();
      renderVault();
    });
    $('#exportVault').addEventListener('click', exportVaultCsv);

    /* odds type picker */
    $('#typePicker').addEventListener('click', function (e) {
      var type = e.target && e.target.dataset && e.target.dataset.type;
      if (!type) return;
      selectedType = type;
      renderOdds(currentConfig());
    });

    /* sound */
    $('#soundToggle').addEventListener('click', function () {
      state.sound = !state.sound;
      this.setAttribute('aria-pressed', String(state.sound));
      var slot = this.querySelector('.icon-slot');
      slot.textContent = state.sound ? slot.dataset.on : slot.dataset.off;
      try { localStorage.setItem(STORE.sound, state.sound ? '1' : '0'); } catch (err) { /* noop */ }
      if (state.sound) tone(660, 0.12, 'sine', 0.05);
    });
  }

  /* ============================================================ boot ==== */

  function init() {
    buildStatGrid();
    guardStaticIcons();
    restore();
    wire();

    if (state.sound) {
      var toggle = $('#soundToggle');
      toggle.setAttribute('aria-pressed', 'true');
      var slot = toggle.querySelector('.icon-slot');
      slot.textContent = slot.dataset.on;
    }

    updateSpawnButton();
    onStatsChanged();
    renderVault();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
