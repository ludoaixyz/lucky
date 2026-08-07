# LUCKY888 data contracts

`game-config.json` schema 1.2.0 fixes the active identity (`lucky888`, `LUCKY888`, version 0.3.0, configuration `lucky888-balanced-base-v1`) and defines the aggregate paid-spin maximum. `rules-config.json` explicitly defines Wild substitution, line evaluation, and Scatter behavior. `bonus-config.json` defines initial/retrigger awards, finite limits, and alternate free-spin strip identity.

`reel-strips.csv` and `free-spin-reel-strips.csv` are separate human-edited authorities. Compilation reads them but never rewrites them. Runtime data embeds both validated strip sets, complete rules, source SHA-256, versions, identity, and generation time.

`SpinResult` preserves uncapped base line/Scatter/base/feature/total credits, credited total, cap reduction, cap status, and full feature detail. Simulation reports use explicit uncapped component names and aggregate credited names. Exact reports declare `exact-uncapped`, `exact-capped`, or `hybrid`; an estimated credited field declares `monte-carlo-estimate`.

Diagnostics retain full history while rendering the latest ten. CSV exports uncapped base, feature and total payouts, credited total, cap reduction, feature counters, base stops/window, and serialized feature spins with correct escaping.

## Cumulative simulation checkpoints

The canonical default checkpoints are exported by `@lucky/shared-types` as `DEFAULT_SIMULATION_CHECKPOINTS`: 100, 1,000, 10,000, 100,000, 250,000, 500,000, and 1,000,000 paid bets. Report generation performs one seeded cumulative run and records immutable aggregate snapshots at those counts. It does not restart the random stream for each checkpoint.

Each checkpoint records cumulative wager and credited return, simulated and theoretical RTP, percentage-point deviation, win and bonus counts/frequencies, maximum observed win and multiplier, standard deviation, and the 95% confidence interval. The final checkpoint must reconcile exactly with the parent simulation report. Theoretical RTP comes from the existing exact/hybrid math report and is not recalculated or modified by checkpoint simulation.
