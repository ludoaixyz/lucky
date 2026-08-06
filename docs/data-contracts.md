# Data contracts

All source files use UTF-8, case-sensitive stable IDs, semantic string versions, and integer credits/counts/stops/caps.

- `game-config.json` defines identity, dimensions, fixed bet, pay model, and the aggregate paid-spin maximum.
- `bonus-config.json` is schema `1.1.0`: enabled flag, Scatter-anywhere trigger, increasing initial/retrigger award tables, multiplier, direct Scatter-pay flag, alternate-asset flags, and finite spin/retrigger limits.
- `symbols.csv`, `paytable.csv`, `reel-strips.csv`, and `paylines.csv` define symbols, left-to-right line awards, cyclic stops, and zero-based fixed row paths.

`SpinResult` retains base line/Scatter payout, feature payout, uncapped total, credited total, cap status, base stops/window/wins, and an optional full `FeatureResult`. Every `FreeSpinResult` retains its index, stops, window, line wins, Scatter count, allowed retrigger addition, raw award, multiplier, and win. Diagnostics store one entry per paid spin and serialize feature-spin summaries in CSV.

Compiled runtime artifacts contain the complete validated config plus schema/game/configuration versions, SHA-256 source fingerprint, and generation timestamp. Builds read source sheets and write only ignored generated locations. Probabilities are decimal ratios (`0.01` means one percent).
