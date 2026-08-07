import type { DashboardLocale } from '../i18n/types.js';
import type { SimulationCheckpoint } from '@lucky/shared-types';

export interface PayoutBucket {
  readonly label: string;
  readonly minimumMultiple: number;
  readonly maximumMultiple: number | null;
  readonly count: number;
  readonly probability: number;
}

export interface SimulationReport {
  readonly schemaVersion: '1.2.0';
  readonly methodology: 'deterministic-monte-carlo';
  readonly gameVersion: string;
  readonly configurationId: string;
  readonly generatedAt: string;
  readonly seed: number;
  readonly paidSpins: number;
  readonly totalWageredCredits: number;
  readonly uncappedBaseLinePayoutCredits: number;
  readonly uncappedBaseScatterPayoutCredits: number;
  readonly uncappedBasePayoutCredits?: number;
  readonly uncappedFeaturePayoutCredits: number;
  readonly uncappedTotalPayoutCredits: number;
  readonly creditedTotalPayoutCredits: number;
  readonly capReductionCredits: number;
  readonly uncappedBaseLineRtp: number;
  readonly uncappedBaseScatterRtp: number;
  readonly uncappedFeatureRtp: number;
  readonly uncappedTotalRtp: number;
  readonly creditedTotalRtp: number;
  readonly baseHitFrequency: number;
  readonly featureTriggerFrequency: number;
  readonly featureTriggerFrequencyByScatterCount: Readonly<
    Partial<Record<'3' | '4' | '5', number>>
  >;
  readonly featureInclusiveHitFrequency: number;
  readonly averageInitiallyAwardedFreeSpins: number;
  readonly averageTotalFreeSpinsPerTrigger: number;
  readonly averageRetriggersPerTrigger: number;
  readonly featureLengthPercentiles: {
    readonly median: number;
    readonly p75: number;
    readonly p90: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly maximumObservedFeatureLength: number;
  readonly featureCapHitFrequency: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly standardError: number;
  readonly confidenceInterval95: readonly [number, number];
  readonly maximumObservedWinCredits: number;
  readonly capApplications: number;
  readonly capApplicationFrequency: number;
  readonly payoutDistribution: readonly PayoutBucket[];
  readonly baseBetCredits?: number;
  readonly dashboardLocale?: DashboardLocale;
  readonly theoreticalRtp?: number;
  readonly maxSimulatedBets?: number;
  readonly cumulativeSimulation?: true;
  readonly simulationCheckpoints?: readonly SimulationCheckpoint[];
  readonly exactEnumeration?: Readonly<Record<string, unknown>> | null;
  readonly cascadeEnabled?: boolean;
  readonly spinsWithCascade?: number;
  readonly eligibleCascadeSpins?: number;
  readonly cascadeSpinRate?: number;
  readonly totalCascadeSteps?: number;
  readonly averageCascadeStepsPerPaidSpin?: number;
  readonly averageCascadeStepsWhenTriggered?: number;
  readonly maxCascadeDepthObserved?: number;
  readonly cascadePayout?: number;
  readonly cascadePayoutCredits?: number;
  readonly cascadeRtpContribution?: number;
  readonly baseGameSpinsWithCascade?: number;
  readonly baseGameCascadeSpinRate?: number;
  readonly baseGameCascadeSteps?: number;
  readonly baseGameCascadePayoutCredits?: number;
  readonly freeSpinSpinsWithCascade?: number;
  readonly freeSpinCascadeSpinRate?: number;
  readonly freeSpinCascadeSteps?: number;
  readonly freeSpinCascadePayoutCredits?: number;
}

export interface ReportIndexEntry {
  readonly file: string;
  readonly label: string;
  readonly default?: boolean;
}

export interface LoadedReport {
  readonly id: string;
  readonly label: string;
  readonly source: 'built-in' | 'upload';
  readonly report: SimulationReport;
}

export type Status = 'PASS' | 'WARN' | 'FAIL' | 'INFO';
