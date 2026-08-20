import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
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

export const MATH_PROFILES_DIRECTORY = resolve(process.cwd(), 'math/profiles');
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

function nonNegative(name: string, row: number, field: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name}:${row}:${field}: expected a non-negative number`);
  return value;
}

export function profileOption(args: readonly string[] = process.argv.slice(2)): string | undefined {
  const inline = args.find((argument) => argument.startsWith('--profile='));
  const position = args.indexOf('--profile');
  return inline?.slice('--profile='.length) ?? (position >= 0 ? args[position + 1] : undefined);
}

export function requireProfileId(args: readonly string[] = process.argv.slice(2)): string {
  const profileId = profileOption(args);
  if (!profileId || profileId.startsWith('--')) {
    throw new Error(
      'Missing required --profile argument.\n\nExample:\nnpm run math:simulate -- --profile bathala-tumble-balanced-v1 --spins 1000000 --seed 2026',
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/iu.test(profileId) || profileId === '.') {
    throw new Error(
      `Invalid math profile "${profileId}". --profile must be a folder name inside math/profiles (paths are not allowed).`,
    );
  }
  return profileId;
}

export function simulationReportName(profileId: string, seed: number, spins: number): string {
  requireProfileId(['--profile', profileId]);
  return `${profileId}-simulation-${seed}-${spins}.json`;
}

async function availableProfiles(): Promise<readonly string[]> {
  try {
    return (await readdir(MATH_PROFILES_DIRECTORY, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function resolveProfileDirectory(profileId: string): Promise<string> {
  requireProfileId(['--profile', profileId]);
  const candidate = resolve(MATH_PROFILES_DIRECTORY, profileId);
  let details;
  try {
    details = await stat(candidate);
  } catch {
    const available = await availableProfiles();
    throw new Error(
      `Math profile "${profileId}" was not found.\n\nExpected:\nmath/profiles/${profileId}/` +
        (available.length > 0
          ? `\n\nAvailable profiles:\n${available.map((id) => `- ${id}`).join('\n')}`
          : ''),
    );
  }
  if (!details.isDirectory()) throw new Error(`Math profile "${profileId}" is not a directory.`);
  const [profilesRoot, actual] = await Promise.all([
    realpath(MATH_PROFILES_DIRECTORY),
    realpath(candidate),
  ]);
  const escaped = relative(profilesRoot, actual);
  if (escaped === '..' || escaped.startsWith(`..\\`) || escaped.startsWith('../'))
    throw new Error(`Invalid math profile "${profileId}": resolved outside math/profiles.`);
  return actual;
}

export async function loadSourceConfig(profileId: string): Promise<{
  config: ActiveGameConfig;
  sourceHash: string;
  structuralHash: string;
  payoutHash: string;
  sourceDirectory: string;
}> {
  const source = await resolveProfileDirectory(profileId);
  const entriesInDirectory = await readdir(source, { withFileTypes: true });
  const actual = entriesInDirectory.map((entry) => entry.name).sort();
  const expected = [...MATH_SOURCE_FILES].sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter(
    (name) => !expected.includes(name as (typeof MATH_SOURCE_FILES)[number]),
  );
  if (missing.length > 0 || extra.length > 0) {
    const details = [
      ...(missing.length > 0 ? [`Missing:\n${missing.map((name) => `- ${name}`).join('\n')}`] : []),
      ...(extra.length > 0 ? [`Unexpected:\n${extra.map((name) => `- ${name}`).join('\n')}`] : []),
    ].join('\n\n');
    throw new Error(`Profile "${profileId}" is invalid.\n\n${details}`);
  }
  const entries = await Promise.all(
    MATH_SOURCE_FILES.map(
      async (name) => [name, await readFile(resolve(source, name), 'utf8')] as const,
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
  if (game.configurationId !== profileId) {
    throw new Error(
      `Profile directory/configuration mismatch.\n\nSelected profile:\n${profileId}\n\ngame-config.json configurationId:\n${game.configurationId}`,
    );
  }
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
    weight: nonNegative('multiplier-values.csv', index + 2, 'weight', row.weight ?? ''),
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
  return { config, sourceHash, structuralHash, payoutHash, sourceDirectory: source };
}
