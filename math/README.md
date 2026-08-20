# Lucky888 math data

`profiles/<configuration-id>/` contains isolated, human-edited Bathala-style inputs. Every math command requires an explicit profile folder name; paths and implicit defaults are rejected.

```bash
npm run math:validate -- --profile bathala-tumble-balanced-v1
npm run math:build -- --profile bathala-tumble-balanced-v1
npm run math:simulate -- --profile bathala-tumble-balanced-v1 --spins 1000000 --seed 2026
```

The build artifact is written to `generated/<configuration-id>/runtime-config.json`. The selected build is also mirrored to `apps/game/public/data/runtime-config.json` for the game client. Simulations load the seven profile source files directly and write the same serialized report to `reports/<configuration-id>-simulation-<seed>-<spins>.json` and the dashboard's `public/reports/` directory.

`source/` is retained as a legacy snapshot, but no validate/build/simulate command reads it. The `lucky888-bathala-aligned-v3` snapshot has been migrated into `profiles/lucky888-bathala-aligned-v3/`.

All probabilities and count pays are provisional calibration values. Relative weights are normalized by the engine; they need not total 100. A paytable row must cover every count from 8 through 30 exactly once for each regular symbol.

The generated metadata carries source, structural, and payout SHA-256 fingerprints. `reports/` receives deterministic streaming simulation output. Historical Lucky888 reports describe the retired model and are not current balancing targets.
