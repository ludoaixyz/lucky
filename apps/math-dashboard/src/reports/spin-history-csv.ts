import type {
  CsvCapabilities,
  MetricAvailability,
  TailMetric,
  WorkbenchAnalysisMetrics,
  WorkbenchSessionReport,
} from '../types/simulation-report.js';
import { parseImportedSimulationReport, type NormalizationResult } from './report-normalizer.js';
import type { ValidationIssue } from './validation.js';
import { isRecord } from './validation.js';

export const WORKBENCH_TAIL_THRESHOLDS = [
  10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
] as const;
export const SMALL_SESSION_SPIN_THRESHOLD = 10_000;

export interface ParsedCsv {
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

function csvError(message: string, field = '$'): NormalizationResult {
  return { ok: false, errors: [{ field, message }] };
}

export function parseCsv(
  text: string,
): { ok: true; csv: ParsedCsv } | { ok: false; errors: ValidationIssue[] } {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted)
    return {
      ok: false,
      errors: [{ field: '$', message: 'CSV import rejected. Unterminated quoted field.' }],
    };
  row.push(cell);
  if (row.some((value) => value.length > 0)) records.push(row);
  if (!records.length)
    return {
      ok: false,
      errors: [{ field: '$', message: 'CSV import rejected. The file is empty.' }],
    };
  const headers = records[0]!.map((value, index) =>
    (index === 0 ? value.replace(/^\uFEFF/u, '') : value).trim().toLowerCase(),
  );
  if (headers.some((header) => !header))
    return {
      ok: false,
      errors: [{ field: '$', message: 'CSV import rejected. Header names must not be empty.' }],
    };
  if (new Set(headers).size !== headers.length)
    return {
      ok: false,
      errors: [{ field: '$', message: 'CSV import rejected. Header names must be unique.' }],
    };
  const rows = records
    .slice(1)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    );
  return { ok: true, csv: { headers, rows } };
}

const hasAll = (headers: ReadonlySet<string>, names: readonly string[]): boolean =>
  names.every((name) => headers.has(name));
