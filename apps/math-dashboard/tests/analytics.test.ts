import { describe, expect, it } from 'vitest';
import {
  formatAdaptivePercent,
  formatCredits,
  formatMultiplier,
  formatOneIn,
} from '../src/i18n/format.js';
import { MANAGEMENT_TARGETS, type ManagementTargets } from '../src/config/management-targets.js';
import {
  dataQualityIssues,
  evaluateTargetValue,
  evaluateTargets,
  overallStatus,
} from '../src/reports/analysis.js';
import { simulationAssessment } from '../src/reports/assessment.js';
import { deriveAnalytics } from '../src/reports/derived.js';
import { normalizeReport } from '../src/reports/report-normalizer.js';
import type { SimulationReport } from '../src/types/simulation-report.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fixture(): SimulationReport {
  const raw = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'apps/math-dashboard/public/reports/bathala-simulation-2026-1000000.json',
      ),
      'utf8',
    ),
  ) as unknown;
  const result = normalizeReport(raw);
  if (!result.ok) throw new Error('fixture rejected');
  return result.report;
}

describe('shared dashboard formatting', () => {
  it('formats tiny percentages, odds, credits, and multipliers deterministically', () => {
    expect(formatAdaptivePercent(0.00001, 'en')).toBe('<0.01%');
    expect(formatOneIn(0.000196, 'en', '1 in')).toBe('1 in 5,102');
    expect(formatOneIn(0, 'en', '1 in')).toBe('—');
    expect(formatCredits(441643.8, 'en')).toBe('441,643.80 credits');
    expect(formatMultiplier(1055.25, 'en')).toBe('1,055.25×');
  });
});

describe('derived analytics layer', () => {
  it('derives component/source RTP, Bathala rates, CI width, and tail observations without mutating input', () => {
    const report = fixture();
    const before = JSON.stringify(report);
    const d = deriveAnalytics(report);
    expect(d.baseMultiplierRtp).toBeCloseTo(
      report.metrics.components.baseGameMultiplierUplift / report.metrics.totalBet,
      12,
    );
    expect(d.totalMultiplierRtp).toBeCloseTo(
      (report.metrics.components.baseGameMultiplierUplift +
        report.metrics.components.freeGameMultiplierUplift) /
        report.metrics.totalBet,
      12,
    );
    expect(d.totalRegularRtp + d.totalScatterRtp + d.totalMultiplierRtp).toBeCloseTo(
      report.metrics.rtp,
      8,
    );
    expect(d.featureOneInN).toBeCloseTo(1 / report.metrics.featureFrequency, 12);
    expect(d.ciWidth).toBeCloseTo(
      report.metrics.confidenceInterval95[1] - report.metrics.confidenceInterval95[0],
      12,
    );
    expect(d.highestObservedTailThreshold).toBe(2500);
    expect(JSON.stringify(report)).toBe(before);
  });
});

describe('management target evaluation', () => {
  it('handles no target, pass boundaries, warnings, and failures', () => {
    expect(evaluateTargetValue(0.95)).toBe('N/A');
    const target = {
      metric: 'rtp',
      type: 'range' as const,
      minimum: 0.95,
      maximum: 0.96,
      warningMinimum: 0.94,
      warningMaximum: 0.97,
      criticality: 'critical' as const,
    };
    expect(evaluateTargetValue(0.95, target)).toBe('PASS');
    expect(evaluateTargetValue(0.96, target)).toBe('PASS');
    expect(evaluateTargetValue(0.945, target)).toBe('WARN');
    expect(evaluateTargetValue(0.9, target)).toBe('FAIL');
  });
  it('derives uncalibrated, pass, warning, and critical failure profile states', () => {
    const report = fixture();
    expect(overallStatus(report, MANAGEMENT_TARGETS)).toBe('UNCALIBRATED');
    const pass: ManagementTargets = {
      rtp: { metric: 'rtp', type: 'exact', exact: report.metrics.rtp, criticality: 'critical' },
    };
    const warn: ManagementTargets = {
      rtp: {
        metric: 'rtp',
        type: 'range',
        minimum: report.metrics.rtp + 0.01,
        warningMinimum: report.metrics.rtp - 0.01,
        criticality: 'critical',
      },
    };
    const fail: ManagementTargets = {
      rtp: {
        metric: 'rtp',
        type: 'minimum',
        minimum: report.metrics.rtp + 0.1,
        warningMinimum: report.metrics.rtp + 0.05,
        criticality: 'critical',
      },
    };
    expect(overallStatus(report, pass)).toBe('PASS');
    expect(overallStatus(report, warn)).toBe('WARN');
    expect(overallStatus(report, fail)).toBe('FAIL');
    expect(evaluateTargets(report, fail).find((x) => x.key === 'rtp')?.delta).toBeCloseTo(
      report.metrics.rtp - (report.metrics.rtp + 0.1),
      12,
    );
  });
});

describe('assessment and quality diagnostics', () => {
  it('produces a bounded deterministic neutral assessment', () => {
    const findings = simulationAssessment(fixture());
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(findings.length).toBeLessThanOrEqual(7);
    expect(findings.map((x) => x.key)).toContain('findingConfidence');
    expect(findings.every((x) => x.status === 'INFO')).toBe(true);
  });
  it('flags contradictory feature counters and invalid tail ordering', () => {
    const report = fixture();
    const changed: SimulationReport = {
      ...report,
      metrics: {
        ...report.metrics,
        freeGameTriggerCount: 0,
        tails: [...report.metrics.tails].reverse(),
      },
    };
    const keys = dataQualityIssues(changed).map((x) => x.key);
    expect(keys).toContain('dqFeatureCount');
    expect(keys).toContain('dqFeatureContribution');
    expect(keys).toContain('dqTailOrder');
  });
});
