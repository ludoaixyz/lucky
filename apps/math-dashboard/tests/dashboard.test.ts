import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRANSLATIONS } from '../src/i18n/index.js';
import { componentRtp, frequencyOdds, reconcileReport } from '../src/reports/analysis.js';
import { normalizeReport, parseSimulationReport } from '../src/reports/report-normalizer.js';
const metrics = {
  schemaVersion: '2.0.0',
  methodology: 'deterministic-streaming-monte-carlo',
  configurationId: 'test',
  seed: 2026,
  totalSpins: 100,
  totalBet: 100,
  totalCreditedWin: 50,
  rtp: 0.5,
  winningSpinFrequency: 0.25,
  averageWinPerWinningSpin: 2,
  baseGameTumbleTriggerFrequency: 0.2,
  freeGameTumbleTriggerFrequency: 0.1,
  averageBaseGameTumbleRoundsPerTrigger: 1.5,
  averageFreeGameTumbleRoundsPerTrigger: 1.2,
  tumbleRoundsPerPaidSpin: 0.4,
  tumbleTriggerFrequency: 0.2,
  averageTumbleRoundsPerTriggeringSpin: 1.5,
  maximumObservedBaseGameTumbleDepth: 3,
  maximumObservedFreeGameTumbleDepth: 2,
  maximumObservedTumbleDepth: 3,
  bathalaActivations: 10,
  bathalaActivationFrequency: 0.5,
  averageSymbolsRemoved: 3,
  bathalaToNextWinConversionRate: 0.4,
  multiplierAppearanceFrequency: 0.1,
  averageMultiplierValue: 5,
  averageSummedMultiplierOnMultipliedWins: 8,
  maximumSummedMultiplier: 20,
  freeGameTriggerCount: 1,
  featureFrequency: 0.01,
  averageFreeGamesPlayed: 15,
  averageInitiallyAwardedFreeGames: 15,
  maximumObservedFeatureLength: 15,
  featureLengthPercentiles: { p50: 15, p75: 15, p90: 15, p95: 15, p99: 15 },
  retriggerCount: 0,
  averageRetriggersPerFeature: 0,
  averageEndingFreeGameMultiplier: 4,
  freeGameWinContribution: 0.1,
  baseGameWinContribution: 0.4,
  maximumObservedWin: 10,
  meanWinPerPaidSpin: 0.5,
  variance: 2,
  standardDeviation: Math.sqrt(2),
  coefficientOfVariation: 2.828,
  standardError: 0.1414,
  confidenceInterval95: [0.2228, 0.7772],
  components: {
    baseGameRegularPayout: 10,
    baseGameScatterPayout: 2,
    baseGameMultiplierUplift: 28,
    freeGameRegularPayout: 3,
    freeGameScatterPayout: 1,
    freeGameMultiplierUplift: 6,
  },
  tails: [],
};
const canonical = {
  metadata: {
    schemaVersion: '2.0.0',
    gameId: 'lucky888',
    gameName: 'Lucky888',
    gameVersion: '2.0.0',
    configurationId: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
  },
  simulation: { methodology: 'deterministic-streaming-monte-carlo', seed: 2026, spins: 100 },
  metrics,
};
describe('Bathala report parsing', () => {
  it('loads the bundled 100,000-spin Bathala acceptance report', () => {
    const json = readFileSync(
      resolve(
        process.cwd(),
        'apps/math-dashboard/public/reports/bathala-simulation-2026-100000.json',
      ),
      'utf8',
    );
    const result = parseSimulationReport(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.metrics.rtp).toBeCloseTo(0.6354815, 7);
      expect(result.report.metrics.freeGameTriggerCount).toBe(20);
    }
  });
  it('accepts schema 2 canonical envelope', () => expect(normalizeReport(canonical).ok).toBe(true));
  it('normalizes the current config/simulation/metrics envelope', () =>
    expect(
      normalizeReport({
        config: { configurationId: 'test', source: 'placeholder calibration profile' },
        simulation: { seed: 2026, spins: 100 },
        metrics,
      }).ok,
    ).toBe(true));
  it('rejects legacy schema and malformed JSON', () => {
    expect(normalizeReport({ schemaVersion: '1.2.0' }).ok).toBe(false);
    expect(parseSimulationReport('{').ok).toBe(false);
  });
  it('rejects missing metadata, invalid methodology, non-finite, negative, and ratios over one', () => {
    for (const changed of [
      { metadata: { ...canonical.metadata, gameVersion: '' } },
      { simulation: { ...canonical.simulation, methodology: 'wrong' } },
      { metrics: { ...metrics, rtp: Infinity } },
      { metrics: { ...metrics, totalSpins: -1 } },
      { metrics: { ...metrics, featureFrequency: 2 } },
    ])
      expect(normalizeReport({ ...canonical, ...changed }).ok).toBe(false);
  });
  it('accepts empty tails and rejects malformed components', () => {
    expect(normalizeReport(canonical).ok).toBe(true);
    expect(normalizeReport({ ...canonical, metrics: { ...metrics, components: {} } }).ok).toBe(
      false,
    );
  });
});
describe('derived metrics', () => {
  it('calculates RTP, odds, and reconciliation', () => {
    const result = normalizeReport(canonical);
    if (!result.ok) throw new Error('fixture');
    expect(componentRtp(result.report, 28)).toBe(0.28);
    expect(frequencyOdds(0.01)).toBe(100);
    expect(frequencyOdds(0)).toBeNull();
    expect(reconcileReport(result.report).every((x) => x.status === 'PASS')).toBe(true);
  });
});
describe('localization and export contract', () => {
  it('has every English key in all four locales and no obsolete terminology', () => {
    const keys = Object.keys(TRANSLATIONS.en.labels);
    for (const locale of Object.values(TRANSLATIONS)) {
      expect(keys.every((k) => locale.labels[k])).toBe(true);
      expect(Object.values(locale.labels).join(' ')).not.toMatch(
        /payline|line win|WILD|reel strip/i,
      );
    }
  });
});
