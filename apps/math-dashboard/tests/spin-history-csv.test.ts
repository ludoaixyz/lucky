import { describe, expect, it } from 'vitest';
import { renderDashboard } from '../src/components/dashboard.js';
import { TRANSLATIONS } from '../src/i18n/index.js';
import { normalizeImportedReport } from '../src/reports/report-normalizer.js';
import {
  importAnalysisArtifact,
  parseCsv,
  parseSpinHistoryCsv,
} from '../src/reports/spin-history-csv.js';
import type { WorkbenchSessionReport } from '../src/types/simulation-report.js';
import { createWorkspace, importIntoSet } from '../src/workspace/simulation-workspace.js';

const expandedHeaders = [
  'session_id',
  'session_seed',
  'spin_number',
  'timestamp',
  'configuration_id',
  'configuration_version',
  'profile_name',
  'bet',
  'base_win',
  'feature_win',
  'base_regular_win',
  'base_scatter_win',
  'base_multiplier_uplift',
  'feature_regular_win',
  'feature_scatter_win',
  'feature_multiplier_uplift',
  'total_win',
  'winning',
  'winning_outcomes',
  'total_tumble_rounds',
  'total_tumble_triggers',
  'base_tumble_rounds',
  'free_game_tumble_rounds',
  'free_game_tumble_triggers',
  'maximum_tumble_depth',
  'maximum_base_tumble_depth',
  'maximum_free_game_tumble_depth',
  'bathala_activations',
  'bathala_symbols_removed',
  'bathala_next_win_conversions',
  'multiplier_appeared',
  'multiplier_values',
  'summed_multiplier',
  'multiplied_tumble_rounds',
  'summed_effective_multipliers',
  'feature_triggered',
  'free_games_awarded',
  'free_games_played',
  'retrigger_count',
  'ending_free_game_multiplier',
] as const;

