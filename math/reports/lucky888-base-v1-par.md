# Lucky888 base v1 PAR report

## Document identity

- Game version: 0.1.0
- Configuration: illustrative-default-v1
- Runtime schema: 1.0.0
- Bonus schema: 1.1.0
- Exact method: finite-state exact enumeration (Method A), uncapped return moments
- Paid-spin combinations: 248,832
- Source SHA-256: `182b6865e8834258d7e4abc058d2e0cb2baa3a6143848ff058c3c69fa1b25490`

This is an engineering mathematics report, not a regulatory certification.

## Reel strips

| Reel | Length | A | K | Q | J | GEM | WILD | SCATTER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12 | 3 | 2 | 2 | 2 | 1 | 1 | 1 |
| 2 | 12 | 2 | 3 | 2 | 2 | 1 | 1 | 1 |
| 3 | 12 | 2 | 2 | 3 | 2 | 1 | 1 | 1 |
| 4 | 12 | 2 | 2 | 2 | 3 | 1 | 1 | 1 |
| 5 | 12 | 3 | 2 | 2 | 2 | 1 | 1 | 1 |

## Paytable

| Symbol | Match count | Award credits |
| --- | ---: | ---: |
| A | 3 | 4 |
| A | 4 | 10 |
| A | 5 | 25 |
| K | 3 | 5 |
| K | 4 | 12 |
| K | 5 | 34 |
| Q | 3 | 7 |
| Q | 4 | 17 |
| Q | 5 | 42 |
| J | 3 | 8 |
| J | 4 | 21 |
| J | 5 | 63 |
| GEM | 3 | 17 |
| GEM | 4 | 63 |
| GEM | 5 | 170 |

## Paylines

Rows are zero-based from the top.

| Payline | Reel rows |
| --- | --- |
| L1 | 1, 1, 1, 1, 1 |
| L2 | 0, 0, 0, 0, 0 |
| L3 | 2, 2, 2, 2, 2 |
| L4 | 0, 1, 2, 1, 0 |
| L5 | 2, 1, 0, 1, 2 |

## Scatter and free-spin rules

SCATTER is counted anywhere in the full 5x3 window. It does not substitute and has no direct credit pay. Free spins use the base strips and paytable at 1x. The maximum is 100 played free spins and 20 successful retriggers per paid spin.

| Trigger Scatters | Initial free spins |
| ---: | ---: |
| 3 | 8 |
| 4 | 10 |
| 5 | 12 |

| Free-spin Scatters | Retriggered free spins |
| ---: | ---: |
| 3 | 5 |
| 4 | 8 |
| 5 | 10 |

## Exact return and frequency

| Measure | Exact result |
| --- | ---: |
| Base line RTP | 89.148502% |
| Base Scatter RTP | 0.000000% |
| Free-spin RTP | 175.373722% |
| Total uncapped RTP | 264.522224% |
| Uncapped total RTP | 264.522224% |
| Feature trigger frequency | 10.351563% |
| Base hit frequency | 31.875322% |
| Feature-inclusive hit frequency | 40.493656% |
| Initial free spins / paid spin | 0.861328 |
| Total free spins / paid spin | 1.967209 |
| Total free spins / trigger | 19.003980 |
| Retriggers / trigger | 1.955403 |

| Scatter count | Exact paid-spin frequency |
| ---: | ---: |
| 3 | 8.789062% |
| 4 | 1.464844% |
| 5 | 0.097656% |

The exact feature expectation memoizes the bounded state (remaining spins, played spins, retrigger count). All feature return is divided by the original paid wager; free spins add no wager. Return moments are explicitly uncapped: the aggregate-cap tail is enforced in runtime and Monte Carlo, but is not mislabeled as an exact capped expectation.

## Volatility and payout distribution

The return random variable is the total capped payout resulting from one paid spin, including its entire feature, divided by the 5-credit bet. Exact variance is 57.203517 bet-multiple squared and standard deviation is 7.563301 bet multiples.

| Paid-spin payout | Exact | Simulation |
| --- | ---: | ---: |
| 0x | 59.506344% | 59.310000% |
| (0,1)x | 4.954622% | 5.002000% |
| [1,5)x | 22.284205% | 22.468000% |
| [5,20)x | 10.128185% | 10.142000% |
| 20x+ | 3.126644% | 3.078000% |

## Maximum win

The 5000-credit maximum applies once to the aggregate base plus feature payout from one paid spin. The maximum reachable base result is 275 credits; the feature-inclusive uncapped maximum under configured limits is 25086 credits; the credited maximum is 5000 credits. Cap changes exact RTP: yes.

## Deterministic simulation comparison

Simulation uses 100,000 paid spins, seed 2026. Each trial includes the complete feature but only one wager.

| Measure | Exact | Simulation |
| --- | ---: | ---: |
| Base RTP | 89.148502% | 89.019600% |
| Feature RTP | 175.373722% | 173.799000% |
| Total RTP (exact uncapped / simulated capped) | 264.522224% | 262.818600% |
| Trigger frequency | 10.351563% | 10.363000% |
| Total free spins / trigger | 19.003980 | 18.698253 |

Simulation total-RTP 95% confidence interval: 258.181421% to 267.455779%. Deterministic seeded RNG is for reproducibility and is not a certified production RNG.

## Assumptions and open decisions

- Scatter has no direct credit payout, so base Scatter RTP is zero.
- Base and free spins share strips and paytable because alternate assets are disabled.
- The fixed-payline, left-to-right base model is unchanged.
- Exact cap-tail expectation remains unresolved; use the capped simulation estimate rather than calling the exact uncapped moment a credited theoretical RTP.
- Product approval, target RTP selection, and regulatory validation remain outside this prototype report.
