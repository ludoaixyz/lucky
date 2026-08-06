# LUCKY888

LUCKY888 is a production-oriented workspace for an HTML5 slot-machine prototype and its supporting mathematics. Its original emblem depicts three intertwined Chinese dragons. It contains a responsive Phaser 3 shell, editable CSV/JSON math sheets, deterministic TypeScript mathematics, validation, simulation, tests, and documentation.

> **Non-monetary prototype:** LUCKY888 uses simulated credits with no cash value. It is not a real-money gambling product and has no wagering accounts, deposits, withdrawals, purchases, cryptocurrency, payments, or cash-out path.

## Status

The game runs a complete Scatter-anywhere free-spin flow with bounded retriggers. The active balanced engineering profile is deliberately reviewed against provisional bands, but it is **not mathematically finalized or certified**; independent verification and target approval remain outstanding.

## Architecture

`math/source` is the human-edited source of truth. Root scripts validate and compile it into ignored runtime artifacts. `@lucky/math-engine` owns RNG, reel selection, evaluation, caps, and simulation. The Phaser client consumes resolved `SpinResult` objects and never calculates awards in animation code.

```text
math/source -> validation/compiler -> math/generated -> game runtime
                              \----> simulator -> math/reports
shared-types <---- math-engine <---- game orchestration -> Phaser presentation
```

## Directory map

```text
.github/                 CI, issue forms, and pull-request template
apps/game/               Vite + Phaser browser application
packages/math-engine/    Pure evaluation, RNG, validation, and simulation
packages/shared-types/   Cross-workspace data contracts
math/source/             Editable CSV/JSON source sheets
math/schemas/            JSON Schemas for contracts
math/generated/          Compiled runtime data (ignored except .gitkeep)
math/reports/            Named tracked evidence plus ignored bulk reports
math/templates/          PAR-sheet template
scripts/                 Compiler, validator, and simulator entry points
docs/                    Architecture, math, contracts, workflow, and policy
tests/fixtures/          Repository-wide fixture space
```

## Prerequisites and Windows setup

- Node.js 22 LTS or a newer supported LTS (`.nvmrc` specifies 22)
- npm, included with Node
- Git

On Windows with nvm-windows, run `nvm install 22`, `nvm use 22`, then confirm `node --version`. Clone or open `C:\Users\ludoa\develop\lucky`; do not create another nested folder. If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

## Install and develop

```bash
npm install
npm run dev
```

`dev` compiles current math sheets, then starts Vite. Open the printed local URL. Use the Spin button or Space. The fixed illustrative bet is five credits and starting credits are simulated.

For repeatable local presentation checks, append an integer `?seed=` query (for example, `?seed=13`). This is a development-only deterministic RNG control, not production randomness.

## Commands

| Command                                               | Purpose                                                |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                         | Compile math data and start the game                   |
| `npm run build`                                       | Compile math data and create `apps/game/dist`          |
| `npm test` / `npm run test:watch`                     | Run tests once / watch                                 |
| `npm run lint` / `npm run lint:fix`                   | Check / fix lint issues                                |
| `npm run format` / `npm run format:check`             | Write / check formatting                               |
| `npm run typecheck`                                   | Strict TypeScript project build check                  |
| `npm run math:validate`                               | Validate source math data with located errors          |
| `npm run math:build`                                  | Compile source sheets without changing them            |
| `npm run math:enumerate`                              | Exact stop/finite-feature enumeration and PAR report   |
| `npm run math:balance`                                | Aggregate five deterministic million-spin balance runs |
| `npm run math:simulate -- --spins 100000 --seed 2026` | Run a repeatable simulation                            |
| `npm run validate`                                    | Format, lint, types, math, tests, and production build |
| `npm run clean`                                       | Remove workspace build output                          |

The production output is static and uses a GitHub Pages-compatible `/lucky/` base during GitHub Actions builds. No deployment or credentials are configured.

## Math-sheet workflow

1. Edit only files in `math/source/`, retaining headers and stable IDs.
2. Run `npm run math:validate`; errors name the file, record/row, field, value, and rule.
3. Run `npm run math:build` to write fingerprinted runtime data. This never rewrites sources.
4. Run `npm run math:enumerate` for exact finite-state feature expectations and the configuration PAR.
5. Test or simulate: `npm run math:simulate -- --spins=10000 --seed=42`.
6. Review ignored bulk output in `math/reports/`; the named configuration PAR is intentionally tracked.

CSV files can be edited in Excel, LibreOffice, or Google Sheets. Import and export as UTF-8 comma-separated values; keep the first row, column order, exact IDs, integer credit fields, and leading text unchanged. Disable automatic date conversion where possible. JSON percentages/rates are decimal ratios (`0.96` means 96%), never ambiguous whole percentages.

## Terms

- **Theoretical RTP:** expected payout divided by wager from exact probability weighting or enumeration.
- **Hit frequency:** probability that one paid spin, including its resulting feature, returns any positive award.
- **Bonus frequency:** probability that a configured feature trigger occurs.
- **Volatility:** dispersion of spin returns, described here with variance and standard deviation of bet multiples.
- **Maximum win:** the cap applied once to all base and feature payout arising from one paid spin.
- **Pay distribution:** probabilities/counts grouped by payout multiple buckets.
- **Confidence interval:** simulation-based range around an estimate; the included 95% RTP interval uses a normal approximation and is not an exact guarantee.
- **Deterministic seed:** integer that reproduces the development PRNG sequence. This PRNG supports tests and offline simulations; it is not regulatory-grade production randomness.

Monte Carlo values are estimates and depend on seed and sample size. They do not establish final game performance. See [the math model](docs/math-model.md) and [data contracts](docs/data-contracts.md).

## Contribution and Git workflow

Create a short-lived branch from `main`, make focused commits, update source/docs/tests together, and run `npm run validate` before opening a pull request. Do not commit secrets, dependency folders, generated reports, or bulk raw results. Reviews should verify engine/presentation separation and manually check material math changes. Use conventional commit-style messages where practical; merge through reviewed pull requests without rewriting shared history.

## Responsible design and deployment

The allowed scope is simulated credits only. Autoplay, rapid spin, purchases, loss-chasing prompts, misleading claims, and real-money infrastructure are excluded. See [responsible design](docs/responsible-design.md). A future deployment may publish `apps/game/dist` to a static host such as GitHub Pages after an explicit deployment workflow is reviewed.

Licensed under the [MIT License](LICENSE).
