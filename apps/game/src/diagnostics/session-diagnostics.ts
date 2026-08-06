import type { CompletedSpin, SessionDiagnostics, SpinHistoryEntry } from './types.js';

export class SessionDiagnosticsStore {
  private readonly entries: SpinHistoryEntry[] = [];
  private totalWagered = 0;
  private totalWon = 0;
  private totalUncappedWon = 0;
  private totalCapReduction = 0;
  private featureTriggers = 0;
  private featureSpins = 0;

  record(spin: CompletedSpin): SpinHistoryEntry {
    this.totalWagered += spin.betCredits;
    this.totalWon += spin.creditedTotalWinCredits;
    this.totalUncappedWon += spin.uncappedTotalWinCredits;
    this.totalCapReduction += spin.capReductionCredits;
    if (spin.featureTriggered) {
      this.featureTriggers += 1;
      this.featureSpins += spin.totalFreeSpinsPlayed;
    }
    const entry: SpinHistoryEntry = {
      ...spin,
      spinNumber: this.entries.length + 1,
      netCredits: spin.creditedTotalWinCredits - spin.betCredits,
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
      totalUncappedWon: this.totalUncappedWon,
      totalCapReduction: this.totalCapReduction,
      uncappedReturn: this.totalWagered === 0 ? 0 : this.totalUncappedWon / this.totalWagered,
      creditedRtp: this.totalWagered === 0 ? 0 : this.totalWon / this.totalWagered,
      featureTriggerRate: totalSpins === 0 ? 0 : this.featureTriggers / totalSpins,
      averageFeatureLength:
        this.featureTriggers === 0 ? 0 : this.featureSpins / this.featureTriggers,
      history: [...this.entries],
      recentSpins: this.entries.slice(-10).reverse(),
    };
  }
}
