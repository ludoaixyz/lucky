import {
  MANAGEMENT_TARGETS,
  type ManagementTarget,
  type ManagementTargets,
} from '../config/management-targets.js';
import type {
  DashboardAnalysisReport,
  ProfileStatus,
  SimulationReport,
  Status,
} from '../types/simulation-report.js';
import { componentRtp, deriveAnalytics, frequencyOdds } from './derived.js';
import { METRIC_REGISTRY, type MetricId } from './metric-registry.js';

export { componentRtp, frequencyOdds };

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));

export interface Reconciliation {
  key: 'gameFeature' | 'componentCredits' | 'componentRtp' | 'schemaValidation' | 'requiredMetrics';
  expected: number | string;
  actual: number | string;
  status: Status;
}

export function reconcileReport(report: DashboardAnalysisReport): Reconciliation[] {
  const m = report.metrics;
  const c = m.components;
  const componentValues = Object.values(c);
  const credits = componentValues.some((value) => value === null)
    ? null
    : (componentValues as number[]).reduce((total, value) => total + value, 0);
  const rtp = componentRtp(report, credits);
  const gameFeatureTotal =
    m.baseGameWinContribution === null || m.freeGameWinContribution === null
      ? null
      : m.baseGameWinContribution + m.freeGameWinContribution;
  const csv = report.sourceType === 'workbench-session';
  return [
    {
      key: 'gameFeature',
      expected: m.rtp ?? 'N/A',
      actual: gameFeatureTotal ?? 'N/A',
      status:
        m.rtp === null || gameFeatureTotal === null
          ? 'N/A'
          : close(m.rtp, gameFeatureTotal)
            ? 'PASS'
            : 'FAIL',
    },
    {
      key: 'componentCredits',
      expected: m.totalCreditedWin ?? 'N/A',
      actual: credits ?? 'N/A',
      status:
        m.totalCreditedWin === null || credits === null
          ? 'N/A'
          : close(m.totalCreditedWin, credits)
            ? 'PASS'
            : 'FAIL',
    },
    {
      key: 'componentRtp',
      expected: m.rtp ?? 'N/A',
      actual: rtp ?? 'N/A',
      status: m.rtp === null || rtp === null ? 'N/A' : close(m.rtp, rtp) ? 'PASS' : 'FAIL',
    },
    {
      key: 'schemaValidation',
      expected: '2.x',
      actual: report.metadata.schemaVersion,
      status: csv ? 'N/A' : report.metadata.schemaVersion.startsWith('2.') ? 'PASS' : 'FAIL',
    },
    {
      key: 'requiredMetrics',
      expected: 'finite',
      actual: csv ? 'N/A' : 'finite',
      status: csv ? 'N/A' : 'PASS',
    },
  ];
}

function inPassBand(value: number, target: ManagementTarget): boolean {
  if (target.type === 'informational') return true;
  if (target.type === 'exact') return target.exact !== undefined && close(value, target.exact);
  return (
    (target.minimum === undefined || value >= target.minimum) &&
    (target.maximum === undefined || value <= target.maximum)
  );
}

function inWarningBand(value: number, target: ManagementTarget): boolean {
  return (
    (target.warningMinimum === undefined || value >= target.warningMinimum) &&
    (target.warningMaximum === undefined || value <= target.warningMaximum)
  );
}

export function evaluateTargetValue(value: number, target?: ManagementTarget): Status {
  if (!target) return 'N/A';
  if (target.type === 'informational' || inPassBand(value, target)) return 'PASS';
  return inWarningBand(value, target) &&
    (target.warningMinimum !== undefined || target.warningMaximum !== undefined)
    ? 'WARN'
    : 'FAIL';
}

export interface TargetEvaluation {
  readonly key: MetricId;
  readonly value: number | null;
  readonly target: ManagementTarget | null;
  readonly range: ManagementTarget | null;
  readonly status: Status;
  readonly delta: number | null;
}

function targetDelta(value: number, target?: ManagementTarget): number | null {
  if (!target || target.type === 'informational') return null;
  if (target.type === 'exact') return target.exact === undefined ? null : value - target.exact;
  if (target.minimum !== undefined && value < target.minimum) return value - target.minimum;
  if (target.maximum !== undefined && value > target.maximum) return value - target.maximum;
  return 0;
}

export function evaluateTargets(
  report: DashboardAnalysisReport,
  targets: ManagementTargets = MANAGEMENT_TARGETS,
): TargetEvaluation[] {
  return (Object.keys(METRIC_REGISTRY) as MetricId[]).map((key) => {
    const value = METRIC_REGISTRY[key].getter(report);
    const target = targets[key];
    return {
      key,
      value,
      target: target ?? null,
      range: target ?? null,
      status: value === null ? 'N/A' : evaluateTargetValue(value, target),
      delta: value === null ? null : targetDelta(value, target),
    };
  });
}

export function overallStatus(
  report: SimulationReport,
  targets: ManagementTargets = MANAGEMENT_TARGETS,
): ProfileStatus {
  const configured = evaluateTargets(report, targets).filter((item) => item.status !== 'N/A');
  if (!configured.length) return 'UNCALIBRATED';
  if (configured.some((item) => item.status === 'FAIL' && item.target?.criticality === 'critical'))
    return 'FAIL';
  if (configured.some((item) => item.status === 'FAIL' || item.status === 'WARN')) return 'WARN';
  return 'PASS';
}

export interface DataQualityIssue {
  readonly key: string;
  readonly severity: 'WARN' | 'FAIL';
}

export function dataQualityIssues(report: SimulationReport): DataQualityIssue[] {
  const m = report.metrics;
  const issues: DataQualityIssue[] = [];
  const add = (condition: boolean, key: string, severity: 'WARN' | 'FAIL' = 'WARN') => {
    if (condition) issues.push({ key, severity });
  };
  add(m.totalSpins <= 0, 'dqSpins', 'FAIL');
  add(m.totalBet <= 0, 'dqBet', 'FAIL');
  add(m.confidenceInterval95[0] > m.confidenceInterval95[1], 'dqCi', 'FAIL');
  add(m.featureFrequency > 0 && m.freeGameTriggerCount === 0, 'dqFeatureCount');
  add(m.freeGameWinContribution > 0 && m.freeGameTriggerCount === 0, 'dqFeatureContribution');
  add(
    Object.values(m.components).some((value) => value < 0),
    'dqNegativePayout',
    'FAIL',
  );
  add(
    m.tails.some((tail, index) => index > 0 && tail.threshold <= m.tails[index - 1]!.threshold),
    'dqTailOrder',
  );
  add(
    m.tails.some((tail) => tail.frequency < 0 || tail.frequency > 1),
    'dqTailFrequency',
    'FAIL',
  );
  add(
    m.tails.some((tail) => tail.count > m.totalSpins),
    'dqTailCount',
    'FAIL',
  );
  add(
    reconcileReport(report).some((check) => check.status === 'FAIL'),
    'dqReconciliation',
    'FAIL',
  );
  return issues;
}

export { deriveAnalytics };