const csvCell = (value: string | number | boolean | null | undefined): string => {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const row = (overrides: Readonly<Record<string, string | number | boolean>>): string =>
  expandedHeaders.map((header) => csvCell(overrides[header] ?? 0)).join(',');
const expandedCsv = (lineBreak = '\n'): string =>
  [
    expandedHeaders.join(','),
    row({
      session_id: 'session-a',
      session_seed: 888,
      spin_number: 1,
      timestamp: '2026-08-18T00:00:01.000Z',
      configuration_id: 'config-a',
      configuration_version: '3.0.0',
      profile_name: 'High, Session',
      bet: 1,
      total_win: 0,
      winning: false,
      winning_outcomes: '[]',
      multiplier_appeared: false,
      multiplier_values: '',
      feature_triggered: false,
    }),
    row({
      session_id: 'session-a',
      session_seed: 888,
      spin_number: 2,
      timestamp: '2026-08-18T00:00:02.000Z',
      configuration_id: 'config-a',
      configuration_version: '3.0.0',
      profile_name: 'High, Session',
      bet: 2,
      base_win: 4,
      base_regular_win: 1,
      base_scatter_win: 1,
      base_multiplier_uplift: 2,
      total_win: 4,
      winning: true,
      winning_outcomes: '[{"symbolId":"H2","symbolCount":9}]',
      total_tumble_rounds: 2,
      total_tumble_triggers: 1,
      base_tumble_rounds: 2,
      maximum_tumble_depth: 2,
      maximum_base_tumble_depth: 2,
      bathala_activations: 1,
      bathala_symbols_removed: 3,
      bathala_next_win_conversions: 1,
      multiplier_appeared: true,
      multiplier_values: '2|3',
      summed_multiplier: 3,
      multiplied_tumble_rounds: 1,
      summed_effective_multipliers: 2,
      feature_triggered: false,
    }),
    row({
      session_id: 'session-a',
      session_seed: 888,
      spin_number: 3,
      timestamp: '2026-08-18T00:00:03.000Z',
      configuration_id: 'config-a',
      configuration_version: '3.0.0',
      profile_name: 'High, Session',
      bet: 1,
      base_win: 1,
      feature_win: 3,
      base_regular_win: 1,
      feature_regular_win: 1,
      feature_scatter_win: 1,
      feature_multiplier_uplift: 1,
      total_win: 4,
      winning: true,
      winning_outcomes: '[{"phase":"free","symbolId":"L1"}]',
      total_tumble_rounds: 3,
      total_tumble_triggers: 2,
      base_tumble_rounds: 1,
      free_game_tumble_rounds: 2,
      free_game_tumble_triggers: 1,
      maximum_tumble_depth: 2,
      maximum_base_tumble_depth: 1,
      maximum_free_game_tumble_depth: 2,
      bathala_activations: 2,
      bathala_symbols_removed: 5,
      bathala_next_win_conversions: 1,
      multiplier_appeared: true,
      multiplier_values: '5',
      summed_multiplier: 5,
      multiplied_tumble_rounds: 2,
      summed_effective_multipliers: 8,
      feature_triggered: true,
      free_games_awarded: 10,
      free_games_played: 12,
      retrigger_count: 1,
      ending_free_game_multiplier: 5,
    }),
    row({
      session_id: 'session-a',
      session_seed: 888,
      spin_number: 4,
      timestamp: '2026-08-18T00:00:04.000Z',
      configuration_id: 'config-a',
      configuration_version: '3.0.0',
      profile_name: 'High, Session',
      bet: 2,
      total_win: 0,
      winning: false,
      winning_outcomes: '[]',
      multiplier_appeared: false,
      multiplier_values: '',
      feature_triggered: false,
    }),
  ].join(lineBreak);

function report(csv = expandedCsv()): WorkbenchSessionReport {
  const result = parseSpinHistoryCsv(csv);
  expect(result.ok).toBe(true);
  if (!result.ok || result.report.sourceType !== 'workbench-session') throw new Error('fixture');
  return result.report;
}

describe('Workbench spin-history CSV analysis', () => {
  it('parses LF, CRLF, escaped quotes, and quoted JSON cells', () => {
    for (const lineBreak of ['\n', '\r\n']) {
      const parsed = parseCsv(expandedCsv(lineBreak));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.csv.rows).toHaveLength(4);
        expect(parsed.csv.rows[1]?.profile_name).toBe('High, Session');
        expect(parsed.csv.rows[1]?.winning_outcomes).toContain('"symbolId":"H2"');
      }
    }
    expect(parseCsv('bet,total_win,note\n1,2,"escaped ""quote"""').ok).toBe(true);
    expect(parseCsv('bet,total_win\n1,2,"unterminated').ok).toBe(false);
  });

  it('derives exact core statistics from normalized returns with variable bets', () => {
    const metrics = report().metrics;
    expect(metrics.totalSpins).toBe(4);
    expect(metrics.totalBet).toBe(6);
    expect(metrics.totalCreditedWin).toBe(8);
    expect(metrics.rtp).toBeCloseTo(4 / 3, 12);
    expect(metrics.winningSpinFrequency).toBe(0.5);
    expect(metrics.averageWinPerWinningSpin).toBe(3);
    expect(metrics.maximumObservedWin).toBe(4);
    expect(metrics.meanWinPerPaidSpin).toBe(1.5);
    expect(metrics.variance).toBe(2.75);
    expect(metrics.standardDeviation).toBeCloseTo(Math.sqrt(2.75), 12);
    expect(metrics.coefficientOfVariation).toBeCloseTo(Math.sqrt(2.75) / 1.5, 12);
    expect(metrics.standardError).toBeCloseTo(Math.sqrt(2.75) / 2, 12);
    expect(metrics.confidenceInterval95[0]).toBe(0);
    expect(metrics.confidenceInterval95[1]).toBeCloseTo(1.5 + 1.96 * (Math.sqrt(2.75) / 2), 12);
  });

  it('derives tumble, Bathala, multiplier, feature, composition, and tail metrics', () => {
    const metrics = report().metrics;
    expect(metrics.baseGameTumbleTriggerFrequency).toBe(0.5);
    expect(metrics.freeGameTumbleTriggerFrequency).toBeCloseTo(1 / 12, 12);
    expect(metrics.tumbleRoundsPerPaidSpin).toBe(1.25);
    expect(metrics.tumbleTriggerFrequency).toBe(0.75);
    expect(metrics.averageTumbleRoundsPerTriggeringSpin).toBeCloseTo(5 / 3, 12);
    expect(metrics.maximumObservedBaseGameTumbleDepth).toBe(2);
    expect(metrics.maximumObservedFreeGameTumbleDepth).toBe(2);
    expect(metrics.bathalaActivations).toBe(3);
    expect(metrics.bathalaActivationFrequency).toBe(0.6);
    expect(metrics.averageSymbolsRemoved).toBeCloseTo(8 / 3, 12);
    expect(metrics.bathalaToNextWinConversionRate).toBeCloseTo(2 / 3, 12);
    expect(metrics.multiplierAppearanceFrequency).toBe(0.5);
    expect(metrics.averageMultiplierValue).toBeCloseTo(10 / 3, 12);
    expect(metrics.averageSummedMultiplierOnMultipliedWins).toBeCloseTo(10 / 3, 12);
    expect(metrics.maximumSummedMultiplier).toBe(5);
    expect(metrics.freeGameTriggerCount).toBe(1);
    expect(metrics.featureFrequency).toBe(0.25);
    expect(metrics.averageFreeGamesPlayed).toBe(12);
    expect(metrics.averageInitiallyAwardedFreeGames).toBe(10);
    expect(metrics.retriggerCount).toBe(1);
    expect(metrics.averageRetriggersPerFeature).toBe(1);
    expect(metrics.featureLengthPercentiles).toEqual({
      p50: 12,
      p75: 12,
      p90: 12,
      p95: 12,
      p99: 12,
    });
    expect(metrics.components).toEqual({
      baseGameRegularPayout: 2,
      baseGameScatterPayout: 1,
      baseGameMultiplierUplift: 2,
      freeGameRegularPayout: 1,
      freeGameScatterPayout: 1,
      freeGameMultiplierUplift: 1,
    });
    expect(metrics.tails.every((tail) => tail.count === 0 && tail.frequency === 0)).toBe(true);
    expect(metrics.payoutHistogram).toEqual([
      { bucket: '0x', count: 2 },
      { bucket: '(0,1)x', count: 0 },
      { bucket: '[1,5)x', count: 2 },
      { bucket: '[5,20)x', count: 0 },
      { bucket: '20x+', count: 0 },
    ]);
    expect(metrics.payoutPercentiles).toEqual({ p50: 0, p75: 2, p90: 4, p95: 4, p99: 4 });
  });

  it('loads the legacy minimum schema with unavailable optional metrics instead of zero', () => {
    const result = parseSpinHistoryCsv('bet,total_win\r\n1,0\r\n2,4\r\n');
    expect(result.ok).toBe(true);
    if (!result.ok || result.report.sourceType !== 'workbench-session') return;
    expect(result.report.metrics.rtp).toBeCloseTo(4 / 3, 12);
    expect(result.report.metrics.featureFrequency).toBeNull();
    expect(result.report.metrics.bathalaActivations).toBeNull();
    expect(result.report.metrics.components.baseGameRegularPayout).toBeNull();
    expect(result.report.metricAvailability.featureFrequency).toBe('unavailable');
  });

  it('accepts the previous 31-column Workbench export with partial capabilities', () => {
    const headers = [
      'session_id',
      'session_seed',
      'spin_number',
      'spin_index',
      'timestamp',
      'configuration_id',
      'configuration_version',
      'profile_name',
      'bet',
      'base_win',
      'feature_win',
      'total_win',
      'win_multiple',
      'winning',
      'winning_outcomes',
      'total_tumble_rounds',
      'base_tumble_rounds',
      'free_game_tumble_rounds',
      'maximum_tumble_depth',
      'bathala_activations',
      'bathala_symbols_removed',
      'multiplier_appeared',
      'multiplier_values',
      'summed_multiplier',
      'scatter_count',
      'feature_triggered',
      'free_games_awarded',
      'free_games_played',
      'retrigger_count',
      'ending_free_game_multiplier',
      'maximum_win_applied',
    ];
    const values = [
      's',
      '7',
      '1',
      '0',
      '2026-08-18T00:00:00.000Z',
      'cfg',
      '3',
      'Profile',
      '1',
      '2',
      '0',
      '2',
      '2',
      'true',
      '[]',
      '1',
      '1',
      '0',
      '1',
      '0',
      '0',
      'false',
      '',
      '0',
      '0',
      'false',
      '0',
      '0',
      '0',
      '',
      'false',
    ];
    const analyzed = report(`${headers.join(',')}\r\n${values.join(',')}\r\n`);
    expect(analyzed.metrics.rtp).toBe(2);
    expect(analyzed.capabilities.rtpCompositionSimplified).toBe(true);
    expect(analyzed.capabilities.rtpCompositionDetailed).toBe(false);
    expect(analyzed.metrics.bathalaToNextWinConversionRate).toBeNull();
  });

  it('loads a 101-spin Workbench session without treating its small sample as an error', () => {
    const csv = [
      'bet,total_win',
      ...Array.from({ length: 101 }, (_, index) => `1,${index % 5 === 0 ? 2 : 0}`),
    ].join('\n');
    const analyzed = report(csv);
    expect(analyzed.metrics.totalSpins).toBe(101);
    expect(analyzed.analysisWarnings).toContain('limitedSampleWarning');
  });

  it('warns about malformed optional cells and leaves affected metrics unavailable', () => {
    const analyzed = report('bet,total_win,bathala_activations\n1,0,broken\n1,2,1');
    expect(analyzed.metrics.bathalaActivations).toBeNull();
    expect(analyzed.analysisWarnings).toContain('malformedOptionalWarning');
  });

  it('distinguishes observed zero features and wins from unavailable data', () => {
    const zeroFeatureCsv = [
      'bet,total_win,feature_triggered,free_games_awarded,free_games_played,retrigger_count,ending_free_game_multiplier',
      '1,0,false,0,0,0,',
      '1,0,false,0,0,0,',
    ].join('\n');
    const analyzed = report(zeroFeatureCsv).metrics;
    expect(analyzed.winningSpinFrequency).toBe(0);
    expect(analyzed.variance).toBe(0);
    expect(analyzed.freeGameTriggerCount).toBe(0);
    expect(analyzed.featureFrequency).toBe(0);
    expect(analyzed.averageFreeGamesPlayed).toBeNull();
    expect(analyzed.featureLengthPercentiles.p50).toBeNull();
  });

  it('rejects unusable CSV while preserving the previous workspace report', () => {
    for (const csv of [
      'total_win\n1',
      'bet\n1',
      'bet,total_win\n',
      'bet,total_win\nnope,2',
      'bet,total_win\n1,nope',
    ])
      expect(parseSpinHistoryCsv(csv).ok).toBe(false);
    let workspace = importIntoSet(
      createWorkspace(),
      'sim-1',
      { ok: true, report: report() },
      'good.csv',
    );
    const previous = workspace.sets[0]?.report;
    workspace = importIntoSet(workspace, 'sim-1', parseSpinHistoryCsv('bet\n1'), 'bad.csv');
    expect(workspace.sets[0]?.report).toBe(previous);
    expect(workspace.sets[0]?.lastImportStatus).toBe('rejected');
  });

  it('routes JSON and CSV separately and renders source-aware partial analysis', () => {
    expect(importAnalysisArtifact('session.csv', expandedCsv()).ok).toBe(true);
    expect(importAnalysisArtifact('notes.txt', expandedCsv()).ok).toBe(false);
    const html = renderDashboard(report('bet,total_win\n1,0\n1,2'), {
      locale: 'en',
      labels: TRANSLATIONS.en.labels,
    });
    expect(html).toContain('WORKBENCH SESSION');
    expect(html).toContain('WORKBENCH CSV');
    expect(html).toContain('PARTIAL DATA');
    expect(html).not.toContain('Limited sample');
    expect(html).toContain('N/A');
    expect(html).not.toContain('MONTE CARLO SIMULATION');
  });
});

describe('strict JSON artifact detection', () => {
  it('identifies obvious Workbench config JSON without weakening report validation', () => {
    const config = {
      schemaVersion: '2.0.0',
      configurationId: 'config-a',
      baseSymbolWeights: [],
      freegameSymbolWeights: [],
      paytable: [],
      scatter: {},
      bathala: {},
    };
    const result = normalizeImportedReport(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toContain('game configuration');
      expect(result.errors[0]?.message).toContain('Math Workbench CONFIG workflow');
    }
    expect(normalizeImportedReport({ metadata: {} }).ok).toBe(false);
  });
});
