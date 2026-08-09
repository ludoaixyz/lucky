# LUCKY888 math workspace

`source/` contains exactly eight editable CSV/JSON authority files: symbols, paytable, paylines, base reels, free-spin reels, game config, rules config, and bonus config. `generated/` contains compiler output, `reports/` contains simulation output, `schemas/` describes machine-readable contracts, and `templates/` contains the PAR-sheet outline. Builds read but never mutate source sheets. `math-engine.xlsx` is retained only as legacy reference material and is excluded from the compiler manifest and fingerprints.

Use integer total-bet and award credits; the production profile normalizes its five-credit total wager across 20 lines with a 0.25-credit line bet. Rates are decimal ratios; RTP may exceed 1 while probabilities remain in `[0, 1]`. Run `npm run math:validate`, `npm run math:build`, `npm run math:inspect`, `npm run math:enumerate`, and `npm run math:report -- --spins 1000000 --seed 2026` after changing a profile. The hybrid enumerator provides exact initial-board pricing and trigger probability; the durable deterministic Monte Carlo report records variable-length cascade/free-spin results, credited cap-tail return, feature percentiles, target comparisons, and strict accounting/probability reconciliations.

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

`npm run math:enumerate` uses the structural cache for exact initial-board pricing while deterministic Monte Carlo remains authoritative for variable-length cascade and free-spin sequences. The recommended workflow is:

```text
npm run math:validate
npm run math:build
npm run math:inspect
npm run math:enumerate
npm run math:report -- --spins 1000000 --seed 2026
```
