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

  /* On-screen sprite sizes. Native art is 32x33, and the aspect ratio is kept
     at every step. Collision in the bowl is a circle inscribed in the box, so
     frogs nest instead of colliding as rectangles. */
  var FROG_SPRITE = {
    basic: { w: 48, h: 50 },
    big: { w: 122, h: 126 },
    massive: { w: 256, h: 264 }
  };

  /* Lootfrog portraits, 66 designs with a gilded twin at the same index, so a
     frog keeps its identity when it turns golden. Paths are relative to
     WIKI_ART; the sprites are 32x33 native. */
  var WIKI_ART = 'https://static.wikitide.net/shminerwiki/';

  var FROG_ART = [
    '9/93/Lootfrog.png', 'a/ad/Lootfrog_1.png', '3/38/Lootfrog_2.png', 'b/bc/Lootfrog_3.png',
    '5/50/Lootfrog_4.png', '5/55/Lootfrog_5.png', '4/48/Lootfrog_6.png', 'f/fd/Lootfrog_7.png',
    'e/e5/Lootfrog_8.png', '0/0b/Lootfrog_9.png', '6/69/Lootfrog_10.png',
    'c/c5/Lootfrog_11.png', '9/9b/Lootfrog_12.png', '1/19/Lootfrog_13.png',
    '7/7e/Lootfrog_14.png', 'd/d5/Lootfrog_15.png', '1/10/Lootfrog_16.png',
    'd/df/Lootfrog_17.png', 'd/d3/Lootfrog_18.png', '1/1d/Lootfrog_19.png',
    '4/49/Lootfrog_20.png', '8/8d/Lootfrog_21.png', 'b/b1/Lootfrog_22.png',
    '7/70/Lootfrog_23.png', '2/2d/Lootfrog_24.png', '9/99/Lootfrog_25.png',
    'd/dc/Lootfrog_26.png', '9/9d/Lootfrog_27.png', 'a/a0/Lootfrog_28.png',
    'f/f7/Lootfrog_29.png', '9/9d/Lootfrog_30.png', '2/21/Lootfrog_31.png',
    '6/62/Lootfrog_32.png', '0/0a/Lootfrog_33.png', 'd/d9/Lootfrog_34.png',
    '6/6b/Lootfrog_35.png', '5/54/Lootfrog_36.png', 'f/f0/Lootfrog_37.png',
    '7/76/Lootfrog_38.png', '9/9f/Lootfrog_39.png', '7/7a/Lootfrog_40.png',
    '0/0d/Lootfrog_41.png', 'a/a5/Lootfrog_42.png', 'b/b6/Lootfrog_43.png',
    '4/4c/Lootfrog_44.png', 'b/b8/Lootfrog_45.png', '9/99/Lootfrog_46.png',
    'c/c1/Lootfrog_47.png', '4/45/Lootfrog_48.png', 'd/d4/Lootfrog_49.png',
    'd/db/Lootfrog_50.png', 'd/d4/Lootfrog_51.png', '2/2e/Lootfrog_52.png',
    '8/87/Lootfrog_53.png', 'd/d4/Lootfrog_54.png', '3/3d/Lootfrog_55.png',
    '4/48/Lootfrog_56.png', '1/11/Lootfrog_57.png', '5/50/Lootfrog_58.png',
    '3/3a/Lootfrog_59.png', 'b/b9/Lootfrog_60.png', '9/95/Lootfrog_61.png',
    '9/93/Lootfrog_62.png', '0/01/Lootfrog_63.png', '7/75/Lootfrog_64.png',
    '0/05/Lootfrog_65.png'
  ].map(function (p) { return WIKI_ART + p; });

  var FROG_ART_GOLD = [
    'b/b2/Lootfrog_Golden.png', '9/97/Lootfrog_Golden_1.png', '4/49/Lootfrog_Golden_2.png',
    '9/97/Lootfrog_Golden_3.png', '2/24/Lootfrog_Golden_4.png', 'c/ca/Lootfrog_Golden_5.png',
    'a/a1/Lootfrog_Golden_6.png', 'f/f2/Lootfrog_Golden_7.png', '6/6d/Lootfrog_Golden_8.png',
    '0/09/Lootfrog_Golden_9.png', 'e/e0/Lootfrog_Golden_10.png', '7/74/Lootfrog_Golden_11.png',
    'd/d0/Lootfrog_Golden_12.png', '3/33/Lootfrog_Golden_13.png',
    '5/5f/Lootfrog_Golden_14.png', '1/16/Lootfrog_Golden_15.png',
    '5/53/Lootfrog_Golden_16.png', '3/36/Lootfrog_Golden_17.png',
    'b/b2/Lootfrog_Golden_18.png', '2/25/Lootfrog_Golden_19.png',
    '4/41/Lootfrog_Golden_20.png', 'b/ba/Lootfrog_Golden_21.png',
    '7/72/Lootfrog_Golden_22.png', '0/0f/Lootfrog_Golden_23.png',
    '8/89/Lootfrog_Golden_24.png', '1/10/Lootfrog_Golden_25.png',
    '1/16/Lootfrog_Golden_26.png', '9/9f/Lootfrog_Golden_27.png',
    '8/84/Lootfrog_Golden_28.png', 'f/ff/Lootfrog_Golden_29.png',
    '6/60/Lootfrog_Golden_30.png', '6/62/Lootfrog_Golden_31.png',
    '0/0b/Lootfrog_Golden_32.png', 'd/da/Lootfrog_Golden_33.png',
    'a/ae/Lootfrog_Golden_34.png', 'b/bb/Lootfrog_Golden_35.png',
    '7/71/Lootfrog_Golden_36.png', '2/2a/Lootfrog_Golden_37.png',
    '7/72/Lootfrog_Golden_38.png', '5/5f/Lootfrog_Golden_39.png',
    '5/56/Lootfrog_Golden_40.png', 'c/c1/Lootfrog_Golden_41.png',
    '3/3f/Lootfrog_Golden_42.png', '1/1c/Lootfrog_Golden_43.png',
    '3/35/Lootfrog_Golden_44.png', '5/55/Lootfrog_Golden_45.png',
    '2/28/Lootfrog_Golden_46.png', 'd/d3/Lootfrog_Golden_47.png',
    'a/ae/Lootfrog_Golden_48.png', 'a/a7/Lootfrog_Golden_49.png',
    '9/9a/Lootfrog_Golden_50.png', '6/63/Lootfrog_Golden_51.png',
    '4/4c/Lootfrog_Golden_52.png', 'f/f8/Lootfrog_Golden_53.png',
    'a/a8/Lootfrog_Golden_54.png', '1/12/Lootfrog_Golden_55.png',
    'b/b0/Lootfrog_Golden_56.png', '9/99/Lootfrog_Golden_57.png',
    '8/8d/Lootfrog_Golden_58.png', 'c/c6/Lootfrog_Golden_59.png',
    '5/51/Lootfrog_Golden_60.png', '4/48/Lootfrog_Golden_61.png',
    '4/44/Lootfrog_Golden_62.png', '7/7a/Lootfrog_Golden_63.png',
    '4/4b/Lootfrog_Golden_64.png', '2/23/Lootfrog_Golden_65.png'
  ].map(function (p) { return WIKI_ART + p; });


  global.LFData = {
    ICONS: ICONS,
    FALLBACK: FALLBACK,
    RESOURCES: RESOURCES,
    RESOURCE_ORDER: RESOURCE_ORDER,
    REWARDS: REWARDS,
    BASE_POOL: BASE_POOL,
    STAT_DEFS: STAT_DEFS,
    FROG_TYPES: FROG_TYPES,
    SIZE_LABEL: SIZE_LABEL,
    FROG_SPRITE: FROG_SPRITE,
    FROG_ART: FROG_ART,
    FROG_ART_GOLD: FROG_ART_GOLD
  };
})(window);
