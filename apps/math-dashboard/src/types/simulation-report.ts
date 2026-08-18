import type { DashboardLocale } from '../i18n/types.js';
import type { SimulationCheckpoint } from '@lucky/shared-types';

export interface ReportMetadata {
  schemaVersion: string;
  gameId: string;
  gameName: string;
  gameVersion: string;
  configurationId: string;
  generatedAt: string;
  calibrationProfile?: string;
  profileName?: string;
}
export interface ReportSimulation {
  methodology: 'deterministic-streaming-monte-carlo';
  seed: number;
  spins: number;
}
export interface ReportComponents {
  baseGameRegularPayout: number;
  baseGameScatterPayout: number;
  baseGameMultiplierUplift: number;
  freeGameRegularPayout: number;
  freeGameScatterPayout: number;
  freeGameMultiplierUplift: number;
}
export interface TailMetric {
  threshold: number;
  count: number;
  frequency: number;
}
export interface BathalaMetrics {
  schemaVersion?: string;
  methodology?: string;
  configurationId?: string;
  seed?: number;
  totalSpins: number;
  totalBet: number;
  totalCreditedWin: number;
  rtp: number;
  winningSpinFrequency: number;
  averageWinPerWinningSpin: number;
  baseGameTumbleTriggerFrequency: number;
  freeGameTumbleTriggerFrequency: number;
  averageBaseGameTumbleRoundsPerTrigger: number;
  averageFreeGameTumbleRoundsPerTrigger: number;
  tumbleRoundsPerPaidSpin: number;
  tumbleTriggerFrequency: number;
  averageTumbleRoundsPerTriggeringSpin: number;
  maximumObservedBaseGameTumbleDepth: number;
  maximumObservedFreeGameTumbleDepth: number;
  maximumObservedTumbleDepth: number;
  bathalaActivations: number;
  bathalaActivationFrequency: number;
  averageSymbolsRemoved: number;
  bathalaToNextWinConversionRate: number;
  multiplierAppearanceFrequency: number;
  averageMultiplierValue: number;
  averageSummedMultiplierOnMultipliedWins: number;
  maximumSummedMultiplier: number;
  freeGameTriggerCount: number;
  featureFrequency: number;
  averageFreeGamesPlayed: number;
  averageInitiallyAwardedFreeGames: number;
  maximumObservedFeatureLength: number;
  featureLengthPercentiles: { p50: number; p75: number; p90: number; p95: number; p99: number };
  retriggerCount: number;
  averageRetriggersPerFeature: number;
  averageEndingFreeGameMultiplier: number;
  freeGameWinContribution: number;
  baseGameWinContribution: number;
  maximumObservedWin: number;
  meanWinPerPaidSpin: number;
  variance: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  standardError: number;
  confidenceInterval95: [number, number];
  components: ReportComponents;
  tails: TailMetric[];
  // Optional future aggregate structures. Current 2.x reports remain valid without them.
  payoutHistogram?: readonly { bucket: string; count: number }[];
  payoutPercentiles?: Readonly<Record<string, number>>;
  tumbleDepthHistogram?: readonly { depth: number; count: number }[];
  multiplierHistogram?: readonly { multiplier: number; count: number }[];
  featurePayoutPercentiles?: Readonly<Record<string, number>>;
  featurePayoutHistogram?: readonly { bucket: string; count: number }[];
}
export interface SimulationReport {
  sourceType?: 'monte-carlo';
  metadata: ReportMetadata;
  simulation: ReportSimulation;
  metrics: BathalaMetrics;
  dashboardLocale?: DashboardLocale;
  simulationCheckpoints?: readonly SimulationCheckpoint[];
  metricAvailability?: Readonly<Record<string, MetricAvailability>>;
  analysisWarnings?: readonly string[];
}

export type MetricAvailability = 'available' | 'derived' | 'unavailable';
export type AnalysisSourceType = 'monte-carlo' | 'workbench-session';
type NullableNumbers<T> = {
  readonly [Key in keyof T]: T[Key] extends number ? number | null : T[Key];
};
export type WorkbenchAnalysisMetrics = Omit<
  NullableNumbers<BathalaMetrics>,
  'components' | 'featureLengthPercentiles' | 'tails'
> & {
  readonly components: NullableNumbers<ReportComponents>;
  readonly featureLengthPercentiles: NullableNumbers<BathalaMetrics['featureLengthPercentiles']>;
  readonly tails: readonly TailMetric[];
};
export interface CsvCapabilities {
  readonly core: true;
  readonly mechanics: boolean;
  readonly tumble: boolean;
  readonly bathala: boolean;
  readonly multiplier: boolean;
  readonly feature: boolean;
  readonly rtpCompositionSimplified: boolean;
  readonly rtpCompositionDetailed: boolean;
}
export interface WorkbenchSessionReport {
  readonly sourceType: 'workbench-session';
  readonly metadata: ReportMetadata;
  readonly simulation: {
    readonly methodology: 'workbench-interactive-session';
    readonly seed: number | null;
    readonly spins: number;
  };
  readonly metrics: WorkbenchAnalysisMetrics;
  readonly metricAvailability: Readonly<Record<string, MetricAvailability>>;
  readonly capabilities: CsvCapabilities;
  readonly analysisWarnings: readonly string[];
  readonly dashboardLocale?: DashboardLocale;
}
export type DashboardAnalysisReport = SimulationReport | WorkbenchSessionReport;

export const analysisSourceType = (report: DashboardAnalysisReport): AnalysisSourceType =>
  report.sourceType === 'workbench-session' ? 'workbench-session' : 'monte-carlo';
export interface ReportIndexEntry {
  file: string;
  label: string;
  default?: boolean;
}
export interface LoadedReport {
  id: string;
  label: string;
  source: 'built-in' | 'upload';
  report: DashboardAnalysisReport;
}
export type Status = 'PASS' | 'WARN' | 'FAIL' | 'N/A';
export type ProfileStatus = Exclude<Status, 'N/A'> | 'UNCALIBRATED';
