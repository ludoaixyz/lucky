import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  BonusConfig,
  PayAward,
  Payline,
  RuntimeGameConfig,
  RulesConfig,
  SymbolDefinition,
  SymbolId,
} from '@lucky/shared-types';

interface GameSource {
  schemaVersion: string;
  gameId: string;
  gameName: string;
  gameVersion: string;
  configurationId: string;
  selectedRtpProfile: string;
  payModel: 'fixed-paylines-left-to-right';
  reelCount: number;
  visibleRows: number;
  lineBetCredits: number;
  totalBetCredits: number;
  maximumWinCredits: number;
  maximumWinScope: 'paid-spin-including-feature';
  cascades?: RuntimeGameConfig['cascades'];
  rtpBudgets: RuntimeGameConfig['rtpBudgets'];
  volatilityTarget?: RuntimeGameConfig['volatilityTarget'];
  featureFrequencyTarget?: RuntimeGameConfig['featureFrequencyTarget'];
}

const SOURCE = resolve(process.cwd(), 'math/source');
export const MATH_SOURCE_FILES = [
  'symbols.csv',
  'paytable.csv',
  'paylines.csv',
  'reel-strips.csv',
  'free-spin-reel-strips.csv',
  'game-config.json',
  'rules-config.json',
  'bonus-config.json',
] as const;
const SOURCE_FINGERPRINT_ORDER: readonly (typeof MATH_SOURCE_FILES)[number][] = [
  'game-config.json',
  'bonus-config.json',
  'rules-config.json',
  'symbols.csv',
  'paytable.csv',
  'reel-strips.csv',
  'free-spin-reel-strips.csv',
  'paylines.csv',
];

async function assertCanonicalSourceDirectory(): Promise<void> {
  const entries = await readdir(SOURCE, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) => entry.isFile() && (entry.name.endsWith('.csv') || entry.name.endsWith('.json')),
    )
    .map((entry) => entry.name)
    .sort();
  const expected = [...MATH_SOURCE_FILES].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected))
    throw new Error(
      `math/source CSV/JSON authority must contain exactly the eight canonical files; expected ${expected.join(', ')}, received ${files.join(', ')}`,
    );
}

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.split(',').map((value) => value.trim()));
}

function csv(name: string, text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const headers = rows.shift();
  if (!headers) throw new Error(`${name}:1: missing header row`);
  return rows.map((values, rowIndex) =>
    Object.fromEntries(
      headers.map((header, index) => {
        const value = values[index];
        if (value === undefined)
          throw new Error(`${name}:${rowIndex + 2}:${header}: missing value`);
        return [header, value];
      }),
    ),
  );
}

function integer(file: string, row: number, field: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`${file}:${row}:${field}: '${value}' expected a safe integer`);
  return parsed;
}

