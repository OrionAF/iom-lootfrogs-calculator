/* =========================================================================
   analytics.js — exact probability maths for the Probabilities tab.
   Everything here is closed-form or exhaustive enumeration, no sampling.
   ========================================================================= */
(function (global) {
  'use strict';

  var D = global.LFData;
  var Sim = global.LFSim;

  /* ------------------------------------------------- frog type spectrum -- */

  /**
   * Probability of each of the six frog varieties for a single spawned frog.
   * Size: P(big) then P(massive | big). Golden is rolled independently.
   */
  function frogTypeDistribution(cfg) {
    var pBig = cfg.bigChance;
    var pMassiveGivenBig = cfg.massiveChance;
    var sizeP = {
      basic: 1 - pBig,
      big: pBig * (1 - pMassiveGivenBig),
      massive: pBig * pMassiveGivenBig
    };
    var g = cfg.goldenChance;

    return D.FROG_TYPES.map(function (t) {
      return {
        key: t.key,
        label: t.label,
        short: t.short,
        size: t.size,
        golden: t.golden,
        p: sizeP[t.size] * (t.golden ? g : 1 - g),
        multiplier: Sim.frogMultiplier(cfg, t.size, t.golden)
      };
    });
  }

  /* ------------------------------------------------- frogs per Frogspawn -- */

  /**
   * Frogs produced by one column. The 10x and Triple rolls are independent,
   * so all four combinations exist and the mean is 1 + 9*p10 + 2*p3.
   */
  function groupSizeDistribution(cfg) {
    var p10 = cfg.tenxChance;
    var p3 = cfg.tripleChance;
    return [
      { size: 1, p: (1 - p10) * (1 - p3) },
      { size: 3, p: (1 - p10) * p3 },
      { size: 10, p: p10 * (1 - p3) },
      { size: 12, p: p10 * p3 }
    ].filter(function (g) { return g.p > 0; });
  }

  function expectedGroupSize(cfg) {
    return groupSizeDistribution(cfg).reduce(function (s, g) { return s + g.size * g.p; }, 0);
  }

  /**
   * Expected frogs spawned by one Frogspawn.
   *
   * Capacity is a count of columns, and each one independently yields
   * E[column size] frogs, so the whole thing is just a product — no filling
   * recursion, because extras never occupy a column and never roll for a
   * multi-spawn of their own.
   */
  function expectedFrogsPerUse(cfg) {
    return cfg.capacity * expectedGroupSize(cfg);
  }

  /* ------------------------------------------------------ reward maths -- */

  /**
   * Exhaustive stats for one reward on one frog type: every base value in
   * [min,max] is equally likely, so enumerate and apply floor + cap.
   */
  function quantityStats(reward, multiplier, size, cfg) {
    if (cfg) multiplier = Sim.rewardMultiplier(cfg, reward, multiplier);
    var n = reward.max - reward.min + 1;
    var sum = 0;
    var lo = Infinity;
    var hi = -Infinity;
    var cappedCount = 0;

    for (var base = reward.min; base <= reward.max; base++) {
      var raw = Math.floor(base * multiplier);
      var qty = Sim.applyMultiplier(reward, multiplier, size, base);
      if (reward.caps && raw > reward.caps[size]) cappedCount++;
      sum += qty;
      if (qty < lo) lo = qty;
      if (qty > hi) hi = qty;
    }

    return {
      min: lo,
      max: hi,
      mean: sum / n,
      cappedShare: cappedCount / n,
      cap: reward.caps ? reward.caps[size] : null
    };
  }

  /** Per-reward probability — identical for every frog type, only size varies. */
  function rewardProbabilities(cfg) {
    return cfg.rewards.map(function (r) {
      return {
        reward: r,
        p: r.weight / cfg.totalWeight,
        oneIn: r.weight > 0 ? cfg.totalWeight / r.weight : Infinity
      };
    });
  }

  /**
   * Full matrix: for every frog type, every reward with its probability and
   * post-multiplier quantity stats.
   */
  function rewardMatrix(cfg) {
    var types = frogTypeDistribution(cfg);
    var probs = rewardProbabilities(cfg);

    return types.map(function (type) {
      var rows = probs.map(function (entry) {
        var q = quantityStats(entry.reward, type.multiplier, type.size, cfg);
        return {
          reward: entry.reward,
          p: entry.p,
          oneIn: entry.oneIn,
          min: q.min,
          max: q.max,
          mean: q.mean,
          cap: q.cap,
          cappedShare: q.cappedShare,
          expectedPerFrog: entry.p * q.mean
        };
      });
      return { type: type, rows: rows };
    });
  }

  /* ---------------------------------------------------- expected output -- */

  /**
   * Expected resource yield per frog (averaged over frog types) and per
   * Frogspawn use (scaled by expected frog count).
   */
  function expectedYield(cfg) {
    var matrix = rewardMatrix(cfg);
    var frogsPerUse = expectedFrogsPerUse(cfg);
    var perFrog = {};
    var perUse = {};

    matrix.forEach(function (block) {
      block.rows.forEach(function (row) {
        var res = row.reward.res;
        perFrog[res] = (perFrog[res] || 0) + block.type.p * row.expectedPerFrog;
      });
    });

    D.RESOURCE_ORDER.forEach(function (res) {
      perFrog[res] = perFrog[res] || 0;
      perUse[res] = perFrog[res] * frogsPerUse;
    });

    return { perFrog: perFrog, perUse: perUse, frogsPerUse: frogsPerUse, matrix: matrix };
  }

  /**
   * Headline numbers for the summary cards.
   * `frogspawnReturned` >= 1 means Frogspawn pays for itself on average.
   */
  function summary(cfg) {
    var y = expectedYield(cfg);
    var types = frogTypeDistribution(cfg);
    var probs = rewardProbabilities(cfg);

    var pFrogspawn = 0;
    var pLantern = 0;
    var pFrogurt = 0;
    probs.forEach(function (entry) {
      if (entry.reward.res === 'frogspawn') pFrogspawn += entry.p;
      if (entry.reward.res === 'lantern') pLantern += entry.p;
      if (entry.reward.res === 'frogurt') pFrogurt += entry.p;
    });

    var n = y.frogsPerUse;
    return {
      frogsPerUse: n,
      expectedGroupSize: expectedGroupSize(cfg),
      types: types,
      perFrog: y.perFrog,
      perUse: y.perUse,
      matrix: y.matrix,
      frogspawnReturned: y.perUse.frogspawn,
      netFrogspawn: y.perUse.frogspawn - 1,
      pAnyFrogspawn: 1 - Math.pow(1 - pFrogspawn, n),
      pAnyLantern: 1 - Math.pow(1 - pLantern, n),
      pAnyFrogurt: 1 - Math.pow(1 - pFrogurt, n),
      pGolden: cfg.goldenChance,
      pBig: cfg.bigChance * (1 - cfg.massiveChance),
      pMassive: cfg.bigChance * cfg.massiveChance
    };
  }

  global.LFAnalytics = {
    frogTypeDistribution: frogTypeDistribution,
    groupSizeDistribution: groupSizeDistribution,
    expectedGroupSize: expectedGroupSize,
    expectedFrogsPerUse: expectedFrogsPerUse,
    quantityStats: quantityStats,
    rewardProbabilities: rewardProbabilities,
    rewardMatrix: rewardMatrix,
    expectedYield: expectedYield,
    summary: summary
  };
})(window);
