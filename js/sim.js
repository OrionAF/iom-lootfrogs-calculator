/* =========================================================================
   sim.js — the model. Config building, RNG and the Frogspawn simulation.

   Spawn model
   -----------
   A Frogspawn fills the screen to Lootfrog Capacity. Frogs arrive in spawn
   groups: each group rolls 10x first, then triple, otherwise a single frog.
   Group size is decided BEFORE any size roll, so a Big/Massive frog can
   never itself multi-spawn. Every frog in the group then independently
   rolls Big -> Massive and Golden.

   The last group always spawns in full, so a lucky 10x at the end can push
   you past capacity.
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
      multiplier: frogMultiplier(cfg, size, golden)
    };
  }

  /* Group size for one spawn: 10x is rolled first, then triple. */
  function rollGroupSize(cfg, rng) {
    if (rng() < cfg.tenxChance) return 10;
    if (rng() < cfg.tripleChance) return 3;
    return 1;
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

  /** One Frogspawn: spawn groups until capacity is filled. */
  function simulateUse(cfg, rng, useIndex) {
    var frogs = [];
    var spawned = 0;
    var guard = 0;

    while (spawned < cfg.capacity && guard++ < 100000) {
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
          reward: loot.reward,
          base: loot.base,
          qty: loot.qty,
          capped: loot.capped
        });
      }
      spawned += size;
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
