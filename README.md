# Frogspawn Loot Calculator

A web app that simulates what you get out of a **Frogspawn** in Idle Ore Miner, and
shows the underlying drop odds for every Lootfrog variety.

No build step, no dependencies — plain HTML, CSS and JavaScript, ready for GitHub Pages.

## What it does

- **Enter your stats** by hand, or paste the game's exported JSON and let it pull the
  ten `lootfrog_*` values out. Blank or `0` fields fall back to base game values.
- **Use X Frogspawn** and watch the lootfrogs spawn in with their rolled rewards —
  golden frogs shimmer, big/massive frogs are colour-coded, and rare drops get a moment.
- **Save results** into a running vault of totals across as many Frogspawn as you like,
  exportable to CSV.
- **Probabilities tab** with exact (non-sampled) odds and expected yields per frog
  variety, including how often the Frogspawn/Lantern caps waste your multipliers.

## Running it

Open `index.html` in a browser — that's it. To serve it locally:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` publishes the repository root on every push to `main`.
Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Alternatively, set Pages to serve the `main` branch `/ (root)` directly — `.nojekyll` is
present so nothing gets filtered.

## How the model works

### Spawning

A Frogspawn fills the screen to your **Lootfrog Capacity**. Frogs arrive in spawn groups:
each group rolls **10x** first, then **Triple**, otherwise a single frog. Group size is
locked in *before* any size roll, so a Big or Massive frog never multi-spawns. Every frog
in the group then independently rolls **Big → Massive**, and **Golden** separately.

Because the last group can be a 10x, a Frogspawn can slightly overshoot capacity. That
overflow is on by default and can be switched off in the advanced options, in which case
you get exactly capacity frogs.

### Multipliers

```
total = Lootfrog Loot Multiplier
      × Big Multiplier       (Big and Massive frogs)
      × Massive Multiplier   (Massive frogs)
      × Golden Multiplier    (Golden frogs)
```

Massive spawns out of Big, so a Massive frog gets both multipliers (base ×5 × ×3 = ×15).
If you'd rather model Massive as replacing Big, there's a toggle in the advanced options.

Rolled quantities are `floor(base × total)`, never below 1.

### Caps

Frogspawn and Lootbug Lantern are capped by frog size no matter how high your multipliers
climb, and being golden does not raise the cap:

| Reward          | Basic | Big | Massive |
| --------------- | ----- | --- | ------- |
| Frogspawn       | 3     | 3   | 6       |
| Lootbug Lantern | 3     | 6   | 9       |

### Reward table

Base rewards before any multipliers, weighted out of 196:

| Reward               | Chance         |
| -------------------- | -------------- |
| 50-100 Gems          | 70/196 (~35%)  |
| 10-20 Relic Chests   | 50/196 (~25%)  |
| 15-30 Fuel           | 40/196 (~20%)  |
| 4-8 Tier 2 Items     | 8/196 (~4%)    |
| 3-5 Sushi            | 8/196 (~4%)    |
| 4-10 Blue Cow        | 6/196 (~3%)    |
| 150-300 Gems         | 4/196 (~2%)    |
| 1000-3000 Gems       | 2/196 (~1%)    |
| 100-150 Relic Chests | 2/196 (~1%)    |
| 1-3 Skill Points     | 2/196 (~1%)    |
| 15-30 Sushi          | 2/196 (~1%)    |
| 1 Lootbug Lantern    | 1/196 (~0.5%)  |
| 1 Frogspawn          | 1/196 (~0.5%)  |
| 1 Frogurt            | 1/? (see below)|

Frogurt's rarity is listed as "1/?" in game. It's modelled as **1 in 196** by default and
is adjustable in the advanced options — change it if the real number turns up.

### Other assumptions

- Chances above 100% are treated as guaranteed (these are all binary rolls).
- Percentage stats are read as percentages, and multiplier stats as the final multiplier
  value (so `lootfrog_big_multi: 8.26` means ×8.26, not ×5 × 8.26).

## Layout

```
index.html          markup and layout
css/styles.css      theme, animations
js/data.js          reward table, stat definitions, icon URLs
js/sim.js           config building, seeded RNG, the simulation
js/analytics.js     exact probability maths for the Probabilities tab
js/app.js           UI wiring, the spawn animation, saved totals
```

`js/sim.js` and `js/analytics.js` are free of DOM access, so they can be loaded and
exercised outside a browser.

Item art is hotlinked from the Idle Ore Miner wiki, with emoji fallbacks if it can't be
reached. Fan-made; not affiliated with the game.
