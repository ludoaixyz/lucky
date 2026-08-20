import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatNullableMetric, renderCompareDashboard } from '../src/components/workspace.js';
import { TRANSLATIONS } from '../src/i18n/index.js';
import { normalizeReport, parseSimulationReport } from '../src/reports/report-normalizer.js';
import type { SimulationReport } from '../src/types/simulation-report.js';
import {
  createWorkspace,
  importIntoSet,
  persistWorkspace,
  removeSetReport,
  renameSet,
  restoreWorkspace,
  selectSet,
  setBaseline,
  setViewMode,
  workspaceWarnings,
} from '../src/workspace/simulation-workspace.js';

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
  if (!result.ok) throw new Error('fixture');
  return result.report;
}

const valid = (report: SimulationReport) => ({ ok: true as const, report });

describe('simulation workspace independence', () => {
  it('owns three reports independently and removes only the targeted report', () => {
    const reportA = fixture();
    const reportB = {
      ...reportA,
      metadata: { ...reportA.metadata, configurationId: 'profile-b' },
      metrics: { ...reportA.metrics, rtp: 0.77 },
    };
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', valid(reportA), 'a.json');
    workspace = importIntoSet(workspace, 'sim-2', valid(reportB), 'b.json');
    expect(workspace.sets[0]?.report?.metadata.configurationId).toBe('lucky888-bathala-aligned-v3');
    expect(workspace.sets[1]?.report?.metadata.configurationId).toBe('profile-b');
    expect(workspace.sets[2]?.report).toBeNull();
    workspace = removeSetReport(workspace, 'sim-2');
    expect(workspace.sets[0]?.report).toBe(reportA);
    expect(workspace.sets[1]?.report).toBeNull();
    expect(workspace.sets[2]?.report).toBeNull();
  });

  it('transactionally rejects invalid replacement while preserving the valid report', () => {
    const report = fixture();
    let workspace = importIntoSet(createWorkspace(), 'sim-1', valid(report), 'valid.json');
    workspace = importIntoSet(
      workspace,
      'sim-1',
      parseSimulationReport('{"metadata":{}}'),
      'invalid.json',
    );
    expect(workspace.sets[0]?.report).toBe(report);
    expect(workspace.sets[0]?.lastImportStatus).toBe('rejected');
    expect(workspace.sets[0]?.validationErrors.length).toBeGreaterThan(0);
  });

  it('allows duplicate reports and emits non-blocking warnings', () => {
    const report = fixture();
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', valid(report), 'same.json');
    workspace = importIntoSet(workspace, 'sim-2', valid(report), 'same.json');
    expect(workspace.sets[0]?.report).toBe(report);
    expect(workspace.sets[1]?.report).toBe(report);
    expect(workspaceWarnings(workspace).filter((w) => w.kind === 'duplicate')).toHaveLength(2);
  });
});

describe('nullable comparison semantics', () => {
  it('formats empty set values as N/A and preserves genuine zero observations', () => {
    const l = TRANSLATIONS.en.labels;
    const empty = createWorkspace().sets[2]!;
    expect(formatNullableMetric(empty, 'rtp', 'en', l)).toBe('N/A');
    const report = fixture();
    const zero = { ...report, metrics: { ...report.metrics, featureFrequency: 0 } };
    const set = importIntoSet(createWorkspace(), 'sim-3', valid(zero), 'zero.json').sets[2]!;
    expect(formatNullableMetric(set, 'featureFrequency', 'en', l)).not.toBe('N/A');
    expect(formatNullableMetric(set, 'featureFrequency', 'en', l)).not.toMatch(
      /NaN|Infinity|undefined/,
    );
  });

  it('renders the two visible configurations with a Delta column', () => {
    const report = fixture();
    const reportB = { ...report, metadata: { ...report.metadata, configurationId: 'profile-b' } };
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', valid(report), 'a.json');
    workspace = importIntoSet(workspace, 'sim-2', valid(reportB), 'b.json');
    const html = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(html).toContain('lucky888-bathala-aligned-v3');
    expect(html).toContain('profile-b');
    expect(html).toContain('Sim 2 vs Sim 1');
    expect(html).not.toContain('Sim 3');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('workspace persistence', () => {
  it('restores report-to-set mapping, labels, selected set, baseline, and mode', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const report = fixture();
    let workspace = createWorkspace();
    workspace = renameSet(workspace, 'sim-2', 'Balanced');
    workspace = importIntoSet(workspace, 'sim-2', valid(report), 'balanced.json');
    workspace = selectSet(workspace, 'sim-2');
    workspace = setBaseline(workspace, 'sim-2');
    workspace = setViewMode(workspace, 'detail');
    persistWorkspace(storage, workspace);
    const restored = restoreWorkspace(storage);
    expect(restored?.sets[0]?.report).toBeNull();
    expect(restored?.sets[1]?.label).toBe('Balanced');
    expect(restored?.sets[1]?.report?.metadata.configurationId).toBe(
      report.metadata.configurationId,
    );
    expect(restored?.selectedSetId).toBe('sim-2');
    expect(restored?.baselineSetId).toBe('sim-2');
    expect(restored?.viewMode).toBe('detail');
  });
});
