import {
  DASHBOARD_DEFAULT_BASE_BET_CREDITS,
  MANAGEMENT_TARGETS,
} from '../config/management-targets.js';
import type { LoadedReport, SimulationReport, Status } from '../types/simulation-report.js';

export interface ReconciliationCheck {
  readonly label: string;
  readonly expected: number;
  readonly reported: number;
  readonly status: 'PASS' | 'FAIL';
}

export interface TargetEvaluation {
  readonly metric: string;
  readonly result: string;
  readonly target: string;
  readonly status: Status;
  readonly interpretation: string;
}

export interface RiskFlag {
  readonly status: 'WARN' | 'FAIL' | 'INFO';
  readonly message: string;
}

export interface ComparisonRow {
  readonly metric: string;
  readonly a: number;
  readonly b: number;
  readonly absoluteDifference: number;
  readonly relativeDifference: number | null;
  readonly format: 'percent' | 'number' | 'credits';
}

const close = (left: number, right: number, tolerance = 1e-9): boolean =>
  Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));

export const percentage = (value: number, digits = 2): string =>
  new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const number = (value: number, digits = 2): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);

export function featureFrequencyOdds(report: SimulationReport): number {
  return report.featureTriggerFrequency > 0 ? 1 / report.featureTriggerFrequency : Infinity;
}

export function baseBetCredits(report: SimulationReport): number {
  return report.baseBetCredits ?? DASHBOARD_DEFAULT_BASE_BET_CREDITS;
}

export function maximumWinMultiple(report: SimulationReport): number {
  return report.maximumObservedWinCredits / baseBetCredits(report);
}

export function betReturnFrequency(report: SimulationReport): number {
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
  const checks = [
    {
      label: 'Credited RTP = credited payout ÷ wagered',
      expected: report.creditedTotalPayoutCredits / report.totalWageredCredits,
      reported: report.creditedTotalRtp,
    },
    {
      label: 'Uncapped RTP = uncapped payout ÷ wagered',
      expected: report.uncappedTotalPayoutCredits / report.totalWageredCredits,
      reported: report.uncappedTotalRtp,
    },
    {
      label: 'Base line + Scatter + feature = uncapped payout',
      expected:
        report.uncappedBaseLinePayoutCredits +
        report.uncappedBaseScatterPayoutCredits +
        report.uncappedFeaturePayoutCredits,
      reported: report.uncappedTotalPayoutCredits,
    },
    {
      label: 'Credited payout + cap reduction = uncapped payout',
      expected: report.creditedTotalPayoutCredits + report.capReductionCredits,
      reported: report.uncappedTotalPayoutCredits,
    },
    {
      label: 'Payout bucket counts = paid spins',
      expected: report.paidSpins,
      reported: totalBucketCount,
    },
    { label: 'Payout bucket probabilities sum to 1', expected: 1, reported: totalProbability },
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
      metric: 'Credited RTP',
      result: percentage(report.creditedTotalRtp),
      target: '94.00%–97.00%',
      status: rangeStatus(
        report.creditedTotalRtp,
        targets.creditedRtp.minimum,
        targets.creditedRtp.maximum,
      ),
      interpretation: 'Estimated credited return against the provisional balancing range.',
    },
    {
      metric: 'Base hit frequency',
      result: percentage(report.baseHitFrequency),
      target: '20.00%–35.00%',
      status: rangeStatus(
        report.baseHitFrequency,
        targets.baseHitFrequency.minimum,
        targets.baseHitFrequency.maximum,
      ),
      interpretation: 'Share of paid spins with a base-game award.',
    },
    {
      metric: 'Feature occurrence',
      result: `1 in ${number(odds, 1)}`,
      target: '1 in 80–150 paid spins',
      status: rangeStatus(
        odds,
        targets.featureOccurrenceOdds.minimum,
        targets.featureOccurrenceOdds.maximum,
      ),
      interpretation: 'Estimated interval between feature triggers.',
    },
    {
      metric: 'Average feature length',
      result: number(report.averageTotalFreeSpinsPerTrigger),
      target: '9–14 free spins',
      status: rangeStatus(
        report.averageTotalFreeSpinsPerTrigger,
        targets.averageFeatureLength.minimum,
        targets.averageFeatureLength.maximum,
      ),
      interpretation: 'Average total free spins, including retriggers.',
    },
    {
      metric: 'P95 feature length',
      result: number(report.featureLengthPercentiles.p95, 0),
      target: '< 30 free spins',
      status:
        report.featureLengthPercentiles.p95 < targets.p95FeatureLengthMaximumExclusive
          ? 'PASS'
          : 'FAIL',
      interpretation: 'Upper-tail feature duration for presentation planning.',
    },
    {
      metric: 'Cap hit frequency',
      result: percentage(report.capApplicationFrequency, 4),
      target: 'Effectively zero',
      status: report.capApplicationFrequency <= targets.capHitFrequencyMaximum ? 'PASS' : 'FAIL',
      interpretation: 'Observed paid-spin outcomes reduced by the maximum-win cap.',
    },
  ];
}

export function sampleSizeGuidance(paidSpins: number): string {
  if (paidSpins < 10_000) return 'Smoke test only';
  if (paidSpins < 100_000) return 'Early design check';
  if (paidSpins < 1_000_000) return 'Useful balancing evidence';
  return 'Management review-quality Monte Carlo estimate';
}

