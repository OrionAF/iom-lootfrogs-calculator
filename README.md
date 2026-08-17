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

### Gems from Lootfrogs

The **Gems from Lootfrogs** upgrade adds +10% a level over 20 levels, so +200% at the top.
It scales gem rewards only, multiplying on top of whatever the frog itself is worth:

```
gem quantity = floor(base × frog multiplier × (1 + bonus))
```

Set it beside the spawn button, in 10% steps and capped at 200%. It feeds the Probabilities
tab as well as the simulator, and leaves every non-gem reward untouched.

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
js/motion.js        the motion switch
js/app.js           UI wiring, results grid, filters, saved totals
```

### The spawn show

`js/theatre.js` replays a run that has *already* been simulated — it never rolls anything
itself, so what you watch always agrees with the totals. It reconstructs the columns from
each frog's recorded `groupSize` (1 neither, 3 Triple, 10 tenx, 12 both), which is enough
to know exactly which frogs belong to which row.

**Several Frogspawn share one grid.** Rather than drawing a grid each, every Frogspawn
cycles through the same one: the marks are wiped, the rows re-roll, and the catch is stowed
out of the cells before the next one starts. When the last has rolled, every frog from
every Frogspawn drops into the bowl together. The phase label reads `Frogspawn 3/8` so you
always know where you are.

Cycles share a time budget, so eight Frogspawn is not eight times the wait — one runs at
the natural tempo, sixteen only a little longer, compressing as far as a floor that keeps
each cycle readable.

**Show speed** beside the button sets the tempo (Fast / Normal / Slow / Slower, defaulting
to Slow) and persists. It scales the script and reaches the stylesheet as `--show-speed`,
so the CSS transitions stretch with it rather than against it.

The show breaks out of the centred column and takes the full window width, up to 1880px.
That is not only for looks: bowl height is area over width, so every extra pixel of width
buys height back, and the grid fits more columns before it has to scroll.

The show is capped by expected **frog count**, not use count, since the bowl packs every
frog at once — about 29 Frogspawn at capacity 19. What binds is no longer compute but how
tall the bowl gets and how long you are asked to watch: 29 Frogspawn is ~800 frogs, a
~2000px bowl and a 20s show. Past that, or above 60 columns, or with **Motion** switched
off, the run goes straight to the reward grid, and the launch note says which of those
applied rather than leaving you to guess. **Skip animation** cuts it short at any point.

Grid, bowl and sprite layer share one coordinate space: during the grid phase the grid
holds the origin, and when it collapses to zero height the bowl inherits it. Falling into
the bowl is therefore just a change of `transform` — no reparenting and no scroll desync.

Bowl placement is circle packing rather than physics. Each frog is the circle **inscribed
in its sprite box** — an invisible collision border, so frogs nest by their outline instead
of colliding as rectangles, and the art is never cropped. The solver relaxes overlaps and
clamps to the bowl, and CSS transitions carry frogs to the result; re-packing after each
growth step is what makes a frog swelling to Massive visibly shove its neighbours aside.

Two things keep it fast enough to run on a crowd. Relaxation stops as soon as the layout
settles rather than running a fixed number of passes. And a **broad phase** means each frog
only compares against the eight cells around it: two circles can only touch if their centres
are within the largest diameter, so a grid of that cell size makes the comparison local
instead of all-pairs. Together they took 1,200 frogs from ~4.9s per pass to ~130ms, without
letting a single overlap through.

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

### Motion

**Motion** is the single switch governing whether anything moves — the spawn show and every
CSS transition alike, via `:root[data-motion]`. It sits in the launch row beside **Show
speed**, the control it gates, rather than off in the header among the site chrome.

It reads its state as a word, `On` or `Off`. A play/pause glyph cannot say both what the
state is and what the click will do, and the ambiguity bites hardest in the paused state,
where pause bars look like a page still waiting to be paused.

It is deliberately **on by default for everyone, including visitors whose OS reports
`prefers-reduced-motion`**, and is an opt-out rather than an opt-in. The reasoning: most
people who turn Windows animation effects off did so for battery or performance and still
want to watch the spawn, and a visible off switch next to the lever is easier to find than
the OS setting is to reconsider. That is a deliberate trade — the usual advice is to honour
the OS preference by default — so the switch is kept prominent and its state persists.

Fonts load from Google Fonts, so an offline copy falls back to system faces —
the layout holds either way.

`js/sim.js` and `js/analytics.js` are free of DOM access, so they can be loaded and
exercised outside a browser.

Item art is hotlinked from the Idle Obelisk Miner wiki, with emoji fallbacks if it can't be
reached. Fan-made; not affiliated with the game.
