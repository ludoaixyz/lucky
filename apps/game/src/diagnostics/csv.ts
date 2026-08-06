import type { SpinHistoryEntry } from './types.js';
import { formatLineWins, formatVisibleWindow } from './format.js';

const HEADERS = [
  'spinNumber',
  'timestamp',
  'betCredits',
  'winCredits',
  'netCredits',
  'creditsBefore',
  'creditsAfter',
  'featureTriggered',
  'visibleWindow',
  'reelStops',
  'lineWins',
  'sessionTotalSpins',
  'sessionTotalWagered',
  'sessionTotalWon',
] as const;

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildSpinHistoryCsv(entries: readonly SpinHistoryEntry[]): string {
  const rows = entries.map((entry) => [
    entry.spinNumber,
    entry.timestamp,
    entry.betCredits,
    entry.winCredits,
    entry.netCredits,
    entry.creditsBefore,
    entry.creditsAfter,
    entry.featureTriggered,
    formatVisibleWindow(entry.outcome.visibleWindow),
    entry.outcome.reelStops.join('|'),
    formatLineWins(entry.outcome.lineWins),
    entry.sessionTotalSpins,
    entry.sessionTotalWagered,
    entry.sessionTotalWon,
  ]);
  return `${HEADERS.map(csvCell).join(',')}\r\n${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function spinHistoryFilename(now: Date): string {
  const compact = now
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/u, '');
  return `lucky888-spin-history-${compact.replace('T', '-')}.csv`;
}
