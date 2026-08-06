import type {
  BetCredits,
  Credits,
  FeatureResult,
  LineWin,
  ReelStop,
  SymbolId,
} from '@lucky/shared-types';

export interface DisplayedSpinOutcome {
  readonly visibleWindow: readonly (readonly SymbolId[])[];
  readonly reelStops: readonly ReelStop[];
  readonly lineWins: readonly LineWin[];
}

export interface CompletedSpin {
  readonly timestamp: string;
  readonly betCredits: BetCredits;
  readonly uncappedBaseWinCredits: Credits;
  readonly uncappedFeatureWinCredits: Credits;
  readonly uncappedTotalWinCredits: Credits;
  readonly creditedTotalWinCredits: Credits;
  readonly capReductionCredits: Credits;
  readonly creditsBefore: Credits;
  readonly creditsAfter: Credits;
  readonly featureTriggered: boolean;
  readonly scatterCount: number;
  readonly initialFreeSpins: number;
  readonly totalFreeSpinsPlayed: number;
  readonly totalRetriggeredSpins: number;
  readonly retriggerCount: number;
  readonly maximumWinApplied: boolean;
  readonly feature: FeatureResult | null;
  readonly outcome: DisplayedSpinOutcome;
}

export interface SpinHistoryEntry extends CompletedSpin {
  readonly spinNumber: number;
  readonly netCredits: Credits;
  readonly sessionTotalSpins: number;
  readonly sessionTotalWagered: Credits;
  readonly sessionTotalWon: Credits;
}

export interface SessionDiagnostics {
  readonly totalSpins: number;
  readonly totalWagered: Credits;
  readonly totalWon: Credits;
  readonly totalUncappedWon: Credits;
  readonly totalCapReduction: Credits;
  readonly uncappedReturn: number;
  readonly creditedRtp: number;
  readonly featureTriggerRate: number;
  readonly averageFeatureLength: number;
  readonly history: readonly SpinHistoryEntry[];
  readonly recentSpins: readonly SpinHistoryEntry[];
}

export interface SpinDiagnosticsRecorder {
  recordCompletedSpin(spin: CompletedSpin): void;
}
