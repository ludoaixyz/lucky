# LUCKY888 simulation report

> Provisional engineering simulation. This report does not claim certification.

## Identity and methodology

- Game: LUCKY888 (`lucky888`)
- Game version: 0.3.0
- Configuration ID: `lucky888-balanced-base-v1`
- Source SHA-256: `5c4cb470e9ca5ac3d610d80d883f92cc26e9ff1f88775da47e542bf52ab15f96`
- Methodology: deterministic Monte Carlo
- Exact enumeration loaded: yes
- Seed: 2026
- Paid spins: 1,000,000
- Bet: 5 credits
- Total wagered: 5,000,000 credits

## RTP and frequencies

| Measure | Result |
| --- | ---: |
| Uncapped base line RTP | 88.270340% |
| Uncapped Scatter RTP | 0.000000% |
| Uncapped feature RTP | 7.102020% |
| Uncapped total RTP | 95.372360% |
| Credited total RTP | 95.372360% |
| Cap reduction | 0 credits (0.000000%) |
| 95% confidence interval | 94.906411%–95.838309% |
| Base hit frequency | 32.739900% |
| Feature-inclusive hit frequency | 33.496700% |
| Feature trigger frequency | 0.864900% (1 in 115.620) |

| Triggering Scatters | Frequency per paid spin |
| ---: | ---: |
| 3 | 0.815900% |
| 4 | 0.048100% |
| 5 | 0.000900% |

## Feature length

| Measure | Result |
| --- | ---: |
| Average initial free spins / trigger | 9.115389 |
| Average total free spins / trigger | 9.286738 |
| Average retriggers / trigger | 0.081512 |
| Median | 9 |
| p75 | 9 |
| p90 | 11 |
| p95 | 11 |
| p99 | 13 |
| Maximum feature length | 17 |
| Feature-cap hit frequency | 0.00000000% |

## Volatility

The return random variable is credited payout from one paid spin and its complete feature, divided by the paid wager.

| Measure | Result |
| --- | ---: |
| Variance | 5.651502 |
| Standard deviation | 2.377289 |
| Standard error | 0.002377 |
| Maximum observed payout | 387 credits |

## Payout distribution

| Payout multiple | Count | Probability |
| --- | ---: | ---: |
| 0x | 665,033 | 66.503300% |
| (0,1)x | 56,451 | 5.645100% |
| [1,5)x | 235,980 | 23.598000% |
| [5,20)x | 41,196 | 4.119600% |
| 20x+ | 1,340 | 0.134000% |

## Reconciliation checks

Tolerance is zero for integer-credit identities and 1e-12 for probability identities. Report generation fails if any check exceeds its tolerance.

| Check | Actual | Expected | Difference | Status |
| --- | ---: | ---: | ---: | --- |
| total-wager | 5000000.000000000000 | 5000000.000000000000 | 0.000000000000 | PASS |
| uncapped-components | 4768618.000000000000 | 4768618.000000000000 | 0.000000000000 | PASS |
| credited-plus-cap-reduction | 4768618.000000000000 | 4768618.000000000000 | 0.000000000000 | PASS |
| payout-bucket-probabilities | 1.000000000000 | 1.000000000000 | 0.000000000000 | PASS |
| scatter-trigger-frequencies | 0.008649000000 | 0.008649000000 | 0.000000000000 | PASS |

## Target comparison

| Measure | Result | Target band | Status |
| --- | ---: | --- | --- |
| Credited RTP | 95.372360% | 94%–97% | PASS |
| Feature frequency (paid spins per trigger) | 115.620 | 80–150 | PASS |
| Average feature length | 9.287 | 9–14 | PASS |
| p95 feature length | 11.000 | <30 | PASS |
| Feature-cap hit frequency | 0.000000% | effectively zero | PASS |
