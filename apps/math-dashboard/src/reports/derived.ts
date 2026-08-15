import type { SimulationReport, TailMetric } from '../types/simulation-report.js';

export interface DerivedAnalytics {
  readonly featureOneInN: number | null;
  readonly baseRegularRtp: number;
  readonly baseScatterRtp: number;
  readonly baseMultiplierRtp: number;
  readonly freeRegularRtp: number;
  readonly freeScatterRtp: number;
  readonly freeMultiplierRtp: number;
  readonly totalMultiplierRtp: number;
  readonly totalRegularRtp: number;
  readonly totalScatterRtp: number;
  readonly ciWidth: number;
  readonly ciMargin: number;
  readonly bathalaActivationsPerPaidSpin: number;
  readonly bathalaSymbolsRemovedPerPaidSpin: number;
  readonly highestObservedTailThreshold: number | null;
  readonly highestObservedTailCount: number;
}

const divide = (value: number, denominator: number): number =>
  denominator > 0 ? value / denominator : 0;

export const componentRtp = (report: SimulationReport, credits: number): number =>
  divide(credits, report.metrics.totalBet);

export const frequencyOdds = (frequency: number): number | null =>
  frequency > 0 ? 1 / frequency : null;

export function deriveAnalytics(report: SimulationReport): DerivedAnalytics {
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
      c.baseGameMultiplierUplift + c.freeGameMultiplierUplift,
    ),
    totalRegularRtp: componentRtp(report, c.baseGameRegularPayout + c.freeGameRegularPayout),
    totalScatterRtp: componentRtp(report, c.baseGameScatterPayout + c.freeGameScatterPayout),
    ciWidth: m.confidenceInterval95[1] - m.confidenceInterval95[0],
    ciMargin: (m.confidenceInterval95[1] - m.confidenceInterval95[0]) / 2,
    bathalaActivationsPerPaidSpin: divide(m.bathalaActivations, m.totalSpins),
    bathalaSymbolsRemovedPerPaidSpin: divide(
      m.bathalaActivations * m.averageSymbolsRemoved,
      m.totalSpins,
    ),
    highestObservedTailThreshold: highest?.threshold ?? null,
    highestObservedTailCount: highest?.count ?? 0,
  });
}

export function tailAt(report: SimulationReport, threshold: number): TailMetric | null {
  return report.metrics.tails.find((tail) => tail.threshold === threshold) ?? null;
}
