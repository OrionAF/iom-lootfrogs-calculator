# Frogspawn Loot Calculator

A web app that simulates what you get out of a **Frogspawn** in Idle Obelisk Miner, and
shows the underlying drop odds for every Lootfrog variety.

No build step, no dependencies — plain HTML, CSS and JavaScript, ready for GitHub Pages.

## What it does

- **Enter your stats** by hand, or paste the game's exported JSON and let it pull the
  ten `lootfrog_*` values out. Blank or `0` fields fall back to base game values.
- **Use X Frogspawn** and watch the lootfrogs spawn in with their rolled rewards —
  golden frogs shimmer, big/massive frogs are colour-coded, and rare drops get a moment.
  The run total sits directly above the results, so it stays in view no matter how many
  frogs you spawned.
- **Watch the spawn play out** when you use a single Frogspawn: the column grid opens,
  base frogs drop in, the 3× and 10× rows roll one column at a time (a hit spawns extras,
  a miss stamps a red X), then the grid tips every frog into one bowl where they roll Big,
  Massive and Golden before popping open into loot. See below.
- **Filter the results** by frog variety and by reward rarity. Selections combine within
  a group (Epic *or* Legendary) and narrow across groups (Golden frogs *and* Legendary
  drops). Filtering searches the whole run rather than the rendered slice, so a hunt for
  legendaries finds them even past the 600-card render cap.
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

Picture one **column** per base spawn. A Frogspawn opens exactly **Lootfrog Capacity**
columns, and each column resolves three rows:

| Row | Roll        | Hit | Miss |
| --- | ----------- | --- | ---- |
| 1   | base frog   | +1  | —    |
| 2   | 10x spawn   | +9  | +0   |
| 3   | Triple spawn| +2  | +0   |

Rows 2 and 3 are **independent** — one column can win both, for `1 + 9 + 2 = 12` frogs.
So a column yields 1, 3, 10 or 12 frogs, with mean `1 + 9×P(10x) + 2×P(triple)`.

The extras are the part worth being precise about:

- They do **not** open a column of their own, so they never consume capacity. Capacity
  counts columns, not frogs on screen, and a Frogspawn routinely hands you well over it.
- They do **not** roll for a multi-spawn themselves, so nothing cascades.

Capacity 19 with four Triples is therefore `19 + 4×2 = 27` frogs, and expected frogs per
Frogspawn is simply `capacity × E[column size]`.

The columns are then tipped into one bowl. Every frog in it independently rolls **Big →
Massive** and **Golden**, and pulls its own reward — none of which depends on the column
it came from, so the frog that triggered a 10x is no more or less likely to be Big.

### Multipliers

```
total = Lootfrog Loot Multiplier
      × Big Multiplier       (Big and Massive frogs)
      × Massive Multiplier   (Massive frogs)
      × Golden Multiplier    (Golden frogs)
```

Massive spawns out of Big, so a Massive frog gets both multipliers (base ×5 × ×3 = ×15).

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
js/theatre.js       the spawn show — column grid, bowl packing, growth, gilding
js/theme.js         press / newsprint theme toggle
js/app.js           UI wiring, results grid, filters, saved totals
```

### The spawn show

`js/theatre.js` replays a run that has *already* been simulated — it never rolls anything
itself, so what you watch always agrees with the totals. It reconstructs the columns from
each frog's recorded `groupSize` (1 neither, 3 Triple, 10 tenx, 12 both), which is enough
to know exactly which frogs belong to which row.

It runs only for a **single Frogspawn**. There is one grid per Frogspawn, so 50 of them
would mean 50 grids and thousands of sprites; bulk runs go straight to the reward grid, as
do capacities above 60 columns and visitors with `prefers-reduced-motion`. **Skip
animation** cuts it short at any point.

Grid, bowl and sprite layer share one coordinate space: during the grid phase the grid
holds the origin, and when it collapses to zero height the bowl inherits it. Falling into
the bowl is therefore just a change of `transform` — no reparenting and no scroll desync.

Bowl placement is circle packing rather than physics. Each frog is the circle **inscribed
in its sprite box** — an invisible collision border, so frogs nest by their outline instead
of colliding as rectangles, and the art is never cropped. The solver relaxes overlaps and
clamps to the bowl, and CSS transitions carry frogs to the result; re-packing after each
growth step is what makes a frog swelling to Massive visibly shove its neighbours aside.

Sprites are the wiki's 66 Lootfrog portraits, each with a gilded twin at the same index, so
a frog keeps its identity when Golden lands. Native art is 32×33, drawn at 48×50 basic,
122×126 Big and 256×264 Massive; on a screen too narrow for a 256px frog every size shrinks
by one shared factor so the proportions hold.

### Look and feel

The interface is styled as printed matter — hairline rules instead of glow, a
second ink plate printed off-register instead of blurred drop shadows, a
halftone dot ground, square corners throughout, and one acid ink carrying the
whole accent load. Type is Bricolage Grotesque for display, Space Grotesk for
running text, and DM Mono for every number.

It ships in two stocks: **press** (dark ink, the default) and **newsprint**
(light). The toggle in the header stores your choice in `localStorage`; with
nothing stored it follows `prefers-color-scheme`. Every colour is a custom
property on `:root`, so a theme is a variable swap and nothing more.

Fonts load from Google Fonts, so an offline copy falls back to system faces —
the layout holds either way.

`js/sim.js` and `js/analytics.js` are free of DOM access, so they can be loaded and
exercised outside a browser.

Item art is hotlinked from the Idle Obelisk Miner wiki, with emoji fallbacks if it can't be
reached. Fan-made; not affiliated with the game.
