import type { SpinRecord } from '@lucky/shared-types';

export interface SessionStats {
  readonly spinCount: number;
  readonly totalWagered: number;
  readonly totalWon: number;
  readonly sessionRtp: number;
  readonly winningSpinFrequency: number;
  readonly featureCount: number;
  readonly featureFrequency: number;
  readonly featureEntrySpins: number | null;
  readonly maximumWinMultiple: number;
  readonly averageWinMultiple: number;
  readonly multiplierAppearance: number;
  readonly averageMultiplier: number;
  readonly averageTumbleDepth: number;
}

export function deriveSessionStats(records: readonly SpinRecord[]): SessionStats {
  const spinCount = records.length;
  const totalWagered = records.reduce((sum, record) => sum + record.bet, 0);
  const totalWon = records.reduce((sum, record) => sum + record.totalWin, 0);
  const winners = records.filter((record) => record.winning);
  const features = records.filter((record) => record.featureTriggered);
  const multiplierRecords = records.filter((record) => record.multiplierAppeared);
  const multiplierValues = records.flatMap((record) => record.multiplierValues);
  const ratio = (numerator: number, denominator: number): number =>
    denominator ? numerator / denominator : 0;
  return {
    spinCount,
    totalWagered,
    totalWon,
    sessionRtp: ratio(totalWon, totalWagered),
    winningSpinFrequency: ratio(winners.length, spinCount),
    featureCount: features.length,
    featureFrequency: ratio(features.length, spinCount),
    featureEntrySpins: features.length ? spinCount / features.length : null,
    maximumWinMultiple: Math.max(0, ...records.map((record) => record.winMultiple)),
    averageWinMultiple: ratio(
      winners.reduce((sum, record) => sum + record.winMultiple, 0),
      winners.length,
    ),
    multiplierAppearance: ratio(multiplierRecords.length, spinCount),
    averageMultiplier: ratio(
      multiplierValues.reduce((sum, value) => sum + value, 0),
      multiplierValues.length,
    ),
    averageTumbleDepth: ratio(
      records.reduce((sum, record) => sum + record.maximumTumbleDepth, 0),
      spinCount,
    ),
  };
}

export class HistoryStore {
  private records: SpinRecord[] = [];
  constructor(private readonly maximumRecords = 100_000) {}

  appendSpin(record: SpinRecord): void {
    if (this.records.length >= this.maximumRecords)
      throw new RangeError(
        `Session history safety limit of ${this.maximumRecords} records reached`,
      );
    this.records.push(record);
  }

  getRecentSpins(count = 10): readonly SpinRecord[] {
    return this.records.slice(-count).reverse();
  }

  getAllSessionSpins(): readonly SpinRecord[] {
    return [...this.records];
  }

  clearSession(): void {
    this.records = [];
  }

  stats(): SessionStats {
    return deriveSessionStats(this.records);
  }
}
