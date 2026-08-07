import {
  DASHBOARD_DEFAULT_BASE_BET_CREDITS,
  MANAGEMENT_TARGETS,
} from '../config/management-targets.js';
import type { LoadedReport, SimulationReport, Status } from '../types/simulation-report.js';

export type ReconciliationKey =
  | 'creditedRtp'
  | 'uncappedRtp'
  | 'payoutComponents'
  | 'capEquation'
  | 'bucketCounts'
  | 'bucketProbabilities';

export interface ReconciliationCheck {
  readonly key: ReconciliationKey;
  readonly expected: number;
  readonly reported: number;
  readonly status: 'PASS' | 'FAIL';
}

export type TargetKey =
  | 'creditedRtp'
  | 'baseHitFrequency'
  | 'featureOccurrence'
  | 'averageFeatureLength'
  | 'p95FeatureLength'
  | 'capHitFrequency';

export interface TargetEvaluation {
  readonly key: TargetKey;
  readonly value: number;
  readonly status: Status;
}

export type RiskKey =
  | 'none'
  | 'rtpOutside'
  | 'confidenceCrosses'
  | 'featureFrequencyOutside'
  | 'featureDurationOutside'
  | 'p95Above'
  | 'capApplications'
  | 'featureCapHits'
  | 'smokeSample'
  | 'limitedSample'
  | 'reconciliationFailure';

export interface RiskFlag {
  readonly status: 'WARN' | 'FAIL' | 'INFO';
  readonly key: RiskKey;
  readonly count?: number;
}

export type ComparisonMetricKey =
  | 'creditedRtp'
  | 'baseRtp'
  | 'featureRtp'
  | 'hitFrequency'
  | 'featureFrequency'
  | 'averageFeatureLength'
  | 'p95FeatureLength'
  | 'standardDeviation'
  | 'maximumObservedWinCredits'
  | 'capFrequency';

export interface ComparisonRow {
  readonly key: ComparisonMetricKey;
  readonly a: number;
  readonly b: number;
  readonly absoluteDifference: number;
  readonly relativeDifference: number | null;
  readonly format: 'percent' | 'number' | 'credits';
}

const close = (left: number, right: number, tolerance = 1e-9): boolean =>
  Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));

export function featureFrequencyOdds(report: SimulationReport): number {
  return report.featureTriggerFrequency > 0 ? 1 / report.featureTriggerFrequency : Infinity;
}

export function baseBetCredits(report: SimulationReport): number {
  return report.baseBetCredits ?? DASHBOARD_DEFAULT_BASE_BET_CREDITS;
}

export function maximumWinMultiple(report: SimulationReport): number {
  return report.maximumObservedWinCredits / baseBetCredits(report);
}

export function netReturnFrequency(report: SimulationReport): number {
  return (
    report.payoutDistribution
      .filter((bucket) => bucket.minimumMultiple >= 1)
      .reduce((total, bucket) => total + bucket.count, 0) / report.paidSpins
  );
}

export function reconcileReport(report: SimulationReport): readonly ReconciliationCheck[] {
  const totalBucketCount = report.payoutDistribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const totalProbability = report.payoutDistribution.reduce(
    (sum, bucket) => sum + bucket.probability,
    0,
  );
  const checks: readonly Omit<ReconciliationCheck, 'status'>[] = [
    {
      key: 'creditedRtp',
      expected: report.creditedTotalPayoutCredits / report.totalWageredCredits,
      reported: report.creditedTotalRtp,
    },
    {
      key: 'uncappedRtp',
      expected: report.uncappedTotalPayoutCredits / report.totalWageredCredits,
      reported: report.uncappedTotalRtp,
    },
    {
      key: 'payoutComponents',
      expected:
        report.uncappedBaseLinePayoutCredits +
        report.uncappedBaseScatterPayoutCredits +
        report.uncappedFeaturePayoutCredits,
      reported: report.uncappedTotalPayoutCredits,
    },
    {
      key: 'capEquation',
      expected: report.creditedTotalPayoutCredits + report.capReductionCredits,
      reported: report.uncappedTotalPayoutCredits,
    },
    { key: 'bucketCounts', expected: report.paidSpins, reported: totalBucketCount },
    { key: 'bucketProbabilities', expected: 1, reported: totalProbability },
  ];
  return checks.map((check) => ({
    ...check,
    status: close(check.expected, check.reported) ? 'PASS' : 'FAIL',
  }));
}

function rangeStatus(value: number, minimum: number, maximum: number): 'PASS' | 'FAIL' {
  return value >= minimum && value <= maximum ? 'PASS' : 'FAIL';
}

export function evaluateTargets(report: SimulationReport): readonly TargetEvaluation[] {
  const odds = featureFrequencyOdds(report);
  const targets = MANAGEMENT_TARGETS;
  return [
    {
      key: 'creditedRtp',
      value: report.creditedTotalRtp,
      status: rangeStatus(
        report.creditedTotalRtp,
        targets.creditedRtp.minimum,
        targets.creditedRtp.maximum,
      ),
    },
    {
      key: 'baseHitFrequency',
      value: report.baseHitFrequency,
      status: rangeStatus(
        report.baseHitFrequency,
        targets.baseHitFrequency.minimum,
        targets.baseHitFrequency.maximum,
      ),
    },
    {
      key: 'featureOccurrence',
      value: odds,
      status: rangeStatus(
        odds,
        targets.featureOccurrenceOdds.minimum,
        targets.featureOccurrenceOdds.maximum,
      ),
    },
    {
      key: 'averageFeatureLength',
      value: report.averageTotalFreeSpinsPerTrigger,
      status: rangeStatus(
        report.averageTotalFreeSpinsPerTrigger,
        targets.averageFeatureLength.minimum,
        targets.averageFeatureLength.maximum,
      ),
    },
    {
      key: 'p95FeatureLength',
      value: report.featureLengthPercentiles.p95,
      status:
        report.featureLengthPercentiles.p95 < targets.p95FeatureLengthMaximumExclusive
          ? 'PASS'
          : 'FAIL',
    },
    {
      key: 'capHitFrequency',
      value: report.capApplicationFrequency,
      status: report.capApplicationFrequency <= targets.capHitFrequencyMaximum ? 'PASS' : 'FAIL',
    },
  ];
}

