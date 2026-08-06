# Math workspace

`source/` contains editable authority data, `generated/` contains compiler output, `reports/` contains simulation output, `schemas/` describes machine-readable contracts, and `templates/` contains the PAR-sheet outline. Builds read but never mutate source sheets. All starter figures are illustrative.

Use integer credits for bets and awards. Rates are decimal ratios; RTP may exceed 1 while probabilities remain in `[0, 1]`. Run `npm run math:validate`, `npm run math:build`, and `npm run math:enumerate` after changing a configuration. Enumeration uses exact paid-stop probabilities and bounded feature state equations. Simulation counts one wager per paid spin and includes its full feature. Bulk JSON reports remain ignored; `lucky888-base-v1-par.md` is the reviewed configuration report.
