import type { CompletedSpin, SessionDiagnostics, SpinHistoryEntry } from './types.js';

export class SessionDiagnosticsStore {
  private readonly entries: SpinHistoryEntry[] = [];
  private totalWagered = 0;
  private totalWon = 0;

  record(spin: CompletedSpin): SpinHistoryEntry {
    this.totalWagered += spin.betCredits;
    this.totalWon += spin.totalWinCredits;
    const entry: SpinHistoryEntry = {
      ...spin,
      spinNumber: this.entries.length + 1,
      netCredits: spin.totalWinCredits - spin.betCredits,
      sessionTotalSpins: this.entries.length + 1,
      sessionTotalWagered: this.totalWagered,
      sessionTotalWon: this.totalWon,
    };
    this.entries.push(entry);
    return entry;
  }

  snapshot(): SessionDiagnostics {
    const totalSpins = this.entries.length;
    return {
      totalSpins,
      totalWagered: this.totalWagered,
      totalWon: this.totalWon,
      rtp: this.totalWagered === 0 ? 0 : this.totalWon / this.totalWagered,
      history: [...this.entries],
      recentSpins: this.entries.slice(-10).reverse(),
    };
  }
}
