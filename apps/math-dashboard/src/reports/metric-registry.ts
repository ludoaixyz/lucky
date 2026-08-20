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

const componentRatio = (
  report: DashboardAnalysisReport,
  component: keyof DashboardAnalysisReport['metrics']['components'],
): number | null => {
  const value = report.metrics.components[component];
  const totalBet = report.metrics.totalBet;
  return value === null || totalBet === null || totalBet <= 0 ? null : value / totalBet;
};

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
  tumbleTriggerFrequency: metric(
    'tumbleTriggerFrequency',
    'comparisonTumbleTriggerFrequency',
    'percent',
    'metrics.tumbleTriggerFrequency',
    (r) => r.metrics.tumbleTriggerFrequency,
  ),
  tumbleRoundsPerPaidSpin: metric(
    'tumbleRoundsPerPaidSpin',
    'roundsPerSpin',
    'decimal',
    'metrics.tumbleRoundsPerPaidSpin',
    (r) => r.metrics.tumbleRoundsPerPaidSpin,
  ),
  averageTumbleRoundsPerTriggeringSpin: metric(
    'averageTumbleRoundsPerTriggeringSpin',
    'comparisonAverageTumbleRounds',
    'decimal',
    'metrics.averageTumbleRoundsPerTriggeringSpin',
    (r) => r.metrics.averageTumbleRoundsPerTriggeringSpin,
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
  maximumObservedBaseGameTumbleDepth: metric(
    'maximumObservedBaseGameTumbleDepth',
    'maximumBaseTumbleDepth',
    'count',
    'metrics.maximumObservedBaseGameTumbleDepth',
    (r) => r.metrics.maximumObservedBaseGameTumbleDepth,
  ),
  maximumObservedFreeGameTumbleDepth: metric(
    'maximumObservedFreeGameTumbleDepth',
    'maximumFreeTumbleDepth',
    'count',
    'metrics.maximumObservedFreeGameTumbleDepth',
    (r) => r.metrics.maximumObservedFreeGameTumbleDepth,
  ),
  bathalaActivationFrequency: metric(
    'bathalaActivationFrequency',
    'bathalaActivationFrequency',
    'percent',
    'metrics.bathalaActivationFrequency',
    (r) => r.metrics.bathalaActivationFrequency,
  ),
  averageSymbolsRemoved: metric(
    'averageSymbolsRemoved',
    'averageRemoved',
    'decimal',
    'metrics.averageSymbolsRemoved',
    (r) => r.metrics.averageSymbolsRemoved,
  ),
  bathalaToNextWinConversionRate: metric(
    'bathalaToNextWinConversionRate',
    'comparisonBathalaConversion',
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
  averageSummedMultiplierOnMultipliedWins: metric(
    'averageSummedMultiplierOnMultipliedWins',
    'effectiveMultiplier',
    'multiplier',
    'metrics.averageSummedMultiplierOnMultipliedWins',
    (r) => r.metrics.averageSummedMultiplierOnMultipliedWins,
  ),
  maximumSummedMultiplier: metric(
    'maximumSummedMultiplier',
    'maximumMultiplier',
    'multiplier',
    'metrics.maximumSummedMultiplier',
    (r) => r.metrics.maximumSummedMultiplier,
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
  baseRtpShare: metric(
    'baseRtpShare',
    'baseShare',
    'percent',
    'derived: baseGameWinContribution / rtp',
    (r) =>
      r.metrics.rtp !== null && r.metrics.rtp > 0 && r.metrics.baseGameWinContribution !== null
        ? r.metrics.baseGameWinContribution / r.metrics.rtp
        : null,
  ),
  featureRtpShare: metric(
    'featureRtpShare',
    'featureShare',
    'percent',
    'derived: freeGameWinContribution / rtp',
    (r) =>
      r.metrics.rtp !== null && r.metrics.rtp > 0 && r.metrics.freeGameWinContribution !== null
        ? r.metrics.freeGameWinContribution / r.metrics.rtp
        : null,
  ),
  baseRegularRtp: metric(
    'baseRegularRtp',
    'baseRegularRtp',
    'percent',
    'metrics.components.baseGameRegularPayout / metrics.totalBet',
    (r) => componentRatio(r, 'baseGameRegularPayout'),
  ),
  baseScatterRtp: metric(
    'baseScatterRtp',
    'baseScatterRtp',
    'percent',
    'metrics.components.baseGameScatterPayout / metrics.totalBet',
    (r) => componentRatio(r, 'baseGameScatterPayout'),
  ),
  baseMultiplierRtp: metric(
    'baseMultiplierRtp',
    'baseMultiplierRtp',
    'percent',
    'metrics.components.baseGameMultiplierUplift / metrics.totalBet',
    (r) => componentRatio(r, 'baseGameMultiplierUplift'),
  ),
  freeRegularRtp: metric(
    'freeRegularRtp',
    'freeRegularRtp',
    'percent',
    'metrics.components.freeGameRegularPayout / metrics.totalBet',
    (r) => componentRatio(r, 'freeGameRegularPayout'),
  ),
  freeScatterRtp: metric(
    'freeScatterRtp',
    'freeScatterRtp',
    'percent',
    'metrics.components.freeGameScatterPayout / metrics.totalBet',
    (r) => componentRatio(r, 'freeGameScatterPayout'),
  ),
  freeMultiplierRtp: metric(
    'freeMultiplierRtp',
    'freeMultiplierRtp',
    'percent',
    'metrics.components.freeGameMultiplierUplift / metrics.totalBet',
    (r) => componentRatio(r, 'freeGameMultiplierUplift'),
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
    undefined,
    0,
  ),
  coefficientOfVariation: metric(
    'coefficientOfVariation',
    'cv',
    'decimal',
    'metrics.coefficientOfVariation',
    (r) => r.metrics.coefficientOfVariation,
    'tipCv',
  ),
  standardDeviation: metric(
    'standardDeviation',
    'sd',
    'decimal',
    'metrics.standardDeviation',
    (r) => r.metrics.standardDeviation,
  ),
  averageFreeGamesPlayed: metric(
    'averageFreeGamesPlayed',
    'averageFreeGames',
    'decimal',
    'metrics.averageFreeGamesPlayed',
    (r) => r.metrics.averageFreeGamesPlayed,
  ),
  freeGameTriggerCount: metric(
    'freeGameTriggerCount',
    'triggerCount',
    'count',
    'metrics.freeGameTriggerCount',
    (r) => r.metrics.freeGameTriggerCount,
  ),
  averageInitiallyAwardedFreeGames: metric(
    'averageInitiallyAwardedFreeGames',
    'initialFreeGames',
    'decimal',
    'metrics.averageInitiallyAwardedFreeGames',
    (r) => r.metrics.averageInitiallyAwardedFreeGames,
  ),
  maximumObservedFeatureLength: metric(
    'maximumObservedFeatureLength',
    'maximumObservedFeatureLength',
    'count',
    'metrics.maximumObservedFeatureLength',
    (r) => r.metrics.maximumObservedFeatureLength,
  ),
  retriggerCount: metric(
    'retriggerCount',
    'retriggerCount',
    'count',
    'metrics.retriggerCount',
    (r) => r.metrics.retriggerCount,
  ),
  averageRetriggersPerFeature: metric(
    'averageRetriggersPerFeature',
    'averageRetriggers',
    'decimal',
    'metrics.averageRetriggersPerFeature',
    (r) => r.metrics.averageRetriggersPerFeature,
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
