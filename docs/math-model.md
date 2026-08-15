# Active Bathala-style math model

The active board is column-major `Board[6][5]`. Each occupied cell owns a deterministic ID, symbol type, optional multiplier value, and Free Game collection flag. All random choices use the injected `RandomSource`; game logic never calls `Math.random()`.

Count evaluation scans L1–L5 and H1–H4 globally. A configured range award is required for each count from 8 through 30. Winning types are evaluated simultaneously. Specials never participate in regular-symbol counts.

After a scoring removal, Bathala chooses among low types still visible. The initial placeholder mode chooses an eligible type uniformly and removes every instance. Weighted type selection and bounded random-count removal are supported by configuration. Bathala adds no award; each trace records its target, removed positions, and whether the refill produced the next win.

Base Game multipliers are summed from every visible multiplier cell. Free Games instead collect each visible, uncollected multiplier identity on a winning round, add it to the feature total, and mark it collected. A persistent cell therefore cannot inflate RTP by being collected again on later tumbles. When the feature total is zero, the effective multiplier is one.

Scatter is deliberately evaluated on the final stable board, once per initial spin. This prevents transient tumble boards from issuing repeated features. A feature begins at multiplier zero; retriggers add spins without modifying that multiplier.

Credited value reconciles into regular Base pay, Base multiplier uplift, direct Base Scatter pay, Free Game raw pay (including Free Game Scatter), and Free Game multiplier uplift. Bathala has no direct component.
