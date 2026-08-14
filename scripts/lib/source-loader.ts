import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ActiveGameConfig,
  BathalaConfig,
  BathalaSymbolId,
  CountPayAward,
  RegularSymbolId,
  ScatterConfig,
  WeightedMultiplier,
  WeightedSymbol,
} from '@lucky/shared-types';

const SOURCE = resolve(process.cwd(), 'math/source');
export const MATH_SOURCE_FILES = [
  'game-config.json',
  'base-symbol-weights.csv',
  'freegame-symbol-weights.csv',
  'cluster-paytable.csv',
  'multiplier-values.csv',
  'bathala-config.json',
  'scatter-config.json',
] as const;

function parseCsv(name: string, text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/u);
  const headers = lines
    .shift()
    ?.split(',')
    .map((value) => value.trim());
  if (!headers) throw new Error(`${name}: missing header`);
  return lines.map((line, index) => {
    const values = line.split(',').map((value) => value.trim());
    if (values.length !== headers.length)
      throw new Error(`${name}:${index + 2}: wrong column count`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']));
  });
}

function positive(name: string, row: number, field: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name}:${row}:${field}: expected a positive number`);
  return value;
}

export async function loadSourceConfig(): Promise<{
  config: ActiveGameConfig;
  sourceHash: string;
  structuralHash: string;
  payoutHash: string;
}> {
  const actual = (await readdir(SOURCE, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(csv|json)$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const expected = [...MATH_SOURCE_FILES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`math/source must contain exactly: ${expected.join(', ')}`);
  const entries = await Promise.all(
    MATH_SOURCE_FILES.map(
      async (name) => [name, await readFile(resolve(SOURCE, name), 'utf8')] as const,
    ),
  );
  const files = Object.fromEntries(entries) as Record<(typeof MATH_SOURCE_FILES)[number], string>;
  const game = JSON.parse(files['game-config.json']) as Omit<
    ActiveGameConfig,
    | 'baseSymbolWeights'
    | 'freegameSymbolWeights'
    | 'multiplierValues'
    | 'paytable'
    | 'bathala'
    | 'scatter'
  >;
  const weights = (
    name: 'base-symbol-weights.csv' | 'freegame-symbol-weights.csv',
  ): WeightedSymbol[] =>
    parseCsv(name, files[name]).map((row, index) => ({
      symbol: row.symbol as BathalaSymbolId,
      weight: positive(name, index + 2, 'weight', row.weight ?? ''),
    }));
  const paytable: CountPayAward[] = parseCsv(
    'cluster-paytable.csv',
    files['cluster-paytable.csv'],
  ).map((row, index) => ({
    symbol: row.symbol as RegularSymbolId,
    minCount: positive('cluster-paytable.csv', index + 2, 'minCount', row.minCount ?? ''),
    maxCount: positive('cluster-paytable.csv', index + 2, 'maxCount', row.maxCount ?? ''),
    payout: positive('cluster-paytable.csv', index + 2, 'payout', row.payout ?? ''),
  }));
  const multiplierValues: WeightedMultiplier[] = parseCsv(
    'multiplier-values.csv',
    files['multiplier-values.csv'],
  ).map((row, index) => ({
    value: positive('multiplier-values.csv', index + 2, 'value', row.value ?? ''),
    weight: positive('multiplier-values.csv', index + 2, 'weight', row.weight ?? ''),
  }));
  const config: ActiveGameConfig = {
    ...game,
    baseSymbolWeights: weights('base-symbol-weights.csv'),
    freegameSymbolWeights: weights('freegame-symbol-weights.csv'),
    multiplierValues,
    paytable,
    bathala: JSON.parse(files['bathala-config.json']) as BathalaConfig,
    scatter: JSON.parse(files['scatter-config.json']) as ScatterConfig,
  };
  const sourceHash = createHash('sha256')
    .update(MATH_SOURCE_FILES.map((name) => files[name]).join('\n'))
    .digest('hex');
  const structuralHash = createHash('sha256')
    .update(
      [
        files['game-config.json'],
        files['base-symbol-weights.csv'],
        files['freegame-symbol-weights.csv'],
        files['bathala-config.json'],
        files['scatter-config.json'],
      ].join('\n'),
    )
    .digest('hex');
  const payoutHash = createHash('sha256')
    .update([files['cluster-paytable.csv'], files['multiplier-values.csv']].join('\n'))
    .digest('hex');
  return { config, sourceHash, structuralHash, payoutHash };
}
