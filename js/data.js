/* =========================================================================
   data.js — static game data: stats, reward table, icons, frog types
   ========================================================================= */
(function (global) {
  'use strict';

  var ICONS = {
    gems: 'https://static.wikitide.net/shminerwiki/a/aa/Gem.png',
    relic: 'https://static.wikitide.net/shminerwiki/6/6d/Relic_Chest.png',
    fuel: 'https://static.wikitide.net/shminerwiki/4/44/Fuel.png',
    t2: 'https://static.wikitide.net/shminerwiki/8/89/T2_Item_Box.png',
    sushi: 'https://static.wikitide.net/shminerwiki/6/6d/Sushi.png',
    cow: 'https://static.wikitide.net/shminerwiki/9/98/Blue_Cow.png',
    skill: 'https://static.wikitide.net/shminerwiki/5/51/Skill_Point.png',
    lantern: 'https://static.wikitide.net/shminerwiki/c/c7/Lootbug_Lantern.png',
    frogspawn: 'https://static.wikitide.net/shminerwiki/5/5f/Frogspawn.png',
    frogurt: 'https://static.wikitide.net/shminerwiki/9/9e/Frogurt.png'
  };

  /* Emoji shown if the wiki image fails to load (offline / hotlink blocked). */
  var FALLBACK = {
    gems: '💎', relic: '🎁', fuel: '⛽', t2: '📦', sushi: '🍣',
    cow: '🐄', skill: '⭐', lantern: '🏮', frogspawn: '🥚', frogurt: '🍦'
  };

  /* Resources — rewards roll into one of these buckets for totalling. */
  var RESOURCES = {
    gems: { id: 'gems', name: 'Gems', icon: ICONS.gems },
    relic: { id: 'relic', name: 'Relic Chests', icon: ICONS.relic },
    fuel: { id: 'fuel', name: 'Fuel', icon: ICONS.fuel },
    t2: { id: 't2', name: 'T2 Items', icon: ICONS.t2 },
    sushi: { id: 'sushi', name: 'Sushi', icon: ICONS.sushi },
    cow: { id: 'cow', name: 'Blue Cow', icon: ICONS.cow },
    skill: { id: 'skill', name: 'Skill Points', icon: ICONS.skill },
    lantern: { id: 'lantern', name: 'Lootbug Lantern', icon: ICONS.lantern },
    frogspawn: { id: 'frogspawn', name: 'Frogspawn', icon: ICONS.frogspawn },
    frogurt: { id: 'frogurt', name: 'Frogurt', icon: ICONS.frogurt }
  };

  var RESOURCE_ORDER = ['gems', 'relic', 'fuel', 't2', 'sushi', 'cow', 'skill', 'lantern', 'frogspawn', 'frogurt'];

  /* -----------------------------------------------------------------------
     Reward table. Weights are out of 196 (they sum to exactly 196).
     Frogurt sits outside that pool — its rarity is listed as "1/?" in game,
     so its weight is derived from a user-configurable "1 in N" setting.
     `caps` limits the final quantity per size class, ignoring multipliers.
     ----------------------------------------------------------------------- */
  var REWARDS = [
    { id: 'gems_50', res: 'gems', label: '50-100 Gems', min: 50, max: 100, weight: 70, tier: 'common' },
    { id: 'relic_10', res: 'relic', label: '10-20 Relic Chests', min: 10, max: 20, weight: 50, tier: 'common' },
    { id: 'fuel_15', res: 'fuel', label: '15-30 Fuel', min: 15, max: 30, weight: 40, tier: 'common' },
    { id: 't2_4', res: 't2', label: '4-8 Tier 2 Items', min: 4, max: 8, weight: 8, tier: 'uncommon' },
    { id: 'sushi_3', res: 'sushi', label: '3-5 Sushi', min: 3, max: 5, weight: 8, tier: 'uncommon' },
    { id: 'cow_4', res: 'cow', label: '4-10 Blue Cow', min: 4, max: 10, weight: 6, tier: 'uncommon' },
    { id: 'gems_150', res: 'gems', label: '150-300 Gems', min: 150, max: 300, weight: 4, tier: 'rare' },
    { id: 'gems_1000', res: 'gems', label: '1000-3000 Gems', min: 1000, max: 3000, weight: 2, tier: 'epic' },
    { id: 'relic_100', res: 'relic', label: '100-150 Relic Chests', min: 100, max: 150, weight: 2, tier: 'epic' },
    { id: 'skill_1', res: 'skill', label: '1-3 Skill Points', min: 1, max: 3, weight: 2, tier: 'epic' },
    { id: 'sushi_15', res: 'sushi', label: '15-30 Sushi', min: 15, max: 30, weight: 2, tier: 'epic' },
    {
      id: 'lantern_1', res: 'lantern', label: '1 Lootbug Lantern', min: 1, max: 1, weight: 1, tier: 'legendary',
      caps: { basic: 3, big: 6, massive: 9 }
    },
    {
      id: 'frogspawn_1', res: 'frogspawn', label: '1 Frogspawn', min: 1, max: 1, weight: 1, tier: 'legendary',
      caps: { basic: 3, big: 3, massive: 6 }
    },
    { id: 'frogurt_1', res: 'frogurt', label: '1 Frogurt', min: 1, max: 1, weight: 0, tier: 'legendary', frogurt: true }
  ];

  var BASE_POOL = 196; // sum of every listed weight except Frogurt

  /* -----------------------------------------------------------------------
     Player stats. `def` is the value used when the field is blank or 0.
     ----------------------------------------------------------------------- */
  var STAT_DEFS = [
    {
      key: 'lootfrog_capacity', label: 'Lootfrog Capacity', unit: 'frogs', def: 1, integer: true,
      help: 'Max lootfrogs on screen at once. One Frogspawn fills this up.'
    },
    {
      key: 'lootfrog_loot_multi', label: 'Lootfrog Loot Multiplier', unit: '×', def: 1,
      help: 'Applies to every lootfrog reward. Base ×1.'
    },
    {
      key: 'lootfrog_golden_chance', label: 'Golden Lootfrog Chance', unit: '%', def: 0,
      help: 'Chance for any lootfrog to also be golden.'
    },
    {
      key: 'lootfrog_golden_multi', label: 'Golden Lootfrog Multiplier', unit: '×', def: 2,
      help: 'Extra multiplier on golden frogs. Base ×2.'
    },
    {
      key: 'lootfrog_triple_spawn_chance', label: 'Lootfrog Triple Spawn Chance', unit: '%', def: 0,
      help: 'Chance a spawn produces 3 frogs instead of 1.'
    },
    {
      key: 'lootfrog_10x_spawn_chance', label: 'Lootfrog 10x Spawn Chance', unit: '%', def: 0,
      help: 'Chance a spawn produces 10 frogs instead of 1. Rolled before triple.'
    },
    {
      key: 'lootfrog_big_chance', label: 'Big Lootfrog Chance', unit: '%', def: 0,
      help: 'Chance for a lootfrog to spawn as the Big variant.'
    },
    {
      key: 'lootfrog_big_multi', label: 'Big Lootfrog Multiplier', unit: '×', def: 5,
      help: 'Extra multiplier on Big frogs. Base ×5.'
    },
    {
      key: 'lootfrog_massive_chance', label: 'Massive Lootfrog Chance', unit: '%', def: 0,
      help: 'Chance for a BIG lootfrog to upgrade to Massive.'
    },
    {
      key: 'lootfrog_massive_multi', label: 'Massive Lootfrog Multiplier', unit: '×', def: 3,
      help: 'Extra multiplier on Massive frogs. Base ×3.'
    }
  ];

  /* The six frog varieties, in display order. */
  var FROG_TYPES = [
    { key: 'basic', size: 'basic', golden: false, label: 'Lootfrog', short: 'Basic' },
    { key: 'basic_gold', size: 'basic', golden: true, label: 'Golden Lootfrog', short: 'Golden' },
    { key: 'big', size: 'big', golden: false, label: 'Big Lootfrog', short: 'Big' },
    { key: 'big_gold', size: 'big', golden: true, label: 'Golden Big Lootfrog', short: 'Golden Big' },
    { key: 'massive', size: 'massive', golden: false, label: 'Massive Lootfrog', short: 'Massive' },
    { key: 'massive_gold', size: 'massive', golden: true, label: 'Golden Massive Lootfrog', short: 'Golden Massive' }
  ];

  var SIZE_LABEL = { basic: 'Lootfrog', big: 'Big', massive: 'Massive' };

  global.LFData = {
    ICONS: ICONS,
    FALLBACK: FALLBACK,
    RESOURCES: RESOURCES,
    RESOURCE_ORDER: RESOURCE_ORDER,
    REWARDS: REWARDS,
    BASE_POOL: BASE_POOL,
    STAT_DEFS: STAT_DEFS,
    FROG_TYPES: FROG_TYPES,
    SIZE_LABEL: SIZE_LABEL
  };
})(window);
