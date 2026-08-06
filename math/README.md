# LUCKY888 math workspace

`source/` contains editable authority data, `generated/` contains compiler output, `reports/` contains simulation output, `schemas/` describes machine-readable contracts, and `templates/` contains the PAR-sheet outline. Builds read but never mutate source sheets. All starter figures are illustrative.

Use integer credits for bets and awards. Rates are decimal ratios; RTP may exceed 1 while probabilities remain in `[0, 1]`. Run `npm run math:validate`, `npm run math:build`, `npm run math:enumerate`, and `npm run math:report -- --spins 1000000 --seed 2026` after changing a profile. Enumeration provides exact uncapped results; the durable deterministic Monte Carlo report records credited cap-tail return, feature percentiles, target comparisons, and strict accounting/probability reconciliations. The balanced candidate JSON and Markdown simulation reports are tracked; other bulk JSON remains ignored.
