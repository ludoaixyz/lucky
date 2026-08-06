import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  BonusRule,
  PayAward,
  Payline,
  RuntimeGameConfig,
  SymbolDefinition,
  SymbolId,
} from '@lucky/shared-types';

interface GameSource {
  schemaVersion: string;
  gameId: string;
  gameVersion: string;
  configurationId: string;
  reelCount: number;
  visibleRows: number;
  lineBetCredits: number;
  totalBetCredits: number;
  maximumWinCredits: number;
}

const SOURCE = resolve(process.cwd(), 'math/source');

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.split(',').map((value) => value.trim()));
}

async function csv(name: string): Promise<Record<string, string>[]> {
  const rows = parseCsv(await readFile(resolve(SOURCE, name), 'utf8'));
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
}> {
  const sourceNames = [
    'game-config.json',
    'bonus-config.json',
    'symbols.csv',
    'paytable.csv',
    'reel-strips.csv',
    'paylines.csv',
  ];
  const contents = await Promise.all(
    sourceNames.map((name) => readFile(resolve(SOURCE, name), 'utf8')),
  );
  const game = JSON.parse(contents[0] as string) as GameSource;
  const bonus = JSON.parse(contents[1] as string) as BonusRule;
  const symbolRows = await csv('symbols.csv');
  const payRows = await csv('paytable.csv');
  const reelRows = await csv('reel-strips.csv');
  const lineRows = await csv('paylines.csv');
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
  const paylines: Payline[] = lineRows.map((row, index) => ({
    id: row.payline_id ?? `L${index + 1}`,
    rows: reelIds.map((_, reel) =>
      integer('paylines.csv', index + 2, `reel_${reel + 1}_row`, row[`reel_${reel + 1}_row`] ?? ''),
    ),
  }));
  return {
    config: { ...game, symbols, paytable, reelStrips, paylines, bonus },
    sourceHash: createHash('sha256').update(contents.join('\n')).digest('hex'),
  };
}
