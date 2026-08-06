# Data contracts

All files use UTF-8 and semantic string versions. IDs are case-sensitive and stable. Awards, bets, counts, stops, and caps are integer units.

- `game-config.json`: schema/game/configuration IDs and versions; reel/row counts; pay model; integer line/total bets and cap; selected illustrative profile; simulation defaults.
- `bonus-config.json`: trigger symbol ID, minimum count, awarded free spins, integer multiplier, enabled flag, and notes.
- `symbols.csv`: `symbol_id`, `name`, `category` (`regular`, `wild`, `scatter`, `bonus`), `display`.
- `paytable.csv`: `symbol_id`, consecutive `count`, non-negative integer `award_credits`.
- `reel-strips.csv`: `reel_id`, zero-based contiguous `stop`, `symbol_id`. Every configured reel must be non-empty and all symbols defined.
- `paylines.csv`: `payline_id` and one zero-based row column per reel (`reel_1_row` through `reel_5_row`).

Compiled artifacts add `schemaVersion`, `gameVersion`, `configurationId`, SHA-256 `sourceHash`, and ISO-8601 `generatedAt`. A breaking field/meaning change increments the schema major version; compatible additions increment minor; clarifications/fixes increment patch. Probabilities are decimal ratios: `0.01` is one percent. CSV editors must preserve headers, IDs, UTF-8 encoding, and comma delimiters.
