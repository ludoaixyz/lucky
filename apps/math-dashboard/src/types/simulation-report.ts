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
  metadata: ReportMetadata;
  simulation: ReportSimulation;
  metrics: BathalaMetrics;
  dashboardLocale?: DashboardLocale;
  simulationCheckpoints?: readonly SimulationCheckpoint[];
}
export interface ReportIndexEntry {
  file: string;
  label: string;
  default?: boolean;
}
export interface LoadedReport {
  id: string;
  label: string;
  source: 'built-in' | 'upload';
  report: SimulationReport;
}
export type Status = 'PASS' | 'WARN' | 'FAIL' | 'N/A';
export type ProfileStatus = Exclude<Status, 'N/A'> | 'UNCALIBRATED';
