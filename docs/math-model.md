# Math model

For outcome `i` with probability `p_i`, bet `b`, and payout `w_i`, theoretical RTP is `Σ(p_i × w_i) / b`. Hit frequency is `Σ p_i` over positive-paying outcomes; bonus frequency is the same sum over feature-triggering outcomes. Returns use payout multiples `x_i = w_i / b`. Mean return is `μ = Σx/n`; population variance is `Σ(x-μ)²/n`; standard deviation is its square root.

Paylines evaluate left-to-right from reel one. A wild substitutes for the first regular symbol on a line; scatters are counted anywhere in the visible window. Integer credit awards are aggregated, then the maximum-win cap is applied. Floating point is used only for statistical ratios, never equality of awards or credit balances.

Exact theoretical enumeration visits every stop combination and probability weight; it can produce exact expectations when the complete feature state space is tractable. Monte Carlo simulation samples outcomes from a seeded generator. It is reproducible but approximate. The report's 95% RTP confidence interval is `mean ± 1.96 × s/√n`, clamped to zero below; serial dependence or complex features may require a more sophisticated method.

The seeded Mulberry32 implementation exists for tests and offline study, not production or regulatory randomness. Report distributions must contain finite, non-negative values. Starter data and resulting metrics are illustrative, not approved performance targets.
