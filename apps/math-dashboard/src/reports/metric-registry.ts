import type { DashboardAnalysisReport } from '../types/simulation-report.js';

export type MetricUnit = 'percent' | 'multiplier' | 'credits' | 'count' | 'frequency' | 'decimal';

export interface MetricDefinition {
  readonly id: string;
  readonly labelKey: string;
  readonly descriptionKey?: string;
  readonly unit: MetricUnit;
  readonly precision?: number;
  readonly source: string;
  readonly getter: (report: DashboardAnalysisReport) => number | null;
}

const metric = (
  id: string,
  labelKey: string,
  unit: MetricUnit,
  source: string,
  getter: MetricDefinition['getter'],
  descriptionKey?: string,
  precision?: number,
): MetricDefinition => ({
  id,
  labelKey,
  unit,
  source,
  getter,
  ...(descriptionKey === undefined ? {} : { descriptionKey }),
  ...(precision === undefined ? {} : { precision }),
});

export const METRIC_REGISTRY = Object.freeze({
  rtp: metric('rtp', 'creditedRtp', 'percent', 'metrics.rtp', (r) => r.metrics.rtp, 'tipRtp'),
  winningSpinFrequency: metric(
    'winningSpinFrequency',
    'winningFrequency',
    'percent',
    'metrics.winningSpinFrequency',
    (r) => r.metrics.winningSpinFrequency,
    'tipWinningFrequency',
  ),
  averageWinPerWinningSpin: metric(
    'averageWinPerWinningSpin',
    'averageWin',
    'multiplier',
    'metrics.averageWinPerWinningSpin',
    (r) => r.metrics.averageWinPerWinningSpin,
  ),
  featureFrequency: metric(
    'featureFrequency',
    'featureFrequency',
    'frequency',
    'metrics.featureFrequency',
    (r) => r.metrics.featureFrequency,
    'tipFeatureFrequency',
  ),
  baseGameTumbleTriggerFrequency: metric(
    'baseGameTumbleTriggerFrequency',
    'baseTumbleFrequency',
    'percent',
    'metrics.baseGameTumbleTriggerFrequency',
    (r) => r.metrics.baseGameTumbleTriggerFrequency,
    'tipBaseTumble',
  ),
  freeGameTumbleTriggerFrequency: metric(
    'freeGameTumbleTriggerFrequency',
    'freeTumbleFrequency',
    'percent',
    'metrics.freeGameTumbleTriggerFrequency',
    (r) => r.metrics.freeGameTumbleTriggerFrequency,
    'tipFreeTumble',
  ),
  averageBaseGameTumbleRoundsPerTrigger: metric(
    'averageBaseGameTumbleRoundsPerTrigger',
    'baseTumbleAverage',
    'decimal',
    'metrics.averageBaseGameTumbleRoundsPerTrigger',
    (r) => r.metrics.averageBaseGameTumbleRoundsPerTrigger,
  ),
  averageFreeGameTumbleRoundsPerTrigger: metric(
    'averageFreeGameTumbleRoundsPerTrigger',
    'freeTumbleAverage',
    'decimal',
    'metrics.averageFreeGameTumbleRoundsPerTrigger',
    (r) => r.metrics.averageFreeGameTumbleRoundsPerTrigger,
  ),
  bathalaToNextWinConversionRate: metric(
    'bathalaToNextWinConversionRate',
    'bathalaConversion',
    'percent',
    'metrics.bathalaToNextWinConversionRate',
    (r) => r.metrics.bathalaToNextWinConversionRate,
    'bathalaConversionTip',
  ),
  multiplierAppearanceFrequency: metric(
    'multiplierAppearanceFrequency',
    'multiplierFrequency',
    'percent',
    'metrics.multiplierAppearanceFrequency',
    (r) => r.metrics.multiplierAppearanceFrequency,
  ),
  averageMultiplierValue: metric(
    'averageMultiplierValue',
    'averageMultiplier',
    'multiplier',
    'metrics.averageMultiplierValue',
    (r) => r.metrics.averageMultiplierValue,
  ),
  freeGameWinContribution: metric(
    'freeGameWinContribution',
    'freeContribution',
    'percent',
    'metrics.freeGameWinContribution',
    (r) => r.metrics.freeGameWinContribution,
    'tipFeatureContribution',
  ),
  baseGameWinContribution: metric(
    'baseGameWinContribution',
    'baseContribution',
    'percent',
    'metrics.baseGameWinContribution',
    (r) => r.metrics.baseGameWinContribution,
  ),
  multiplierRtpContribution: metric(
    'multiplierRtpContribution',
    'totalMultiplierRtp',
    'percent',
    'derived: multiplier component payouts / totalBet',
    (r) => {
      const base = r.metrics.components.baseGameMultiplierUplift;
      const free = r.metrics.components.freeGameMultiplierUplift;
      const totalBet = r.metrics.totalBet;
      return base === null || free === null || totalBet === null || totalBet <= 0
        ? null
        : (base + free) / totalBet;
    },
    'tipMultiplierRtp',
  ),
  maximumObservedWin: metric(
    'maximumObservedWin',
    'maximumWin',
    'multiplier',
    'metrics.maximumObservedWin',
    (r) => r.metrics.maximumObservedWin,
  ),
  coefficientOfVariation: metric(
    'coefficientOfVariation',
    'cv',
    'decimal',
    'metrics.coefficientOfVariation',
    (r) => r.metrics.coefficientOfVariation,
    'tipCv',
  ),
  averageFreeGamesPlayed: metric(
    'averageFreeGamesPlayed',
    'averageFreeGames',
    'decimal',
    'metrics.averageFreeGamesPlayed',
    (r) => r.metrics.averageFreeGamesPlayed,
  ),
  averageEndingFreeGameMultiplier: metric(
    'averageEndingFreeGameMultiplier',
    'endingMultiplier',
    'multiplier',
    'metrics.averageEndingFreeGameMultiplier',
    (r) => r.metrics.averageEndingFreeGameMultiplier,
  ),
  tail100: metric(
    'tail100',
    'tail100',
    'percent',
    'metrics.tails[threshold=100].frequency',
    (r) => r.metrics.tails.find((tail) => tail.threshold === 100)?.frequency ?? null,
  ),
  tail250: metric(
    'tail250',
    'tail250',
    'percent',
    'metrics.tails[threshold=250].frequency',
    (r) => r.metrics.tails.find((tail) => tail.threshold === 250)?.frequency ?? null,
  ),
  tail500: metric(
    'tail500',
    'tail500',
    'percent',
    'metrics.tails[threshold=500].frequency',
    (r) => r.metrics.tails.find((tail) => tail.threshold === 500)?.frequency ?? null,
  ),
  tail1000: metric(
    'tail1000',
    'tail1000',
    'percent',
    'metrics.tails[threshold=1000].frequency',
    (r) => r.metrics.tails.find((tail) => tail.threshold === 1000)?.frequency ?? null,
  ),
} satisfies Record<string, MetricDefinition>);

export type MetricId = keyof typeof METRIC_REGISTRY;
export const metricDefinition = (id: MetricId): MetricDefinition => METRIC_REGISTRY[id];
