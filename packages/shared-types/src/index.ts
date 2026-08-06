export type Credits = number;
export type BetCredits = number;
export type AwardCredits = number;
export type SymbolId = string;
export type ConfigVersion = string;
export type ReelStop = number;

export interface SymbolDefinition {
  readonly id: SymbolId;
  readonly name: string;
  readonly category: 'regular' | 'wild' | 'scatter' | 'bonus';
  readonly display: string;
}

export interface PayAward {
  readonly symbolId: SymbolId;
  readonly count: number;
  readonly awardCredits: AwardCredits;
}

export interface Payline {
  readonly id: string;
  readonly rows: readonly number[];
}

export interface BonusRule {
  readonly triggerSymbolId: SymbolId;
  readonly minimumCount: number;
  readonly freeSpins: number;
  readonly multiplier: number;
}

export interface RuntimeGameConfig {
  readonly schemaVersion: ConfigVersion;
  readonly gameId: string;
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly lineBetCredits: BetCredits;
  readonly totalBetCredits: BetCredits;
  readonly maximumWinCredits: Credits;
  readonly symbols: readonly SymbolDefinition[];
  readonly reelStrips: readonly (readonly SymbolId[])[];
  readonly paylines: readonly Payline[];
  readonly paytable: readonly PayAward[];
  readonly bonus: BonusRule;
}

export interface LineWin {
  readonly paylineId: string;
  readonly symbolId: SymbolId;
  readonly count: number;
  readonly awardCredits: AwardCredits;
}

export interface SpinResult {
  readonly stops: readonly ReelStop[];
  readonly window: readonly (readonly SymbolId[])[];
  readonly lineWins: readonly LineWin[];
  readonly scatterCount: number;
  readonly featureTriggered: boolean;
  readonly rawWinCredits: Credits;
  readonly winCredits: Credits;
  readonly capped: boolean;
}

export interface SimulationConfig {
  readonly spins: number;
  readonly seed: number;
  readonly betCredits: BetCredits;
}

export interface DistributionBucket {
  readonly label: string;
  readonly minimumMultiple: number;
  readonly maximumMultiple: number | null;
  readonly count: number;
  readonly probability: number;
}

export interface SimulationReport {
  readonly schemaVersion: ConfigVersion;
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly generatedAt: string;
  readonly seed: number;
  readonly spinCount: number;
  readonly totalWagerCredits: Credits;
  readonly totalPayoutCredits: Credits;
  readonly winningSpinCount: number;
  readonly featureTriggerCount: number;
  readonly rtp: number;
  readonly hitFrequency: number;
  readonly bonusFrequency: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly rtpConfidence95: readonly [number, number];
  readonly payoutDistribution: readonly DistributionBucket[];
}
