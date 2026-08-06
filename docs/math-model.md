# LUCKY888 math model

All internal RTP values are decimal ratios: `1.0` is 100%, `0.96` is 96%, and `1.6` is 160%. UI and reports use the shared formatter and multiply by 100 exactly once. An empty session displays `0.00%`.

For one paid spin, let `B_l` be uncapped line payout, `B_s` direct Scatter payout, `F` all free-spin payout, `W` the five-credit wager, and `C` the 5,000-credit maximum. Uncapped base line RTP is `E[B_l]/W`; uncapped base Scatter RTP is `E[B_s]/W` (currently zero); uncapped feature RTP is `E[F]/W`; uncapped total RTP is their sum. Credited RTP is `E[min(B_l + B_s + F, C)]/W`.

The cap scope is `paid-spin-including-feature` and is applied exactly once after the complete bounded feature. Reports never allocate cap reduction to the feature and call that mathematical feature RTP.

Five fixed paylines evaluate consecutive symbols left-to-right from reel 1. Only the highest configured award pays per line; nested awards do not accumulate, while different paylines do. Wild substitutes only for configured regular IDs, never Scatter. All-Wild is no-pay. Scatter is counted once from the final visible window, never substitutes, and pays no direct credits.

Exact enumeration covers every base stop combination and uses finite memoized state equations for uncapped feature expectation. Because the aggregate payout-tail state is expensive, credited RTP is explicitly a deterministic Monte Carlo estimate. Simulation volatility uses credited paid-spin return multiples, with one wager per complete paid spin and feature.

The provisional profile targets 94%–97% credited RTP, a feature about once per 80–150 spins, 9–14 average feature spins, p95 below 30, 20%–35% base hit rate, and effectively zero normal cap hits. These are engineering bands, not certification.
