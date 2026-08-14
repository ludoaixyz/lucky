import { MANAGEMENT_TARGETS, type TargetRange } from '../config/management-targets.js';
import type { BathalaMetrics, SimulationReport, Status } from '../types/simulation-report.js';
export const frequencyOdds = (frequency: number): number | null =>
  frequency > 0 ? 1 / frequency : null;
export const componentRtp = (report: SimulationReport, credits: number): number =>
  report.metrics.totalBet === 0 ? 0 : credits / report.metrics.totalBet;
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
export interface Reconciliation {
  key: 'gameFeature' | 'componentCredits' | 'componentRtp';
  expected: number;
  actual: number;
  status: 'PASS' | 'WARN' | 'FAIL';
}
export function reconcileReport(report: SimulationReport): Reconciliation[] {
  const m = report.metrics;
  const c = m.components;
  const credits =
    c.baseGameRegularPayout +
    c.baseGameScatterPayout +
    c.baseGameMultiplierUplift +
    c.freeGameRegularPayout +
    c.freeGameScatterPayout +
    c.freeGameMultiplierUplift;
  const rtp = componentRtp(report, credits);
  return [
    {
      key: 'gameFeature',
      expected: m.rtp,
      actual: m.baseGameWinContribution + m.freeGameWinContribution,
      status: close(m.rtp, m.baseGameWinContribution + m.freeGameWinContribution) ? 'PASS' : 'FAIL',
    },
    {
      key: 'componentCredits',
      expected: m.totalCreditedWin,
      actual: credits,
      status: close(m.totalCreditedWin, credits) ? 'PASS' : 'FAIL',
    },
    {
      key: 'componentRtp',
      expected: m.rtp,
      actual: rtp,
      status: close(m.rtp, rtp) ? 'PASS' : 'FAIL',
    },
  ];
}
export type TargetKey = keyof typeof targetValues;
const targetValues = {
  rtp: (m: BathalaMetrics) => m.rtp,
  winningSpinFrequency: (m: BathalaMetrics) => m.winningSpinFrequency,
  baseGameTumbleTriggerFrequency: (m: BathalaMetrics) => m.baseGameTumbleTriggerFrequency,
  averageBaseGameTumbleRoundsPerTrigger: (m: BathalaMetrics) =>
    m.averageBaseGameTumbleRoundsPerTrigger,
  bathalaConversion: (m: BathalaMetrics) => m.bathalaToNextWinConversionRate,
  featureFrequency: (m: BathalaMetrics) => m.featureFrequency,
  averageFreeGamesPlayed: (m: BathalaMetrics) => m.averageFreeGamesPlayed,
  averageRetriggersPerFeature: (m: BathalaMetrics) => m.averageRetriggersPerFeature,
  baseGameContribution: (m: BathalaMetrics) => m.baseGameWinContribution,
  freeGameContribution: (m: BathalaMetrics) => m.freeGameWinContribution,
  multiplierContribution: (m: BathalaMetrics) =>
    (m.components.baseGameMultiplierUplift + m.components.freeGameMultiplierUplift) / m.totalBet,
  maximumObservedWin: (m: BathalaMetrics) => m.maximumObservedWin,
  standardDeviation: (m: BathalaMetrics) => m.standardDeviation,
};
export interface TargetEvaluation {
  key: TargetKey;
  value: number;
  range: TargetRange | null;
  status: Status;
}
export function evaluateTargets(report: SimulationReport): TargetEvaluation[] {
  return (Object.keys(targetValues) as TargetKey[]).map((key) => {
    const value = targetValues[key](report.metrics);
    const range = MANAGEMENT_TARGETS[key] ?? null;
    const pass =
      range !== null &&
      (range.minimum === undefined || value >= range.minimum) &&
      (range.maximum === undefined || value <= range.maximum);
    return { key, value, range, status: range === null ? 'N/A' : pass ? 'PASS' : 'FAIL' };
  });
}
export const overallStatus = (report: SimulationReport): Status =>
  reconcileReport(report).some((x) => x.status === 'FAIL')
    ? 'FAIL'
    : evaluateTargets(report).every((x) => x.status === 'N/A')
      ? 'N/A'
      : 'PASS';
