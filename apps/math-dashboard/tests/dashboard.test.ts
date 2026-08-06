// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bindPrintLayout, setPrintLayout } from '../src/print.js';
import {
  comparisonRows,
  evaluateTargets,
  featureFrequencyOdds,
  nestedSampleNotice,
  plainLanguageSummary,
  reconcileReport,
  riskFlags,
} from '../src/reports/analysis.js';
import { parseSimulationReport, validateSimulationReport } from '../src/reports/validation.js';
import type { LoadedReport, SimulationReport } from '../src/types/simulation-report.js';

const millionJson = readFileSync(
  resolve(process.cwd(), 'apps/math-dashboard/public/reports/simulation-2026-1000000.json'),
  'utf8',
);
const thousandJson = readFileSync(
  resolve(process.cwd(), 'apps/math-dashboard/public/reports/simulation-2026-1000.json'),
  'utf8',
);

function reportFrom(json: string): SimulationReport {
  const result = parseSimulationReport(json);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.report;
}

const million = reportFrom(millionJson);
const thousand = reportFrom(thousandJson);

describe('simulation report validation', () => {
  it('accepts complete deterministic Monte Carlo schema 1.2.0 reports', () => {
    const result = validateSimulationReport(JSON.parse(millionJson) as unknown);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.paidSpins).toBe(1_000_000);
  });

  it('rejects missing required metrics with useful field names', () => {
    const malformed = { ...(JSON.parse(millionJson) as Record<string, unknown>) };
    delete malformed.creditedTotalRtp;
    const result = validateSimulationReport(malformed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('creditedTotalRtp');
  });

  it('handles malformed JSON without throwing', () => {
    const result = parseSimulationReport('{"schemaVersion":');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^Malformed JSON:/u);
  });
});

describe('management calculations', () => {
  it('reconciles RTP, payouts, and bucket totals', () => {
    expect(reconcileReport(million).every((check) => check.status === 'PASS')).toBe(true);
  });

  it('fails payout bucket reconciliation without correcting the report', () => {
    const changed = {
      ...million,
      payoutDistribution: million.payoutDistribution.map((bucket, index) =>
        index === 0 ? { ...bucket, count: bucket.count - 1 } : bucket,
      ),
    };
    expect(
      reconcileReport(changed).find((check) => check.label.includes('bucket counts'))?.status,
    ).toBe('FAIL');
    expect(changed.payoutDistribution[0]?.count).toBe(665_032);
  });

  it('calculates feature-frequency odds', () => {
    expect(featureFrequencyOdds(million)).toBeCloseTo(115.6203, 3);
  });

  it('evaluates provisional management targets without approval language', () => {
    const targets = evaluateTargets(million);
    expect(targets.every((target) => target.status === 'PASS')).toBe(true);
    expect(JSON.stringify(targets)).not.toMatch(/regulatory approval/iu);
  });

  it('generates small-sample warnings at both thresholds', () => {
    expect(
      riskFlags(thousand)
        .map((flag) => flag.message)
        .join(' '),
    ).toContain('Smoke-test-only sample');
    expect(
      riskFlags({ ...million, paidSpins: 50_000 })
        .map((flag) => flag.message)
        .join(' '),
    ).toContain('Limited sample');
  });

  it('generates a report-driven plain-language summary', () => {
    const summary = plainLanguageSummary(million);
    expect(summary).toContain('95.37%');
    expect(summary).toContain('1,000,000 simulated paid spins');
    expect(summary).toContain('once every 115.6 spins');
    expect(summary).toContain('met all current provisional targets');
  });
});

describe('comparison and print behavior', () => {
  it('calculates absolute and relative comparison differences', () => {
    const credited = comparisonRows(thousand, million).find((row) => row.metric === 'Credited RTP');
    expect(credited?.absoluteDifference).toBeCloseTo(0.0543236, 7);
    expect(credited?.relativeDifference).toBeCloseTo(0.0604, 3);
  });

  it('labels same-seed different-size reports as nested deterministic samples', () => {
    const loaded: LoadedReport[] = [
      { id: 'small', label: 'Small', source: 'built-in', report: thousand },
      { id: 'large', label: 'Large', source: 'built-in', report: million },
    ];
    expect(nestedSampleNotice(loaded)).toContain('nested deterministic samples');
    expect(nestedSampleNotice(loaded)).toContain('not independent runs');
  });

  it('toggles the print layout class', () => {
    const dispose = bindPrintLayout();
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.body.classList.contains('print-layout')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('print-layout')).toBe(false);
    dispose();
    setPrintLayout(false);
  });
});
