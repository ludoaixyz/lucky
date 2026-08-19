import type { ManagementTargets } from '../config/management-targets.js';
import { MANAGEMENT_TARGETS } from '../config/management-targets.js';
import type { SimulationReport, Status } from '../types/simulation-report.js';
import { deriveAnalytics, tailAt } from './derived.js';
import { evaluateTargets } from './analysis.js';

export type FindingKey =
  | 'findingTargetOutside'
  | 'findingTargetWarning'
  | 'findingFeatureRtp'
  | 'findingMultiplierRtp'
  | 'findingFeatureEntry'
  | 'findingBathalaConversion'
  | 'findingTailAbsent'
  | 'findingConfidence';

export interface AssessmentFinding {
  readonly key: FindingKey;
  readonly metric?: string;
  readonly values: readonly number[];
  readonly status: Status | 'INFO';
}

export function simulationAssessment(
  report: SimulationReport,
  targets: ManagementTargets = MANAGEMENT_TARGETS,
): AssessmentFinding[] {
  const m = report.metrics;
  const d = deriveAnalytics(report);
  const findings: AssessmentFinding[] = [];
  const evaluated = evaluateTargets(report, targets);
  for (const item of evaluated) {
    if (item.value === null) continue;
    if (item.status === 'FAIL')
      findings.push({
        key: 'findingTargetOutside',
        metric: item.key,
        values: [item.value, item.delta ?? 0],
        status: 'FAIL',
      });
    else if (item.status === 'WARN')
      findings.push({
        key: 'findingTargetWarning',
        metric: item.key,
        values: [item.value, item.delta ?? 0],
        status: 'WARN',
      });
    if (findings.length === 2) break;
  }
  findings.push(
    { key: 'findingFeatureRtp', values: [m.freeGameWinContribution], status: 'INFO' },
    { key: 'findingMultiplierRtp', values: [d.totalMultiplierRtp ?? 0], status: 'INFO' },
    {
      key: 'findingFeatureEntry',
      values: [m.featureFrequency, d.featureOneInN ?? 0],
      status: 'INFO',
    },
    { key: 'findingBathalaConversion', values: [m.bathalaToNextWinConversionRate], status: 'INFO' },
  );
  const firstAbsent = m.tails.find((tail) => tail.count === 0);
  if (firstAbsent && !tailAt(report, firstAbsent.threshold)?.count)
    findings.push({ key: 'findingTailAbsent', values: [firstAbsent.threshold], status: 'INFO' });
  findings.push({
    key: 'findingConfidence',
    values: [m.confidenceInterval95[0], m.confidenceInterval95[1]],
    status: 'INFO',
  });
  return findings.slice(0, 7);
}
