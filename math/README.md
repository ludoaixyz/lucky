# LUCKY888 math workspace

`source/` contains editable authority data, `generated/` contains compiler output, `reports/` contains simulation output, `schemas/` describes machine-readable contracts, and `templates/` contains the PAR-sheet outline. Builds read but never mutate source sheets. All starter figures are illustrative.

Use integer credits for bets and awards. Rates are decimal ratios; RTP may exceed 1 while probabilities remain in `[0, 1]`. Run `npm run math:validate`, `npm run math:build`, `npm run math:enumerate`, and `npm run math:report -- --spins 1000000 --seed 2026` after changing a profile. Enumeration provides exact uncapped results; the durable deterministic Monte Carlo report records credited cap-tail return, feature percentiles, target comparisons, and strict accounting/probability reconciliations. The balanced candidate JSON and Markdown simulation reports are tracked; other bulk JSON remains ignored.

## Optional cascades

Cascades are disabled when `game-config.json` omits `cascades` or when `cascades.enabled` is false. Enable the feature additively with:

```json
"cascades": {
  "enabled": true,
  "scatterEvaluation": "initial-grid-only",
  "maximumCascadesPerSpin": 100
}
```

Winning payline coordinates are removed, survivors fall within their existing column, and each empty top position is sampled independently from that column's active reel strip through the injected random source. Base spins use base strips and free spins use free-spin strips. Scatter feature triggers and retriggers use only the initial board, and one paid/free spin remains one spin regardless of cascade depth. Exact enumeration rejects cascade-enabled profiles; use deterministic Monte Carlo for those profiles.

`npm run math:enumerate` automatically reports `NOT APPLICABLE` and exits successfully for cascade-enabled profiles. Cascade refill adds further RNG draws and variable-length resolution sequences, so deterministic Monte Carlo is the authoritative available evaluation method for those profiles. The recommended workflow remains:

```text
npm run math:validate
npm run math:build
npm run math:enumerate
npm run math:report -- --spins 1000000 --seed 2026
```
