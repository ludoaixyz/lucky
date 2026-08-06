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
  readonly baseWinCredits: Credits;
  readonly featureWinCredits: Credits;
  readonly totalWinCredits: Credits;
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
  readonly rtp: number;
  readonly history: readonly SpinHistoryEntry[];
  readonly recentSpins: readonly SpinHistoryEntry[];
}

export interface SpinDiagnosticsRecorder {
  recordCompletedSpin(spin: CompletedSpin): void;
}
