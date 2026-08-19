import type {
  DashboardAnalysisReport,
  SimulationReport,
  TailMetric,
} from '../types/simulation-report.js';

export interface DerivedAnalytics {
  readonly featureOneInN: number | null;
  readonly baseRegularRtp: number | null;
  readonly baseScatterRtp: number | null;
  readonly baseMultiplierRtp: number | null;
  readonly freeRegularRtp: number | null;
  readonly freeScatterRtp: number | null;
  readonly freeMultiplierRtp: number | null;
  readonly totalMultiplierRtp: number | null;
  readonly totalRegularRtp: number | null;
  readonly totalScatterRtp: number | null;
  readonly ciWidth: number;
  readonly ciMargin: number;
  readonly bathalaActivationsPerPaidSpin: number | null;
  readonly bathalaSymbolsRemovedPerPaidSpin: number | null;
  readonly highestObservedTailThreshold: number | null;
  readonly highestObservedTailCount: number;
}

export interface CompleteDerivedAnalytics extends DerivedAnalytics {
  readonly baseRegularRtp: number;
  readonly baseScatterRtp: number;
  readonly baseMultiplierRtp: number;
  readonly freeRegularRtp: number;
  readonly freeScatterRtp: number;
  readonly freeMultiplierRtp: number;
  readonly totalMultiplierRtp: number;
  readonly totalRegularRtp: number;
  readonly totalScatterRtp: number;
  readonly bathalaActivationsPerPaidSpin: number;
  readonly bathalaSymbolsRemovedPerPaidSpin: number;
}

const divide = (value: number | null, denominator: number | null): number | null =>
  value === null || denominator === null || denominator <= 0 ? null : value / denominator;

const add = (...values: readonly (number | null)[]): number | null =>
  values.some((value) => value === null)
    ? null
    : (values as readonly number[]).reduce((total, value) => total + value, 0);

export function componentRtp(report: SimulationReport, credits: number): number;
export function componentRtp(
  report: DashboardAnalysisReport,
  credits: number | null,
): number | null;
export function componentRtp(
  report: DashboardAnalysisReport,
  credits: number | null,
): number | null {
  return divide(credits, report.metrics.totalBet);
}

export const frequencyOdds = (frequency: number | null): number | null =>
  frequency !== null && frequency > 0 ? 1 / frequency : null;

export function deriveAnalytics(report: SimulationReport): CompleteDerivedAnalytics;
export function deriveAnalytics(report: DashboardAnalysisReport): DerivedAnalytics;
export function deriveAnalytics(report: DashboardAnalysisReport): DerivedAnalytics {
  const m = report.metrics;
  const c = m.components;
  const observed = m.tails.filter((tail) => tail.count > 0);
  const highest = observed.at(-1);
  return Object.freeze({
    featureOneInN: frequencyOdds(m.featureFrequency),
    baseRegularRtp: componentRtp(report, c.baseGameRegularPayout),
    baseScatterRtp: componentRtp(report, c.baseGameScatterPayout),
    baseMultiplierRtp: componentRtp(report, c.baseGameMultiplierUplift),
    freeRegularRtp: componentRtp(report, c.freeGameRegularPayout),
    freeScatterRtp: componentRtp(report, c.freeGameScatterPayout),
    freeMultiplierRtp: componentRtp(report, c.freeGameMultiplierUplift),
    totalMultiplierRtp: componentRtp(
      report,
      add(c.baseGameMultiplierUplift, c.freeGameMultiplierUplift),
    ),
    totalRegularRtp: componentRtp(report, add(c.baseGameRegularPayout, c.freeGameRegularPayout)),
    totalScatterRtp: componentRtp(report, add(c.baseGameScatterPayout, c.freeGameScatterPayout)),
    ciWidth: m.confidenceInterval95[1] - m.confidenceInterval95[0],
    ciMargin: (m.confidenceInterval95[1] - m.confidenceInterval95[0]) / 2,
    bathalaActivationsPerPaidSpin: divide(m.bathalaActivations, m.totalSpins),
    bathalaSymbolsRemovedPerPaidSpin:
      m.bathalaActivations === null || m.averageSymbolsRemoved === null
        ? null
        : divide(m.bathalaActivations * m.averageSymbolsRemoved, m.totalSpins),
    highestObservedTailThreshold: highest?.threshold ?? null,
    highestObservedTailCount: highest?.count ?? 0,
  });
}

export function tailAt(report: DashboardAnalysisReport, threshold: number): TailMetric | null {
  return report.metrics.tails.find((tail) => tail.threshold === threshold) ?? null;
}
