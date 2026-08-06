# LUCKY888 balanced base v1 PAR report

> Provisional engineering mathematics. This is not a regulatory certification.

## Identity

- Game: LUCKY888 (`lucky888`)
- Game version: 0.3.0
- Configuration: lucky888-balanced-base-v1
- Source SHA-256: `5c4cb470e9ca5ac3d610d80d883f92cc26e9ff1f88775da47e542bf52ab15f96`
- Exact methodology: hybrid
- Credited methodology: deterministic Monte Carlo estimate
- Exact paid-stop combinations: 24,300,000

## Reel symbol counts

| Base reel | Length | A | K | Q | J | GEM | WILD | SCATTER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 30 | 9 | 5 | 5 | 5 | 3 | 2 | 1 |
| 2 | 30 | 5 | 9 | 5 | 5 | 3 | 2 | 1 |
| 3 | 30 | 5 | 5 | 9 | 5 | 3 | 2 | 1 |
| 4 | 30 | 5 | 5 | 5 | 9 | 3 | 2 | 1 |
| 5 | 30 | 9 | 5 | 5 | 5 | 3 | 2 | 1 |

| Free-spin reel | Length | A | K | Q | J | GEM | WILD | SCATTER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 30 | 9 | 5 | 5 | 5 | 3 | 2 | 1 |
| 2 | 30 | 5 | 9 | 5 | 5 | 3 | 2 | 1 |
| 3 | 30 | 5 | 5 | 9 | 5 | 3 | 2 | 1 |
| 4 | 30 | 5 | 5 | 5 | 9 | 3 | 2 | 1 |
| 5 | 30 | 9 | 5 | 5 | 5 | 3 | 2 | 1 |

Free spins use alternate configuration `lucky888-free-spins-v1`.

## Payout contracts

- Lines: left-to-right, consecutive from reel 1, highest award per payline, no nested award accumulation; all 5 paylines accumulate.
- Wild: `WILD` substitutes only for A, K, Q, J, GEM; never Scatter; all-Wild rule is `no-pay`; multiplier 1x.
- Scatter: `SCATTER` is counted anywhere from visible symbols, never substitutes, has no direct credit award, and triggers the feature.
- Maximum win: 5000 credits, scope `paid-spin-including-feature`, applied once to base plus the complete feature.

| Base Scatters | Initial free spins |
| ---: | ---: |
| 3 | 9 |
| 4 | 11 |
| 5 | 13 |

| Free-spin Scatters | Added spins |
| ---: | ---: |
| 3 | 2 |
| 4 | 4 |
| 5 | 6 |

## RTP and frequency

Internal RTP values are decimal ratios: 1.0 is 100%. Formatting multiplies by 100 exactly once.

| Measure | Result |
| --- | ---: |
| Exact uncapped base line RTP | 88.101872% |
| Exact uncapped base Scatter RTP | 0.000000% |
| Exact uncapped feature RTP | 6.996542% |
| Exact uncapped total RTP | 95.098414% |
| Simulated credited total RTP | 95.372360% |
| Simulated cap reduction RTP | 0.000000% |
| Exact trigger frequency | 0.856000% |
| Exact base hit frequency | 32.699588% |
| Exact feature-inclusive hit frequency | 33.442971% |
| Exact free spins / trigger | 9.277362 |
| Exact retriggers / trigger | 0.079414 |

| Scatter count | Exact frequency |
| ---: | ---: |
| 3 | 0.810000% |
| 4 | 0.045000% |
| 5 | 0.001000% |

## Feature length and volatility

| Measure | Simulation |
| --- | ---: |
| Median | 9 |
| p75 | 9 |
| p90 | 11 |
| p95 | 11 |
| p99 | 13 |
| Maximum observed | 17 |
| Feature-cap hit frequency | 0.000000% |
| Credited-return standard deviation | 2.377289 bet multiples |

The volatility random variable is credited payout from one paid spin and its complete feature divided by the five-credit paid wager. Free spins add no wager.

| Payout multiple | Exact uncapped | Simulated credited |
| --- | ---: | ---: |
| 0x | 66.557029% | 66.503300% |
| (0,1)x | 5.642262% | 5.645100% |
| [1,5)x | 23.558165% | 23.598000% |
| [5,20)x | 4.108155% | 4.119600% |
| 20x+ | 0.134388% | 0.134000% |

## Maximum and cap

- Maximum reachable base payout: 543 credits.
- Maximum reachable uncapped paid-spin payout under feature limits: 49051 credits.
- Maximum credited payout: 5000 credits.
- Cap is reachable: yes.
- Observed cap applications: 0 of 1,000,000 paid spins.

Exact state equations calculate uncapped feature expectation. The aggregate maximum-win tail is estimated through deterministic Monte Carlo and is not labeled exact.

## Simulation comparison

Seed 2026; 1,000,000 paid spins; credited RTP 95% interval 94.906411% to 95.838309%. The deterministic RNG supports reproducible engineering tests and is not production-approved.

## Remaining decisions

- Independent math review and target-profile approval remain outstanding.
- Exact sparse cap-tail calculation may be added if the payout-state cost becomes practical.
- Art direction for the original three-dragon emblem remains provisional.