export type SampleGuidanceKey = 'smoke' | 'early' | 'useful' | 'management';

export function sampleSizeGuidance(paidSpins: number): SampleGuidanceKey {
  if (paidSpins < 10_000) return 'smoke';
  if (paidSpins < 100_000) return 'early';
  if (paidSpins < 1_000_000) return 'useful';
  return 'management';
}

export function riskFlags(report: SimulationReport): readonly RiskFlag[] {
  const targets = MANAGEMENT_TARGETS;
  const flags: RiskFlag[] = [];
  if (
    report.creditedTotalRtp < targets.creditedRtp.minimum ||
    report.creditedTotalRtp > targets.creditedRtp.maximum
  )
    flags.push({ status: 'FAIL', key: 'rtpOutside' });
  const [low, high] = report.confidenceInterval95;
  if (low < targets.creditedRtp.minimum || high > targets.creditedRtp.maximum)
    flags.push({ status: 'WARN', key: 'confidenceCrosses' });
  const odds = featureFrequencyOdds(report);
  if (odds < targets.featureOccurrenceOdds.minimum || odds > targets.featureOccurrenceOdds.maximum)
    flags.push({ status: 'FAIL', key: 'featureFrequencyOutside' });
  if (
    report.averageTotalFreeSpinsPerTrigger < targets.averageFeatureLength.minimum ||
    report.averageTotalFreeSpinsPerTrigger > targets.averageFeatureLength.maximum
  )
    flags.push({ status: 'FAIL', key: 'featureDurationOutside' });
  if (report.featureLengthPercentiles.p95 >= targets.p95FeatureLengthMaximumExclusive)
    flags.push({ status: 'FAIL', key: 'p95Above' });
  if (report.capApplications > 0)
    flags.push({ status: 'WARN', key: 'capApplications', count: report.capApplications });
  if (report.featureCapHitFrequency > 0) flags.push({ status: 'WARN', key: 'featureCapHits' });
  if (report.paidSpins < 10_000) flags.push({ status: 'WARN', key: 'smokeSample' });
  else if (report.paidSpins < 100_000) flags.push({ status: 'WARN', key: 'limitedSample' });
  if (reconcileReport(report).some((check) => check.status === 'FAIL'))
    flags.push({ status: 'FAIL', key: 'reconciliationFailure' });
  if (flags.length === 0) flags.push({ status: 'INFO', key: 'none' });
  return flags;
}

export function overallStatus(report: SimulationReport): 'PASS' | 'WARN' | 'FAIL' {
  const flags = riskFlags(report);
  if (flags.some((flag) => flag.status === 'FAIL')) return 'FAIL';
  if (flags.some((flag) => flag.status === 'WARN')) return 'WARN';
  return 'PASS';
}

export function meetsAllTargets(report: SimulationReport): boolean {
  return evaluateTargets(report).every((target) => target.status === 'PASS');
}

export function comparisonRows(a: SimulationReport, b: SimulationReport): readonly ComparisonRow[] {
  const metrics: readonly [ComparisonMetricKey, number, number, ComparisonRow['format']][] = [
    ['creditedRtp', a.creditedTotalRtp, b.creditedTotalRtp, 'percent'],
    ['baseRtp', a.uncappedBaseLineRtp, b.uncappedBaseLineRtp, 'percent'],
    ['featureRtp', a.uncappedFeatureRtp, b.uncappedFeatureRtp, 'percent'],
    ['hitFrequency', a.featureInclusiveHitFrequency, b.featureInclusiveHitFrequency, 'percent'],
    ['featureFrequency', a.featureTriggerFrequency, b.featureTriggerFrequency, 'percent'],
    [
      'averageFeatureLength',
      a.averageTotalFreeSpinsPerTrigger,
      b.averageTotalFreeSpinsPerTrigger,
      'number',
    ],
    ['p95FeatureLength', a.featureLengthPercentiles.p95, b.featureLengthPercentiles.p95, 'number'],
    ['standardDeviation', a.standardDeviation, b.standardDeviation, 'number'],
    [
      'maximumObservedWinCredits',
      a.maximumObservedWinCredits,
      b.maximumObservedWinCredits,
      'credits',
    ],
    ['capFrequency', a.capApplicationFrequency, b.capApplicationFrequency, 'percent'],
  ];
  return metrics.map(([key, left, right, format]) => ({
    key,
    a: left,
    b: right,
    absoluteDifference: right - left,
    relativeDifference: left === 0 ? null : (right - left) / Math.abs(left),
    format,
  }));
}

export function isNestedDeterministicSamples(reports: readonly LoadedReport[]): boolean {
  if (reports.length < 2) return false;
  const sameSeed = reports.every((entry) => entry.report.seed === reports[0]?.report.seed);
  const counts = new Set(reports.map((entry) => entry.report.paidSpins));
  return sameSeed && counts.size > 1;
}
