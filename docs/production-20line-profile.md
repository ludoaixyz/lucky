# LUCKY888 production 20-line profile

> Provisional engineering mathematics; not a certification claim.

## Contract

- Configuration: `lucky888-production-20line-v1`, game version 0.4.0.
- Grid: 5 reels × 3 visible rows; 20 fixed left-to-right paylines.
- Wager: 5 credits total, normalized to 0.25 credits per line.
- Symbols: low `J/Q/K/A`; mid `COIN/GEM`; high `DRAGON/EIGHT`; special `WILD/SCATTER`.
- Wild substitutes for all eight regular symbols and never Scatter. Scatter has no direct line or credit pay.

## Paylines

| ID  | Rows      |
| --- | --------- |
| L1  | 0-0-0-0-0 |
| L2  | 1-1-1-1-1 |
| L3  | 2-2-2-2-2 |
| L4  | 0-1-2-1-0 |
| L5  | 2-1-0-1-2 |
| L6  | 0-0-1-2-2 |
| L7  | 2-2-1-0-0 |
| L8  | 1-0-0-0-1 |
| L9  | 1-2-2-2-1 |
| L10 | 0-1-1-1-0 |
| L11 | 2-1-1-1-2 |
| L12 | 0-1-0-1-0 |
| L13 | 2-1-2-1-2 |
| L14 | 1-0-1-2-1 |
| L15 | 1-2-1-0-1 |
| L16 | 0-2-0-2-0 |
| L17 | 2-0-2-0-2 |
| L18 | 0-2-1-0-2 |
| L19 | 2-0-1-2-0 |
| L20 | 1-0-2-1-2 |

## Provisional paytable

Awards are quoted per one-credit line bet; runtime applies the normalized 0.25-credit line bet.

| Symbol |   3 |   4 |     5 |
| ------ | --: | --: | ----: |
| J      |   8 |  24 |    72 |
| Q      |   8 |  28 |    88 |
| K      |  12 |  36 |   116 |
| A      |  16 |  44 |   148 |
| COIN   |  20 |  72 |   264 |
| GEM    |  32 | 104 |   368 |
| DRAGON |  60 | 220 |   880 |
| EIGHT  |  88 | 352 | 1,468 |

## Reel-strip counts

| Base | Length |   J |   Q |   K |   A | COIN | GEM | DRAGON | EIGHT | WILD | SCATTER |
| ---- | -----: | --: | --: | --: | --: | ---: | --: | -----: | ----: | ---: | ------: |
| R1   |     48 |   6 |   7 |   6 |   6 |    6 |   5 |      5 |     4 |    1 |       2 |
| R2   |     52 |   7 |   7 |   7 |   7 |    6 |   6 |      5 |     4 |    1 |       2 |
| R3   |     56 |   8 |   8 |   7 |   7 |    7 |   6 |      6 |     5 |    1 |       1 |
| R4   |     52 |   7 |   7 |   7 |   7 |    6 |   6 |      5 |     4 |    1 |       2 |
| R5   |     48 |   6 |   7 |   6 |   6 |    6 |   5 |      5 |     4 |    1 |       2 |

| Free spins | Length |   J |   Q |   K |   A | COIN | GEM | DRAGON | EIGHT | WILD | SCATTER |
| ---------- | -----: | --: | --: | --: | --: | ---: | --: | -----: | ----: | ---: | ------: |
| R1         |     48 |   7 |   7 |   6 |   6 |    6 |   5 |      5 |     4 |    1 |       1 |
| R2         |     52 |   7 |   7 |   7 |   7 |    6 |   6 |      5 |     4 |    2 |       1 |
| R3         |     56 |   7 |   8 |   7 |   7 |    7 |   6 |      6 |     5 |    2 |       1 |
| R4         |     52 |   7 |   7 |   7 |   7 |    6 |   6 |      5 |     4 |    2 |       1 |
| R5         |     48 |   7 |   7 |   6 |   6 |    6 |   5 |      5 |     4 |    1 |       1 |

## Reconciled result

Seed 2026, 1,000,000 paid spins. All seven required checkpoints were captured from one cumulative run.

| Measure                                          |                   Result |
| ------------------------------------------------ | -----------------------: |
| Exact initial-board line RTP                     |               69.641590% |
| Simulated initial-board line RTP                 |               69.354460% |
| Simulated cascade-stage RTP                      |               17.651900% |
| Simulated free-spin RTP excluding cascade stages |                8.682200% |
| Scatter direct-pay RTP                           |                       0% |
| Credited total RTP                               |               95.688560% |
| 95% confidence interval                          |    95.063458%–96.313662% |
| Award frequency                                  |               29.440600% |
| Exact feature frequency                          | 0.990348% (1 in 100.975) |
| Simulated feature frequency                      |  1.007800% (1 in 99.226) |
| Average feature length                           |                 9.146458 |
| Feature p95 / maximum                            |                  11 / 13 |
| Base / free-spin cascade rate                    |  28.697000% / 32.560915% |
| Average cascades when triggered                  |                 1.237652 |
| Maximum cascade depth                            |                        8 |
| Standard deviation                               |   3.189294 bet multiples |
| Maximum observed win                             |     737 credits (147.4×) |
| Cap applications                                 |                        0 |

The additive component identity is initial board + all later cascade stages + non-cascade free-spin awards + direct Scatter awards = uncapped total. The full legacy free-spin total (10.694860%) includes 2.012660% of free-spin cascade awards and is retained only as a compatibility metric.

## Enumeration timing and integrity

- Cold structural cache rebuild: 2.10 ms.
- Paytable-priced exact initial-board recalculation: 131.77 ms.
- Warm structural-cache load: 1.53 ms.
- Structural and payout SHA-256 fingerprints are independent; report generation rejects stale hybrid data.

## Previous-profile comparison

| Measure                         | Previous balanced-base-v1 | Production 20-line v1 |
| ------------------------------- | ------------------------: | --------------------: |
| Symbols / paylines              |                     7 / 5 |               10 / 20 |
| Reel lengths                    |            30/30/30/30/30 |        48/52/56/52/48 |
| Credited RTP                    |                95.065000% |            95.688560% |
| Award frequency                 |                27.857600% |            29.440600% |
| Feature frequency               |                 0.856900% |             1.007800% |
| Average feature length          |                  9.280079 |              9.146458 |
| Base cascade rate               |                27.108800% |            28.697000% |
| Free-spin cascade rate          |                32.490789% |            32.560915% |
| Average cascades when triggered |                  1.230671 |              1.237652 |
| Standard deviation              |                 2.589568× |             3.189294× |
| Maximum observed win            |               534 credits |           737 credits |
