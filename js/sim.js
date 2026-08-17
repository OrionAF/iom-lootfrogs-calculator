/* =========================================================================
   sim.js — the model. Config building, RNG and the Frogspawn simulation.

   Spawn model
   -----------
   Think of it as one column per base spawn. A Frogspawn opens exactly
   Lootfrog Capacity columns, and each column resolves three rows:

     row 1  the base Lootfrog                        +1  (always)
     row 2  the 10x roll        hit +9, miss +0
     row 3  the Triple roll     hit +2, miss +0

   Rows 2 and 3 are INDEPENDENT, so one column can win both and yield
   1 + 9 + 2 = 12 frogs. Column sizes are therefore 1, 3, 10 or 12.

   Extras never open a column of their own: they do not consume capacity
   and they never roll for a multi-spawn, so nothing cascades. Capacity 19
   with four Triples is 19 + 4*2 = 27 frogs.

   The columns are then tipped into one bowl, and every frog in it rolls
   independently for Golden, and for Big -> Massive, and pulls its own
   reward. Nothing there depends on which column a frog came from.
   ========================================================================= */
(function (global) {
  'use strict';

  var D = global.LFData;

  /* ---------------------------------------------------------------- RNG -- */

  /* mulberry32 — small, fast, seedable, good enough for loot rolls. */
  function makeRng(seed) {
    if (seed === null || seed === undefined || seed === '') {
      return Math.random;
    }
    var a = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  /* ------------------------------------------------------------- config -- */

  function num(value, fallback) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n) || n <= 0) return fallback;
    return n;
  }

  /* Percent stats: blank/negative -> 0, and a binary roll can't beat 100%. */
  function pct(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(n, 100) / 100;
  }

  /**
   * Turn raw stat values into everything the simulator and the odds tab need.
   * @param {Object} stats  keyed by the game's JSON stat names
   * @param {Object} [opts] { frogurtOneIn, seed }
   */
  function buildConfig(stats, opts) {
    stats = stats || {};
    opts = opts || {};

    var capacity = Math.max(1, Math.floor(num(stats.lootfrog_capacity, 1)));
    var cfg = {
      capacity: capacity,
      lootMulti: num(stats.lootfrog_loot_multi, 1),
      goldenChance: pct(stats.lootfrog_golden_chance),
      goldenMulti: num(stats.lootfrog_golden_multi, 2),
      tripleChance: pct(stats.lootfrog_triple_spawn_chance),
      tenxChance: pct(stats.lootfrog_10x_spawn_chance),
      bigChance: pct(stats.lootfrog_big_chance),
      bigMulti: num(stats.lootfrog_big_multi, 5),
      massiveChance: pct(stats.lootfrog_massive_chance),
      massiveMulti: num(stats.lootfrog_massive_multi, 3),
      frogurtOneIn: Math.max(1, num(opts.frogurtOneIn, D.BASE_POOL))
    };

    cfg.rewards = buildRewardPool(cfg.frogurtOneIn);
    cfg.totalWeight = cfg.rewards.reduce(function (sum, r) { return sum + r.weight; }, 0);
    return cfg;
  }

  /* Frogurt's listed rarity is "1/?" — model it as weight 196/N alongside
     the known 196-weight pool, so "1 in 196" adds exactly one weight. */
  function buildRewardPool(oneIn) {
    return D.REWARDS.map(function (r) {
      if (!r.frogurt) return r;
      var clone = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) clone[k] = r[k];
      clone.weight = D.BASE_POOL / oneIn;
      return clone;
    });
  }

  /* -------------------------------------------------------------- frogs -- */

  function frogMultiplier(cfg, size, golden) {
    var m = cfg.lootMulti;
    if (size === 'massive') {
      /* Massive spawns out of Big, so it carries both multipliers. */
      m *= cfg.massiveMulti;
      m *= cfg.bigMulti;
    } else if (size === 'big') {
      m *= cfg.bigMulti;
    }
    if (golden) m *= cfg.goldenMulti;
    return m;
  }

  function frogTypeKey(size, golden) {
    return golden ? size + '_gold' : size;
  }

  function rollFrog(cfg, rng) {
    var size = 'basic';
    if (rng() < cfg.bigChance) {
      size = rng() < cfg.massiveChance ? 'massive' : 'big';
    }
    var golden = rng() < cfg.goldenChance;
    return {
      size: size,
      golden: golden,
      type: frogTypeKey(size, golden),
      multiplier: frogMultiplier(cfg, size, golden),
      /* Which of the 66 portraits this frog wears. Purely cosmetic, but it
         comes off the seeded stream so a replay looks identical too. */
      art: randInt(rng, 0, D.FROG_ART.length - 1)
    };
  }

  /* Frogs from one column: the base frog, plus two independent multi-spawn
     rolls. Both can hit, so the result is 1, 3, 10 or 12. Extras never
     re-roll, so this runs exactly once per column. */
  function rollGroupSize(cfg, rng) {
    var size = 1;
    if (rng() < cfg.tenxChance) size += 9;
    if (rng() < cfg.tripleChance) size += 2;
    return size;
  }

  /* --------------------------------------------------------------- loot -- */

  function pickReward(cfg, rng) {
    var roll = rng() * cfg.totalWeight;
    for (var i = 0; i < cfg.rewards.length; i++) {
      roll -= cfg.rewards[i].weight;
      if (roll < 0) return cfg.rewards[i];
    }
    return cfg.rewards[cfg.rewards.length - 1];
  }

  /**
   * Final quantity: uniform base roll, scaled by the frog's multiplier,
   * floored, never below 1, then clamped by the per-size cap if one exists.
   */
  function applyMultiplier(reward, multiplier, size, base) {
    var qty = Math.floor(base * multiplier);
    if (qty < 1) qty = 1;
    if (reward.caps) qty = Math.min(qty, reward.caps[size]);
    return qty;
  }

  function rollLoot(cfg, frog, rng) {
    var reward = pickReward(cfg, rng);
    var base = randInt(rng, reward.min, reward.max);
    return {
      reward: reward,
      base: base,
      qty: applyMultiplier(reward, frog.multiplier, frog.size, base),
      capped: !!(reward.caps && Math.floor(base * frog.multiplier) > reward.caps[frog.size])
    };
  }

  /* ---------------------------------------------------------------- run -- */

  /**
   * One Frogspawn: open `capacity` columns, resolve each, tip them all into
   * the same bowl. Capacity counts columns, not frogs — extras ride on top
   * of it, which is why a 19-capacity Frogspawn can hand you 27 frogs.
   */
  function simulateUse(cfg, rng, useIndex) {
    var frogs = [];

    for (var column = 0; column < cfg.capacity; column++) {
      var size = rollGroupSize(cfg, rng);
      for (var i = 0; i < size; i++) {
        var frog = rollFrog(cfg, rng);
        var loot = rollLoot(cfg, frog, rng);
        frogs.push({
          use: useIndex,
          index: frogs.length,
          groupSize: size,
          size: frog.size,
          golden: frog.golden,
          type: frog.type,
          multiplier: frog.multiplier,
          art: frog.art,
          reward: loot.reward,
          base: loot.base,
          qty: loot.qty,
          capped: loot.capped
        });
      }
    }
    return frogs;
  }

  /** @returns {{frogs, totals, byType, byReward, frogCount, uses, cfg}} */
  function simulateRun(cfg, uses, rng) {
    rng = rng || Math.random;
    var frogs = [];
    for (var u = 0; u < uses; u++) {
      frogs = frogs.concat(simulateUse(cfg, rng, u));
    }
    return summarise(frogs, uses, cfg);
  }

  function summarise(frogs, uses, cfg) {
    var totals = {};
    var byType = {};
    var byReward = {};

    D.FROG_TYPES.forEach(function (t) { byType[t.key] = 0; });

    frogs.forEach(function (f) {
      totals[f.reward.res] = (totals[f.reward.res] || 0) + f.qty;
      byType[f.type] = (byType[f.type] || 0) + 1;
      byReward[f.reward.id] = (byReward[f.reward.id] || 0) + 1;
    });

    return {
      frogs: frogs,
      frogCount: frogs.length,
      uses: uses,
      totals: totals,
      byType: byType,
      byReward: byReward,
      cfg: cfg
    };
  }

  global.LFSim = {
    makeRng: makeRng,
    randInt: randInt,
    buildConfig: buildConfig,
    buildRewardPool: buildRewardPool,
    frogMultiplier: frogMultiplier,
    frogTypeKey: frogTypeKey,
    rollFrog: rollFrog,
    rollGroupSize: rollGroupSize,
    pickReward: pickReward,
    applyMultiplier: applyMultiplier,
    simulateUse: simulateUse,
    simulateRun: simulateRun
  };
})(window);
