import type { SpinRecord } from '@lucky/shared-types';

export const SPIN_HISTORY_HEADERS = [
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
] as const;

function cell(value: string | number | boolean | undefined): string {
  const text = value === undefined ? '' : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeSpinHistoryCsv(records: readonly SpinRecord[]): string {
  const rows = records.map((record) => [
    record.sessionId,
    record.sessionSeed,
    record.spinNumber,
    record.spinIndex,
    record.timestamp,
    record.configurationId,
    record.configurationVersion,
    record.profileName,
    record.bet,
    record.baseWin,
    record.featureWin,
    record.totalWin,
    record.winMultiple,
    record.winning,
    record.baseTumbleRounds,
    record.freeGameTumbleRounds,
    record.maximumTumbleDepth,
    record.bathalaActivations,
    record.bathalaSymbolsRemoved,
    record.multiplierAppeared,
    record.multiplierValues.join('|'),
    record.summedMultiplier,
    record.scatterCount,
    record.featureTriggered,
    record.freeGamesAwarded,
    record.freeGamesPlayed,
    record.retriggerCount,
    record.endingFreeGameMultiplier,
    record.maximumWinApplied,
  ]);
  return `${SPIN_HISTORY_HEADERS.join(',')}\r\n${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

const safe = (value: string): string => value.replace(/[^a-z0-9._-]+/giu, '-');
export function spinHistoryFilename(configurationId: string, sessionId: string): string {
  return `lucky888-spin-history_${safe(configurationId)}_${safe(sessionId)}.csv`;
}
