# LUCKY888 simulation report

> Provisional engineering simulation. This report does not claim certification.

## Identity and methodology

- Game: LUCKY888 (`lucky888`)
- Game version: 0.3.0
- Configuration ID: `lucky888-balanced-base-v1`
- Source SHA-256: `f5749eeaf29943c00ca191ccbb9fa76b14242232117e4336d3bf317bfc2f8da9`
- Methodology: deterministic Monte Carlo
- Exact enumeration loaded: no
- Seed: 2026
- Paid spins: 1,000,000
- Bet: 5 credits
- Total wagered: 5,000,000 credits

## Cumulative RTP convergence

All checkpoints are immutable snapshots from one seeded cumulative simulation run. The final deterministic monte carlo estimate (exact cascade enumeration unsupported) is 95.065000%.

| Bets | Simulated RTP | Final deterministic Monte Carlo estimate (exact cascade enumeration unsupported) | Deviation | Hit frequency | Bonus frequency | Max win |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 53.0000% | 95.0650% | -42.0650 pp | 16.0000% | 2.0000% | 39 |
| 1,000 | 102.9000% | 95.0650% | 7.8350 pp | 29.1000% | 0.9000% | 181 |
| 10,000 | 102.0900% | 95.0650% | 7.0250 pp | 28.0100% | 0.9600% | 240 |
| 100,000 | 97.8484% | 95.0650% | 2.7834 pp | 28.2030% | 0.8840% | 281 |
| 250,000 | 96.0154% | 95.0650% | 0.9504 pp | 27.9492% | 0.8684% | 441 |
| 500,000 | 95.7840% | 95.0650% | 0.7190 pp | 27.8680% | 0.8670% | 441 |
| 1,000,000 | 95.0650% | 95.0650% | 0.0000 pp | 27.8576% | 0.8569% | 534 |

Results at 100 and 1,000 bets are expected to fluctuate significantly. The 10,000 and 100,000 checkpoints provide an intermediate convergence view; 250,000 and 500,000 help reveal stabilization; and 1,000,000 is the strongest default indicator in this report. A small-sample deviation does not by itself indicate a mathematical defect. The simulation provides empirical validation and convergence evidence, but does not replace exact mathematical verification.

## RTP and frequencies

| Measure | Result |
| --- | ---: |
| Uncapped base line RTP | 85.977540% |
| Uncapped Scatter RTP | 0.000000% |
| Uncapped feature RTP | 9.087460% |
| Uncapped total RTP | 95.065000% |
| Credited total RTP | 95.065000% |
| Cap reduction | 0 credits (0.000000%) |
| 95% confidence interval | 94.557445%–95.572555% |
| Base hit frequency | 27.108800% |
| Feature-inclusive hit frequency | 27.857600% |
| Feature trigger frequency | 0.856900% (1 in 116.700) |

| Triggering Scatters | Frequency per paid spin |
| ---: | ---: |
| 3 | 0.812500% |
| 4 | 0.043200% |
| 5 | 0.001200% |

## Cascades

Approximately 27.5053% of eligible base/free-spin resolutions generated at least one additional board. Cascade-triggering resolutions produced 1.231 additional boards on average. Uncapped cascade-stage awards contributed 17.741800% of paid-wager RTP.

| Measure | Result |
| --- | ---: |
| Spins with cascades | 296,925 |
| Eligible spin resolutions | 1,079,521 |
| Cascade rate | 27.505255% |
| Total additional boards | 365,417 |
| Average additional boards / paid spin | 0.365417 |
| Average additional boards when triggered | 1.230671 |
| Maximum cascade chain | 8 |
| Uncapped cascade payout | 887,090 credits |
| Cascade RTP contribution | 17.741800% |



## Feature length

| Measure | Result |
| --- | ---: |
| Average initial free spins / trigger | 9.106430 |
| Average total free spins / trigger | 9.280079 |
| Average retriggers / trigger | 0.081923 |
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
| Variance | 6.705864 |
| Standard deviation | 2.589568 |
| Standard error | 0.002590 |
| Maximum observed payout | 534 credits |

## Payout distribution

| Payout multiple | Count | Probability |
| --- | ---: | ---: |
| 0x | 721,424 | 72.142400% |
| (0,1)x | 44,322 | 4.432200% |
| [1,5)x | 180,476 | 18.047600% |
| [5,20)x | 51,618 | 5.161800% |
| 20x+ | 2,160 | 0.216000% |

## Reconciliation checks

Tolerance is zero for integer-credit identities and 1e-12 for probability identities. Report generation fails if any check exceeds its tolerance.

| Check | Actual | Expected | Difference | Status |
| --- | ---: | ---: | ---: | --- |
| total-wager | 5000000.000000000000 | 5000000.000000000000 | 0.000000000000 | PASS |
| uncapped-components | 4753250.000000000000 | 4753250.000000000000 | 0.000000000000 | PASS |
| credited-plus-cap-reduction | 4753250.000000000000 | 4753250.000000000000 | 0.000000000000 | PASS |
| payout-bucket-probabilities | 1.000000000000 | 1.000000000000 | 0.000000000000 | PASS |
| scatter-trigger-frequencies | 0.008569000000 | 0.008569000000 | 0.000000000000 | PASS |
| cascade-payout-components | 887090.000000000000 | 887090.000000000000 | 0.000000000000 | PASS |
| cascade-step-components | 365417.000000000000 | 365417.000000000000 | 0.000000000000 | PASS |
| cascade-spin-components | 296925.000000000000 | 296925.000000000000 | 0.000000000000 | PASS |

## Target comparison

| Measure | Result | Target band | Status |
| --- | ---: | --- | --- |
| Credited RTP | 95.065000% | 94%–97% | PASS |
| Feature frequency (paid spins per trigger) | 116.700 | 80–150 | PASS |
| Average feature length | 9.280 | 9–14 | PASS |
| p95 feature length | 11.000 | <30 | PASS |
| Feature-cap hit frequency | 0.000000% | effectively zero | PASS |
