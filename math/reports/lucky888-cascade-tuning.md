# LUCKY888 cascade tuning report

> Engineering Monte Carlo evaluation only; no certification claim.

## Outcome

The accepted source profile returns **95.0650% credited RTP** over 1,000,000 paid spins with deterministic seed 2026. Cascades remain enabled and mechanically visible. The change is confined to two symbols on the base-game reel strips; the cascade engine, free-spin strips, paytable, bonus configuration, SCATTER semantics, and WILD substitution rules are unchanged.

## Candidate log

| Candidate | Sample | Credited RTP | Cascade RTP | Cascade rate | Feature frequency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 1,000,000 | 123.4835% | 25.1670% | 32.7133% | 1 in 117.855 |
| C1: remove second WILD from base R1-R3 | 100,000 | 86.1116% | 15.5086% | 25.3281% | 1 in 115.473 |
| C2: restore second WILD on base R3 | 100,000 | 97.8484% | 18.4950% | 27.8102% | 1 in 113.122 |
| **Accepted C2** | **1,000,000** | **95.0650%** | **17.7418%** | **27.5053%** | **1 in 116.700** |

The 100,000-spin candidates were used only for iteration. Acceptance is based on the required 1,000,000-spin seed-2026 run and the independent-seed checks below.

## Before / after

| Metric | Before | After |
| --- | ---: | ---: |
| Credited RTP | 123.48% | 95.0650% |
| Base RTP, including base cascades | 114.34% | 85.9775% |
| Feature RTP | 9.15% | 9.0875% |
| Cascade RTP contribution | 25.17% | 17.7418% |
| Cascade rate | 32.71% | 27.5053% |
| Avg cascades when triggered | 1.27 | 1.2307 |
| Avg cascades per paid spin | 0.45 | 0.3654 |
| Maximum cascade depth | 9 | 8 |
| Hit frequency | 33.44% | 27.8576% |
| Net-return frequency | ~28.9% | 23.4254% |
| Feature frequency | 1 in 117.9 | 1 in 116.700 |
| Avg feature length | 9.27 | 9.2801 |
| Feature-length p95 | 11 | 11 |
| Max observed win | 431 credits | 534 credits |
| Cap applications | 0 | 0 |

The total-RTP target is primary. The accepted cascade contribution remains above the suggested 5%-10% tuning region, but it fell by 7.43 percentage points without suppressing the mechanic: cascade rate remains 27.51%, average depth when triggered remains above one, and chains reached depth eight. Further suppression would require a more disruptive reel/paytable redesign and was not justified once the 1M result and independent seeds centered robustly on 95%.

## Exact source changes

Only `math/source/reel-strips.csv` changed for this tuning pass.

| Reel | Symbol | Before | After |
| --- | --- | ---: | ---: |
| R1 | A | 9 | 10 |
| R1 | WILD | 2 | 1 |
| R2 | K | 9 | 10 |
| R2 | WILD | 2 | 1 |

- R1 stop 23 changed from WILD to A.
- R2 stop 23 changed from WILD to K.
- R3-R5 symbol counts and ordering are unchanged.
- Every base reel retains one SCATTER at its original stop; SCATTER trigger probability therefore remains stable.
- `free-spin-reel-strips.csv` is unchanged: each free-spin reel retains two WILDs and one SCATTER.
- `paytable.csv` is unchanged by this tuning pass; all current integer awards and value ladders are preserved.
- `bonus-config.json` is unchanged; initial awards remain 9/11/13 and retriggers remain 2/4/6.

## Cascade-depth analysis

The accepted 1M/seed-2026 run attributes cascade payout as follows:

| Additional cascade board | Payout credits | RTP contribution |
| --- | ---: | ---: |
| Stage 1 | 708,546 | 14.1709% |
| Stage 2 | 147,392 | 2.9478% |
| Stage 3 | 25,832 | 0.5166% |
| Stage 4+ | 5,320 | 0.1064% |
| **Total** | **887,090** | **17.7418%** |

Most cascade return comes from the first refill board, not rare extended chains. The detailed machine-readable result is in `cascade-depth-2026-1000000.json`.

## Multi-seed sanity check

Each independent seed used 500,000 paid spins with the accepted source profile.

| Seed | Credited RTP | Base RTP | Feature RTP | Cascade RTP | Cascade rate | Hit frequency | Feature frequency | Avg feature length | p95 | Max win |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 94.8985% | 85.9110% | 8.9876% | 17.4004% | 27.5276% | 27.9136% | 1 in 115.714 | 9.2865 | 11 | 475 |
| 2028 | 94.8554% | 85.9085% | 8.9469% | 17.7418% | 27.4335% | 27.7832% | 1 in 118.203 | 9.2634 | 11 | 374 |
| 2029 | 95.1585% | 86.0252% | 9.1333% | 17.8193% | 27.4652% | 27.8332% | 1 in 114.207 | 9.2755 | 11 | 365 |

The results cluster from 94.8554% to 95.1585%, with stable feature frequency, feature length, hit frequency, and cascade behavior. No seed applied the 5,000-credit cap.

## Reconciliation and production workflow

The accepted durable report passes all available checks with zero difference where an exact reconciliation is required:

- total wager;
- uncapped payout components;
- credited payout plus cap reduction;
- payout distribution probabilities;
- SCATTER trigger frequencies;
- cascade payout components;
- cascade step components;
- cascade spin components.

The production workflow completed successfully:

```text
npm run math:validate
npm run math:build
npm run math:enumerate
npm run math:report -- --spins 1000000 --seed 2026
```

Exact enumeration reported `NOT APPLICABLE`, as required for the cascade-enabled profile. The generated runtime source hash is `f5749eeaf29943c00ca191ccbb9fa76b14242232117e4336d3bf317bfc2f8da9`, and the durable simulation report was consumed successfully by the math-dashboard production build.
