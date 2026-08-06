import type { SpinHistoryEntry } from './types.js';
import { formatLineWins, formatVisibleWindow } from './format.js';

const HEADERS = [
  'spinNumber',
  'timestamp',
  'betCredits',
  'creditsBefore',
  'creditsAfter',
  'uncappedBaseWinCredits',
  'uncappedFeatureWinCredits',
  'uncappedTotalWinCredits',
  'creditedTotalWinCredits',
  'capReductionCredits',
  'netCredits',
  'scatterCount',
  'featureTriggered',
  'initialFreeSpins',
  'totalFreeSpinsPlayed',
  'totalRetriggeredSpins',
  'retriggerCount',
  'maximumWinApplied',
  'baseReelStops',
  'baseVisibleWindow',
  'featureSpinSummary',
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
    entry.creditsBefore,
    entry.creditsAfter,
    entry.uncappedBaseWinCredits,
    entry.uncappedFeatureWinCredits,
    entry.uncappedTotalWinCredits,
    entry.creditedTotalWinCredits,
    entry.capReductionCredits,
    entry.netCredits,
    entry.scatterCount,
    entry.featureTriggered,
    entry.initialFreeSpins,
    entry.totalFreeSpinsPlayed,
    entry.totalRetriggeredSpins,
    entry.retriggerCount,
    entry.maximumWinApplied,
    entry.outcome.reelStops.join('|'),
    formatVisibleWindow(entry.outcome.visibleWindow),
    entry.feature
      ? JSON.stringify(
          entry.feature.freeSpins.map((spin) => ({
            spinIndex: spin.spinIndex,
            stops: spin.stops,
            scatterCount: spin.scatterCount,
            retriggeredFreeSpins: spin.retriggeredFreeSpins,
            winCredits: spin.winCredits,
          })),
        )
      : '',
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
