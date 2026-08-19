# Lucky888 Bathala-style mathematics prototype

Lucky888 is a deterministic, simulation-first 6×5 count-pay tumble game. It reproduces the known observable Bathala-style rules while keeping unknown production probabilities and pays explicit, editable placeholders.

## Active model

- 6 columns × 5 rows; all 30 cells are generated independently from weighted profiles.
- L1–L5 and H1–H4 pay when 8 or more identical symbols are visible anywhere. Adjacency is irrelevant and multiple types may pay together.
- Every scoring type is removed. Bathala then removes a configurable low-symbol type without direct payout, survivors collapse downward, and empty cells refill.
- Visible Base Game multiplier values add together and multiply that tumble's regular-symbol pay.
- Four or more final-board Scatters award 15 Free Games. Direct Scatter pays are 4=3×, 5=5×, and 6=100×.
- During Free Games, 3+ final-board Scatters add five spins. Newly visible multiplier instances are collected on a winning round only, once per identity, into a feature-level total that never resets on a retrigger.
- Scatter effects resolve once from the final board after all tumbles. This is the documented prototype interpretation of the supplied timing rule.

The retired five-reel evaluator is kept only in unreferenced legacy source files for historical comparison. Active exports, builds, tests, generated configuration, CLI simulation, and the browser prototype do not load reel strips, paylines, or WILD logic.

## Resolution sequence

1. Generate a 30-cell board from the active Base or Free Game weight profile.
2. Count regular symbols globally and resolve every 8+ count pay.
3. Resolve visible multipliers. In Free Games, collect only not-yet-collected multiplier identities.
4. Credit the round, remove winning cells, apply Bathala, collapse, and refill.
5. Repeat until there is no regular-symbol win.
6. Resolve final-board Scatter direct pay and the feature trigger/retrigger.
7. In Free Games, consume one spin per initial board, preserve the cumulative multiplier, then add any retriggered spins.

## Configuration authority

The seven files in `math/source` are the only active math authority:

- `game-config.json`: layout, model, safety limit, symbol taxonomy, collection trigger.
- `base-symbol-weights.csv`: Base Game relative cell weights.
- `freegame-symbol-weights.csv`: independently tunable Free Game weights.
- `cluster-paytable.csv`: configurable range-based count pays covering 8–30.
- `multiplier-values.csv`: relative weights for ×2 through ×500.
- `bathala-config.json`: target selection and removal modes.
- `scatter-config.json`: final-board timing, direct pays, initial award, and retrigger.

Weights and count pays are calibration placeholders, not claims about Spin Master Bathala's production math. Bathala's current target interpretation—random eligible low symbol type, remove all instances—is also a configurable estimate.

## Commands

```text
npm run math:build
npm run math:validate
npm test
npm run typecheck
npm run lint
npm run build
npm run math:simulate -- --spins 10000 --seed 2026
```

The simulator aggregates results while each spin is discarded, so large runs do not retain board histories. `resolveSpin(config, rng, true)` enables rich trace boards for debugging.

## GitHub Pages Deployment

Build the combined static deployment artifact with:

```text
npm run deploy:build
```

For a project-path build equivalent to the default Pages URL, run:

```text
VITE_BASE_PATH=/lucky/ npm run deploy:build
```

The repository is `https://github.com/ludoaixyz/lucky`. The deployment build creates
one Pages artifact in `dist-pages`: the game build is copied to its root and the
complete dashboard build is copied to `dist-pages/dashboard/`.

```text
dist-pages/
|-- index.html
|-- assets/
`-- dashboard/
    |-- index.html
    |-- assets/
    |-- flags/
    `-- reports/
```

The default Pages URL is `https://ludoaixyz.github.io/lucky/`, with its dashboard at
`https://ludoaixyz.github.io/lucky/dashboard/`. The configured custom domain is
`https://lucky888.ludoai.xyz/`, and its dashboard is available at
`https://lucky888.ludoai.xyz/dashboard/`.

The workflow passes GitHub Pages' configured base path to the deployment build. For
the configured custom domain this is `/`, so the game is built for `/` and the
dashboard is built for `/dashboard/`. A project-site build can still use `/lucky/`
and `/lucky/dashboard/`. Build output remains uncommitted.

Only `lucky888.ludoai.xyz` requires a DNS record. `/dashboard/` is a path on the
same hostname and does not require a separate DNS record.
