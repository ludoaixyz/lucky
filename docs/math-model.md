# LUCKY888 math model

All internal RTP values are decimal ratios: `1.0` is 100%, `0.96` is 96%, and `1.6` is 160%. UI and reports use the shared formatter and multiply by 100 exactly once. An empty session displays `0.00%`.

For one paid spin, let `B_l` be uncapped line payout, `B_s` direct Scatter payout, `F` all free-spin payout, `W` the five-credit wager, and `C` the 5,000-credit maximum. Uncapped base line RTP is `E[B_l]/W`; uncapped base Scatter RTP is `E[B_s]/W` (currently zero); uncapped feature RTP is `E[F]/W`; uncapped total RTP is their sum. Credited RTP is `E[min(B_l + B_s + F, C)]/W`.

The cap scope is `paid-spin-including-feature` and is applied exactly once after the complete bounded feature. Reports never allocate cap reduction to the feature and call that mathematical feature RTP.

Five fixed paylines evaluate consecutive symbols left-to-right from reel 1. Only the highest configured award pays per line; nested awards do not accumulate, while different paylines do. Wild substitutes only for configured regular IDs, never Scatter. All-Wild is no-pay. Scatter is counted once from the final visible window, never substitutes, and pays no direct credits.

Exact enumeration covers every base stop combination and uses finite memoized state equations for uncapped feature expectation. Because the aggregate payout-tail state is expensive, credited RTP is explicitly a deterministic Monte Carlo estimate. Simulation volatility uses credited paid-spin return multiples, with one wager per complete paid spin and feature.

The provisional profile targets 94%–97% credited RTP, a feature about once per 80–150 spins, 9–14 average feature spins, p95 below 30, 20%–35% base hit rate, and effectively zero normal cap hits. These are engineering bands, not certification.

# Production 20-line profile

The `lucky888-production-20line-v1` profile uses five reels, three visible rows,
20 fixed left-to-right paylines, eight regular symbols, one Wild, and one Scatter.
The paid wager remains five credits: each line receives a normalized 0.25-credit
line bet. Paytable awards are divisible by four, so resolved awards remain integral.
The playable bet slider selects total wager, not credits per line. Each option scales
the five-credit base wager and its 0.25-credit line bet by the same whole multiplier;
the same scaled runtime configuration is used by line evaluation, cascades, free
spins, maximum-win enforcement, credit deduction, and diagnostics.

Base and free-spin reels are independent asymmetric circular strips between 48 and
56 stops. CSV remains the runtime authority. The free-spin strips carry additional
middle-reel Wild exposure and are not aliases or copies of the base strips.

RTP reporting reconciles four non-overlapping components: initial-board line awards,
later cascade-stage awards, direct Scatter awards (zero in this profile), and all
free-spin awards. Their sum is uncapped total RTP; cap reduction then reconciles
uncapped total to credited total RTP.

`npm run math:hybrid` builds or reuses a structural cache keyed only by reel, line,
visible-row, Wild, Scatter, and cascade structural rules. It exactly prices the
initial board and exact Scatter trigger frequency. Paytable, feature-award,
multiplier, and cap changes use a separate payout fingerprint, allowing paytable-only
repricing without rebuilding the structural cache. Variable-length cascades and free
spins remain deterministic Monte Carlo components of the hybrid report.