const optionalNumber = (row: Readonly<Record<string, string>>, name: string): number | null => {
  const raw = row[name];
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const optionalBoolean = (row: Readonly<Record<string, string>>, name: string): boolean | null => {
  const raw = row[name]?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
};
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
const divide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;
const nullableDivide = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;
const percentile = (sorted: readonly number[], probability: number): number | null =>
  sorted.length ? (sorted[Math.ceil(probability * sorted.length) - 1] ?? null) : null;

function availabilityMap(
  metrics: WorkbenchAnalysisMetrics,
): Readonly<Record<string, MetricAvailability>> {
  const entries: [string, MetricAvailability][] = [];
  for (const [name, value] of Object.entries(metrics)) {
    if (name === 'components') {
      for (const [component, componentValue] of Object.entries(
        value as Record<string, number | null>,
      ))
        entries.push([
          `components.${component}`,
          componentValue === null ? 'unavailable' : 'derived',
        ]);
    } else if (name === 'featureLengthPercentiles') {
      for (const [percentileName, percentileValue] of Object.entries(
        value as Record<string, number | null>,
      ))
        entries.push([
          `featureLengthPercentiles.${percentileName}`,
          percentileValue === null ? 'unavailable' : 'derived',
        ]);
    } else entries.push([name, value === null ? 'unavailable' : 'derived']);
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function parseSpinHistoryCsv(text: string): NormalizationResult {
  const parsed = parseCsv(text);
  if (!parsed.ok) return parsed;
  const { headers, rows } = parsed.csv;
  const headerSet = new Set(headers);
  for (const required of ['bet', 'total_win'])
    if (!headerSet.has(required))
      return csvError(`CSV import rejected. Required column missing: ${required}`, required);
  if (!rows.length) return csvError('CSV import rejected. At least one data row is required.');

  const bets: number[] = [];
  const totalWins: number[] = [];
  for (const [index, row] of rows.entries()) {
    const bet = Number(row.bet);
    const totalWin = Number(row.total_win);
    if (!Number.isFinite(bet) || bet <= 0)
      return csvError(
        `CSV import rejected. Row ${index + 2} has an invalid bet.`,
        `row[${index + 2}].bet`,
      );
    if (!Number.isFinite(totalWin) || totalWin < 0)
      return csvError(
        `CSV import rejected. Row ${index + 2} has an invalid total_win.`,
        `row[${index + 2}].total_win`,
      );
    bets.push(bet);
    totalWins.push(totalWin);
  }

  const capabilities: CsvCapabilities = Object.freeze({
    core: true,
    mechanics: hasAll(headerSet, ['base_win', 'feature_win']),
    tumble: hasAll(headerSet, [
      'total_tumble_rounds',
      'base_tumble_rounds',
      'free_game_tumble_rounds',
    ]),
    bathala: hasAll(headerSet, ['bathala_activations', 'bathala_symbols_removed']),
    multiplier: hasAll(headerSet, [
      'multiplier_appeared',
      'multiplier_values',
      'summed_multiplier',
    ]),
    feature: hasAll(headerSet, [
      'feature_triggered',
      'free_games_awarded',
      'free_games_played',
      'retrigger_count',
      'ending_free_game_multiplier',
    ]),
    rtpCompositionSimplified: hasAll(headerSet, ['base_win', 'feature_win']),
    rtpCompositionDetailed: hasAll(headerSet, [
      'base_regular_win',
      'base_scatter_win',
      'base_multiplier_uplift',
      'feature_regular_win',
      'feature_scatter_win',
      'feature_multiplier_uplift',
    ]),
  });
  const totalSpins = rows.length;
  const totalBet = sum(bets);
  const totalCreditedWin = sum(totalWins);
  const returns = totalWins.map((win, index) => win / bets[index]!);
  const winners = rows.map((row, index) => optionalBoolean(row, 'winning') ?? returns[index]! > 0);
  const winningReturns = returns.filter((_, index) => winners[index]);
  const meanWinPerPaidSpin = sum(returns) / totalSpins;
  const variance = sum(returns.map((value) => (value - meanWinPerPaidSpin) ** 2)) / totalSpins;
  const standardDeviation = Math.sqrt(Math.max(0, variance));
  const standardError = standardDeviation / Math.sqrt(totalSpins);
  const columnNumbers = (name: string): number[] | null => {
    if (!headerSet.has(name)) return null;
    const values = rows.map((row) => optionalNumber(row, name));
    return values.some((value) => value === null) ? null : (values as number[]);
  };
  const component = (name: string): number | null => {
    const values = columnNumbers(name);
    return values === null ? null : sum(values);
  };
  const maximum = (name: string): number | null => {
    const values = columnNumbers(name);
    return values === null ? null : Math.max(0, ...values);
  };
  const baseWin = component('base_win');
  const featureWin = component('feature_win');

  const totalTumbleRounds = component('total_tumble_rounds');
  const baseTumbleRounds = component('base_tumble_rounds');
  const freeTumbleRounds = component('free_game_tumble_rounds');
  const totalTumbleTriggers = component('total_tumble_triggers');
  const freeTumbleTriggers = component('free_game_tumble_triggers');
  const baseTumbleTriggers = headerSet.has('base_tumble_rounds')
    ? rows.filter((row) => (optionalNumber(row, 'base_tumble_rounds') ?? 0) > 0).length
    : null;
  const freeGamesPlayedTotal = component('free_games_played');
  const bathalaActivations = component('bathala_activations');
  const bathalaRemoved = component('bathala_symbols_removed');
  const bathalaConversions = component('bathala_next_win_conversions');

  const multiplierValues = headerSet.has('multiplier_values')
    ? rows.flatMap((row) =>
        (row.multiplier_values ?? '')
          .split('|')
          .filter(Boolean)
          .map(Number)
          .filter((value) => Number.isFinite(value) && value >= 0),
      )
    : [];
  const multiplierFlags = headerSet.has('multiplier_appeared')
    ? rows.map((row) => optionalBoolean(row, 'multiplier_appeared'))
    : null;
  const multiplierSpins =
    multiplierFlags && multiplierFlags.every((value) => value !== null)
      ? multiplierFlags.filter(Boolean).length
      : null;
  const maxSummedMultiplier = maximum('summed_multiplier');
  const multipliedRounds = component('multiplied_tumble_rounds');
  const summedEffectiveMultipliers = component('summed_effective_multipliers');

  const parsedFeatureFlags = headerSet.has('feature_triggered')
    ? rows.map((row) => optionalBoolean(row, 'feature_triggered'))
    : null;
  const featureFlags =
    parsedFeatureFlags && parsedFeatureFlags.every((value) => value !== null)
      ? parsedFeatureFlags.filter((value): value is boolean => value !== null)
      : null;
  const featureRows = featureFlags ? rows.filter((_, index) => featureFlags[index]) : [];
  const featureCount = featureFlags ? featureRows.length : null;
  const featureLengths = featureFlags
    ? featureRows
        .map((row) => optionalNumber(row, 'free_games_played'))
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)
    : [];
  const featureSum = (name: string): number | null =>
    featureFlags && headerSet.has(name)
      ? (() => {
          const values = featureRows.map((row) => optionalNumber(row, name));
          return values.some((value) => value === null) ? null : sum(values as number[]);
        })()
      : null;
  const freeGamesPlayed = featureSum('free_games_played');
  const freeGamesAwarded = featureSum('free_games_awarded');
  const retriggerCount = featureSum('retrigger_count');
  const endingMultipliers = featureSum('ending_free_game_multiplier');

  const detailedComponents = {
    baseGameRegularPayout: component('base_regular_win'),
    baseGameScatterPayout: component('base_scatter_win'),
    baseGameMultiplierUplift: component('base_multiplier_uplift'),
    freeGameRegularPayout: component('feature_regular_win'),
    freeGameScatterPayout: component('feature_scatter_win'),
    freeGameMultiplierUplift: component('feature_multiplier_uplift'),
  } as const;
  const sortedReturns = [...returns].sort((left, right) => left - right);
  const payoutHistogram = [
    { bucket: '0x', count: returns.filter((value) => value === 0).length },
    { bucket: '(0,1)x', count: returns.filter((value) => value > 0 && value < 1).length },
    { bucket: '[1,5)x', count: returns.filter((value) => value >= 1 && value < 5).length },
    { bucket: '[5,20)x', count: returns.filter((value) => value >= 5 && value < 20).length },
    { bucket: '20x+', count: returns.filter((value) => value >= 20).length },
  ] as const;
  const tails: readonly TailMetric[] = WORKBENCH_TAIL_THRESHOLDS.map((threshold) => {
    const count = returns.filter((value) => value >= threshold).length;
    return { threshold, count, frequency: count / totalSpins };
  });
  const metrics: WorkbenchAnalysisMetrics = {
    totalSpins,
    totalBet,
    totalCreditedWin,
    rtp: totalCreditedWin / totalBet,
    winningSpinFrequency: winningReturns.length / totalSpins,
    averageWinPerWinningSpin: nullableDivide(sum(winningReturns), winningReturns.length),
    baseGameTumbleTriggerFrequency:
      baseTumbleTriggers === null ? null : baseTumbleTriggers / totalSpins,
    freeGameTumbleTriggerFrequency:
      freeTumbleTriggers === null || freeGamesPlayedTotal === null
        ? null
        : divide(freeTumbleTriggers, freeGamesPlayedTotal),
    averageBaseGameTumbleRoundsPerTrigger:
      baseTumbleRounds === null || baseTumbleTriggers === null
        ? null
        : nullableDivide(baseTumbleRounds, baseTumbleTriggers),
    averageFreeGameTumbleRoundsPerTrigger:
      freeTumbleRounds === null || freeTumbleTriggers === null
        ? null
        : nullableDivide(freeTumbleRounds, freeTumbleTriggers),
    tumbleRoundsPerPaidSpin: totalTumbleRounds === null ? null : totalTumbleRounds / totalSpins,
    tumbleTriggerFrequency: totalTumbleTriggers === null ? null : totalTumbleTriggers / totalSpins,
    averageTumbleRoundsPerTriggeringSpin:
      totalTumbleRounds === null || totalTumbleTriggers === null
        ? null
        : nullableDivide(totalTumbleRounds, totalTumbleTriggers),
    maximumObservedBaseGameTumbleDepth: headerSet.has('maximum_base_tumble_depth')
      ? maximum('maximum_base_tumble_depth')
      : headerSet.has('base_tumble_rounds')
        ? maximum('base_tumble_rounds')
        : null,
    maximumObservedFreeGameTumbleDepth: headerSet.has('maximum_free_game_tumble_depth')
      ? maximum('maximum_free_game_tumble_depth')
      : null,
    maximumObservedTumbleDepth: headerSet.has('maximum_tumble_depth')
      ? maximum('maximum_tumble_depth')
      : null,
    bathalaActivations,
    bathalaActivationFrequency:
      bathalaActivations === null || totalTumbleRounds === null
        ? null
        : divide(bathalaActivations, totalTumbleRounds),
    averageSymbolsRemoved:
      bathalaRemoved === null || bathalaActivations === null
        ? null
        : nullableDivide(bathalaRemoved, bathalaActivations),
    bathalaToNextWinConversionRate:
      bathalaConversions === null || bathalaActivations === null
        ? null
        : nullableDivide(bathalaConversions, bathalaActivations),
    multiplierAppearanceFrequency: multiplierSpins === null ? null : multiplierSpins / totalSpins,
    averageMultiplierValue: headerSet.has('multiplier_values')
      ? nullableDivide(sum(multiplierValues), multiplierValues.length)
      : null,
    averageSummedMultiplierOnMultipliedWins:
      summedEffectiveMultipliers === null || multipliedRounds === null
        ? null
        : nullableDivide(summedEffectiveMultipliers, multipliedRounds),
    maximumSummedMultiplier: maxSummedMultiplier,
    freeGameTriggerCount: featureCount,
    featureFrequency: featureCount === null ? null : featureCount / totalSpins,
    averageFreeGamesPlayed:
      freeGamesPlayed === null || featureCount === null
        ? null
        : nullableDivide(freeGamesPlayed, featureCount),
    averageInitiallyAwardedFreeGames:
      freeGamesAwarded === null || featureCount === null
        ? null
        : nullableDivide(freeGamesAwarded, featureCount),
    maximumObservedFeatureLength:
      !featureFlags || !headerSet.has('free_games_played')
        ? null
        : featureLengths.length
          ? Math.max(...featureLengths)
          : 0,
    featureLengthPercentiles: {
      p50: percentile(featureLengths, 0.5),
      p75: percentile(featureLengths, 0.75),
      p90: percentile(featureLengths, 0.9),
      p95: percentile(featureLengths, 0.95),
      p99: percentile(featureLengths, 0.99),
    },
    retriggerCount,
    averageRetriggersPerFeature:
      retriggerCount === null || featureCount === null
        ? null
        : nullableDivide(retriggerCount, featureCount),
    averageEndingFreeGameMultiplier:
      endingMultipliers === null || featureCount === null
        ? null
        : nullableDivide(endingMultipliers, featureCount),
    freeGameWinContribution: featureWin === null ? null : featureWin / totalBet,
    baseGameWinContribution: baseWin === null ? null : baseWin / totalBet,
    maximumObservedWin: Math.max(...returns),
    meanWinPerPaidSpin,
    variance,
    standardDeviation,
    coefficientOfVariation:
      meanWinPerPaidSpin === 0
        ? standardDeviation === 0
          ? 0
          : null
        : standardDeviation / meanWinPerPaidSpin,
    standardError,
    confidenceInterval95: [
      Math.max(0, meanWinPerPaidSpin - 1.96 * standardError),
      meanWinPerPaidSpin + 1.96 * standardError,
    ],
    components: detailedComponents,
    tails,
    payoutHistogram,
    payoutPercentiles: {
      p50: percentile(sortedReturns, 0.5)!,
      p75: percentile(sortedReturns, 0.75)!,
      p90: percentile(sortedReturns, 0.9)!,
      p95: percentile(sortedReturns, 0.95)!,
      p99: percentile(sortedReturns, 0.99)!,
    },
  };
  const first = rows[0]!;
  const seed = optionalNumber(first, 'session_seed');
  const generatedAt = [...rows]
    .reverse()
    .map((row) => row.timestamp)
    .find((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value))));
  const warnings = [
    ...(totalSpins < SMALL_SESSION_SPIN_THRESHOLD ? ['limitedSampleWarning'] : []),
    ...(!capabilities.rtpCompositionDetailed ? ['partialCompositionWarning'] : []),
    ...(rows.some((row) =>
      Object.entries(row).some(
        ([name, raw]) =>
          name !== 'bet' &&
          name !== 'total_win' &&
          raw.trim() !== '' &&
          (name.endsWith('_win') ||
            name.endsWith('_rounds') ||
            name.endsWith('_depth') ||
            name.endsWith('_count') ||
            name.endsWith('_activations') ||
            name.endsWith('_removed') ||
            name.endsWith('_multiplier') ||
            name.endsWith('_uplift') ||
            name === 'free_games_awarded' ||
            name === 'free_games_played') &&
          optionalNumber(row, name) === null,
      ),
    )
      ? ['malformedOptionalWarning']
      : []),
  ];
  const report: WorkbenchSessionReport = {
    sourceType: 'workbench-session',
    metadata: {
      schemaVersion: 'workbench-csv-1',
      gameId: 'lucky888',
      gameName: 'Lucky888',
      gameVersion: first.configuration_version || 'unknown',
      configurationId: first.configuration_id || 'unknown',
      generatedAt: generatedAt || '',
      ...(first.profile_name ? { profileName: first.profile_name } : {}),
    },
    simulation: {
      methodology: 'workbench-interactive-session',
      seed: seed === null ? null : seed,
      spins: totalSpins,
    },
    metrics,
    metricAvailability: availabilityMap(metrics),
    capabilities,
    analysisWarnings: warnings,
  };
  return { ok: true, report };
}

export function importAnalysisArtifact(name: string, text: string): NormalizationResult {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return parseSpinHistoryCsv(text);
  if (lower.endsWith('.json')) return parseImportedSimulationReport(text);
  return csvError('Unsupported analysis file type. Choose a .json or .csv file.');
}

export function normalizeStoredWorkbenchAnalysis(value: unknown): NormalizationResult {
  if (
    !isRecord(value) ||
    value.sourceType !== 'workbench-session' ||
    !isRecord(value.metadata) ||
    !isRecord(value.simulation) ||
    !isRecord(value.metrics) ||
    !isRecord(value.metricAvailability) ||
    !isRecord(value.capabilities) ||
    !Array.isArray(value.analysisWarnings) ||
    typeof value.simulation.spins !== 'number' ||
    value.simulation.spins <= 0 ||
    typeof value.metrics.totalBet !== 'number' ||
    value.metrics.totalBet <= 0 ||
    typeof value.metrics.rtp !== 'number' ||
    !Number.isFinite(value.metrics.rtp)
  )
    return csvError('Stored Workbench analysis is invalid.');
  return { ok: true, report: value as unknown as WorkbenchSessionReport };
}