export function riskFlags(report: SimulationReport): readonly RiskFlag[] {
  const targets = MANAGEMENT_TARGETS;
  const flags: RiskFlag[] = [];
  if (
    report.creditedTotalRtp < targets.creditedRtp.minimum ||
    report.creditedTotalRtp > targets.creditedRtp.maximum
  )
    flags.push({
      status: 'FAIL',
      message: 'Credited RTP is outside the provisional target range.',
    });
  const [low, high] = report.confidenceInterval95;
  if (low < targets.creditedRtp.minimum || high > targets.creditedRtp.maximum)
    flags.push({
      status: 'WARN',
      message: 'The 95% confidence interval crosses an RTP target boundary.',
    });
  const odds = featureFrequencyOdds(report);
  if (odds < targets.featureOccurrenceOdds.minimum || odds > targets.featureOccurrenceOdds.maximum)
    flags.push({
      status: 'FAIL',
      message: 'Feature occurrence is outside the provisional target range.',
    });
  if (
    report.averageTotalFreeSpinsPerTrigger < targets.averageFeatureLength.minimum ||
    report.averageTotalFreeSpinsPerTrigger > targets.averageFeatureLength.maximum
  )
    flags.push({ status: 'FAIL', message: 'Average feature duration is outside target.' });
  if (report.featureLengthPercentiles.p95 >= targets.p95FeatureLengthMaximumExclusive)
    flags.push({ status: 'FAIL', message: 'P95 feature duration is above target.' });
  if (report.capApplications > 0)
    flags.push({
      status: 'WARN',
      message: `${number(report.capApplications, 0)} cap applications were observed.`,
    });
  if (report.featureCapHitFrequency > 0)
    flags.push({ status: 'WARN', message: 'Feature cap hits were observed.' });
  if (report.paidSpins < 10_000)
    flags.push({
      status: 'WARN',
      message: 'Smoke-test-only sample: fewer than 10,000 paid spins.',
    });
  else if (report.paidSpins < 100_000)
    flags.push({ status: 'WARN', message: 'Limited sample: fewer than 100,000 paid spins.' });
  if (reconcileReport(report).some((check) => check.status === 'FAIL'))
    flags.push({ status: 'FAIL', message: 'One or more report reconciliations failed.' });
  if (flags.length === 0)
    flags.push({ status: 'INFO', message: 'No current risk flags were triggered.' });
  return flags;
}

export function overallStatus(report: SimulationReport): 'PASS' | 'WARN' | 'FAIL' {
  const flags = riskFlags(report);
  if (flags.some((flag) => flag.status === 'FAIL')) return 'FAIL';
  if (flags.some((flag) => flag.status === 'WARN')) return 'WARN';
  return 'PASS';
}

export function plainLanguageSummary(report: SimulationReport): string {
  const targetResults = evaluateTargets(report);
  const allMet = targetResults.every((target) => target.status === 'PASS');
  return `The current profile returned an estimated ${percentage(report.creditedTotalRtp)} over ${number(report.paidSpins, 0)} simulated paid spins. Approximately ${percentage(report.featureInclusiveHitFrequency)} of spins produced an award. The feature occurred once every ${number(featureFrequencyOdds(report), 1)} spins and lasted ${number(report.averageTotalFreeSpinsPerTrigger, 1)} spins on average. The profile ${allMet ? 'met' : 'did not meet'} all current provisional targets.`;
}

export function comparisonRows(a: SimulationReport, b: SimulationReport): readonly ComparisonRow[] {
  const metrics: readonly [string, number, number, ComparisonRow['format']][] = [
    ['Credited RTP', a.creditedTotalRtp, b.creditedTotalRtp, 'percent'],
    ['Base RTP', a.uncappedBaseLineRtp, b.uncappedBaseLineRtp, 'percent'],
    ['Feature RTP', a.uncappedFeatureRtp, b.uncappedFeatureRtp, 'percent'],
    ['Hit frequency', a.featureInclusiveHitFrequency, b.featureInclusiveHitFrequency, 'percent'],
    ['Feature frequency', a.featureTriggerFrequency, b.featureTriggerFrequency, 'percent'],
    [
      'Average feature length',
      a.averageTotalFreeSpinsPerTrigger,
      b.averageTotalFreeSpinsPerTrigger,
      'number',
    ],
    [
      'P95 feature length',
      a.featureLengthPercentiles.p95,
      b.featureLengthPercentiles.p95,
      'number',
    ],
    ['Standard deviation', a.standardDeviation, b.standardDeviation, 'number'],
    ['Maximum observed win', a.maximumObservedWinCredits, b.maximumObservedWinCredits, 'credits'],
    ['Cap frequency', a.capApplicationFrequency, b.capApplicationFrequency, 'percent'],
  ];
  return metrics.map(([metric, left, right, format]) => ({
    metric,
    a: left,
    b: right,
    absoluteDifference: right - left,
    relativeDifference: left === 0 ? null : (right - left) / Math.abs(left),
    format,
  }));
}

export function nestedSampleNotice(reports: readonly LoadedReport[]): string | null {
  if (reports.length < 2) return null;
  const sameSeed = reports.every((entry) => entry.report.seed === reports[0]?.report.seed);
  const counts = new Set(reports.map((entry) => entry.report.paidSpins));
  return sameSeed && counts.size > 1
    ? 'These reports use the same seed with different spin counts and are nested deterministic samples, not independent runs.'
    : null;
}
