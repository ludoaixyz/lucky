# Math workspace

`source/` contains editable authority data, `generated/` contains compiler output, `reports/` contains simulation output, `schemas/` describes machine-readable contracts, and `templates/` contains the PAR-sheet outline. Builds read but never mutate source sheets. All starter figures are illustrative.

Use integer credits for bets and awards. Rates in reports are decimal ratios in `[0, 1]` where they are probabilities. Run `npm run math:validate`, then `npm run math:build` before consuming a changed configuration.
