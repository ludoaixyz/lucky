# Lucky888 math data

`source/` contains the seven human-edited Bathala-style inputs. `npm run math:build` validates them and writes identical runtime artifacts to `generated/runtime-config.json` and `apps/game/public/data/runtime-config.json`.

All probabilities and count pays are provisional calibration values. Relative weights are normalized by the engine; they need not total 100. A paytable row must cover every count from 8 through 30 exactly once for each regular symbol.

The generated metadata carries source, structural, and payout SHA-256 fingerprints. `reports/` receives deterministic streaming simulation output. Historical Lucky888 reports describe the retired model and are not current balancing targets.