export async function loadSourceConfig(): Promise<{
  config: RuntimeGameConfig;
  sourceHash: string;
  structuralHash: string;
  payoutHash: string;
}> {
  await assertCanonicalSourceDirectory();
  const sourceEntries = await Promise.all(
    MATH_SOURCE_FILES.map(
      async (name) => [name, await readFile(resolve(SOURCE, name), 'utf8')] as const,
    ),
  );
  const contents = Object.fromEntries(sourceEntries) as Record<
    (typeof MATH_SOURCE_FILES)[number],
    string
  >;
  const game = JSON.parse(contents['game-config.json']) as GameSource;
  const bonus = JSON.parse(contents['bonus-config.json']) as BonusConfig;
  const rules = JSON.parse(contents['rules-config.json']) as RulesConfig;
  const symbolRows = csv('symbols.csv', contents['symbols.csv']);
  const payRows = csv('paytable.csv', contents['paytable.csv']);
  const reelRows = csv('reel-strips.csv', contents['reel-strips.csv']);
  const freeSpinReelRows = csv('free-spin-reel-strips.csv', contents['free-spin-reel-strips.csv']);
  const lineRows = csv('paylines.csv', contents['paylines.csv']);
  const { cascades, volatilityTarget, featureFrequencyTarget, ...requiredGame } = game;
  const symbols: SymbolDefinition[] = symbolRows.map((row) => ({
    id: row.symbol_id as SymbolId,
    name: row.name ?? '',
    category: row.category as SymbolDefinition['category'],
    display: row.display ?? '',
  }));
  const paytable: PayAward[] = payRows.map((row, index) => ({
    symbolId: row.symbol_id as SymbolId,
    count: integer('paytable.csv', index + 2, 'count', row.count ?? ''),
    awardCredits: integer('paytable.csv', index + 2, 'award_credits', row.award_credits ?? ''),
  }));
  const reelIds = Array.from({ length: game.reelCount }, (_, index) => `R${index + 1}`);
  const reelStrips = reelIds.map((id) =>
    reelRows
      .filter((row) => row.reel_id === id)
      .sort((a, b) => Number(a.stop) - Number(b.stop))
      .map((row) => row.symbol_id as SymbolId),
  );
  const freeSpinReelStrips = reelIds.map((id) =>
    freeSpinReelRows
      .filter((row) => row.reel_id === id)
      .sort((a, b) => Number(a.stop) - Number(b.stop))
      .map((row) => row.symbol_id as SymbolId),
  );
  const paylines: Payline[] = lineRows.map((row, index) => ({
    id: row.payline_id ?? `L${index + 1}`,
    rows: reelIds.map((_, reel) =>
      integer('paylines.csv', index + 2, `reel_${reel + 1}_row`, row[`reel_${reel + 1}_row`] ?? ''),
    ),
  }));
  const structuralHash = createHash('sha256')
    .update(
      [
        contents['reel-strips.csv'],
        contents['free-spin-reel-strips.csv'],
        contents['paylines.csv'],
        JSON.stringify({
          reelCount: game.reelCount,
          visibleRows: game.visibleRows,
          cascades: game.cascades,
          wild: {
            symbolId: rules.wild.symbolId,
            enabled: rules.wild.enabled,
            substitutesFor: rules.wild.substitutesFor,
            substitutesForWild: rules.wild.substitutesForWild,
            substitutesForScatter: rules.wild.substitutesForScatter,
            hasOwnLinePay: rules.wild.hasOwnLinePay,
            allWildCombinationRule: rules.wild.allWildCombinationRule,
          },
          scatter: rules.scatter,
          lineEvaluation: {
            direction: rules.lineAwardRules.direction,
            matchRule: rules.lineAwardRules.matchRule,
            winSelection: rules.lineAwardRules.winSelection,
            multiplePaylinesAccumulate: rules.lineAwardRules.multiplePaylinesAccumulate,
            nestedAwardsAccumulate: rules.lineAwardRules.nestedAwardsAccumulate,
            scatterBreaksLineMatch: rules.lineAwardRules.scatterBreaksLineMatch,
          },
        }),
      ].join('\n'),
    )
    .digest('hex');
  const payoutHash = createHash('sha256')
    .update(
      [
        contents['bonus-config.json'],
        contents['paytable.csv'],
        JSON.stringify({
          wildMultiplier: rules.wild.multiplier,
          lineBetCredits: game.lineBetCredits,
          totalBetCredits: game.totalBetCredits,
          maximumWinCredits: game.maximumWinCredits,
        }),
      ].join('\n'),
    )
    .digest('hex');
  return {
    config: {
      ...requiredGame,
      ...(cascades === undefined ? {} : { cascades }),
      ...(volatilityTarget === undefined ? {} : { volatilityTarget }),
      ...(featureFrequencyTarget === undefined ? {} : { featureFrequencyTarget }),
      symbols,
      paytable,
      reelStrips,
      freeSpinReelStrips: bonus.useAlternateReelStrips ? freeSpinReelStrips : reelStrips,
      paylines,
      bonus,
      rules,
    },
    sourceHash: createHash('sha256')
      .update(SOURCE_FINGERPRINT_ORDER.map((name) => contents[name]).join('\n'))
      .digest('hex'),
    structuralHash,
    payoutHash,
  };
}
