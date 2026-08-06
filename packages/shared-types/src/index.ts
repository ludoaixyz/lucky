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

export interface BonusAward {
  readonly count: number;
  readonly freeSpins: number;
}

export interface BonusConfig {
  readonly schemaVersion: ConfigVersion;
  readonly enabled: boolean;
  readonly triggerSymbolId: SymbolId;
  readonly triggerEvaluation: 'anywhere';
  readonly minimumCount: number;
  readonly awards: readonly BonusAward[];
  readonly freeSpinMultiplier: number;
  readonly retriggerEnabled: boolean;
  readonly retriggerAwards: readonly BonusAward[];
  readonly maximumFeatureSpins: number;
  readonly maximumRetriggers: number;
  readonly scatterPaysCredits: boolean;
  readonly useAlternateReelStrips: boolean;
  readonly useAlternatePaytable: boolean;
  readonly notes?: string;
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
  readonly bonus: BonusConfig;
}

export interface LineWin {
  readonly paylineId: string;
  readonly symbolId: SymbolId;
  readonly count: number;
  readonly awardCredits: AwardCredits;
}

export interface ReelOutcome {
  readonly stops: readonly ReelStop[];
  readonly window: readonly (readonly SymbolId[])[];
  readonly lineWins: readonly LineWin[];
  readonly scatterCount: number;
}

export interface FreeSpinResult extends ReelOutcome {
  readonly spinIndex: number;
  readonly retriggeredFreeSpins: number;
  readonly rawWinCredits: Credits;
  readonly multiplier: number;
  readonly winCredits: Credits;
}

export interface FeatureResult {
  readonly triggered: boolean;
  readonly initialAwardedSpins: number;
  readonly totalPlayedSpins: number;
  readonly totalRetriggeredSpins: number;
  readonly retriggerCount: number;
  readonly totalWinCredits: Credits;
  readonly freeSpins: readonly FreeSpinResult[];
  readonly limitReached: boolean;
}

export interface SpinResult extends ReelOutcome {
  readonly baseLineWinCredits: Credits;
  readonly baseScatterWinCredits: Credits;
  readonly baseWinCredits: Credits;
  readonly featureWinCredits: Credits;
  readonly uncappedTotalWinCredits: Credits;
  readonly totalWinCredits: Credits;
  readonly featureTriggered: boolean;
  readonly feature: FeatureResult | null;
  readonly maximumWinApplied: boolean;
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
  readonly paidSpins: number;
  readonly totalWageredCredits: Credits;
  readonly basePayoutCredits: Credits;
  readonly baseScatterPayoutCredits: Credits;
  readonly featurePayoutCredits: Credits;
  readonly totalPayoutCredits: Credits;
  readonly baseRtp: number;
  readonly baseScatterRtp: number;
  readonly featureRtp: number;
  readonly totalRtp: number;
  readonly baseHitFrequency: number;
  readonly featureTriggerFrequency: number;
  readonly featureInclusiveHitFrequency: number;
  readonly averageInitiallyAwardedFreeSpins: number;
  readonly averageTotalFreeSpinsPerTrigger: number;
  readonly averageRetriggersPerTrigger: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly standardError: number;
  readonly confidenceInterval95: readonly [number, number];
  readonly maximumObservedWinCredits: Credits;
  readonly capApplications: number;
  readonly payoutDistribution: readonly DistributionBucket[];
}

export interface ExactMathReport {
  readonly schemaVersion: ConfigVersion;
  readonly methodology: 'exact-uncapped';
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly generatedAt: string;
  readonly sourceHash: string;
  readonly totalPaidSpinCombinations: number;
  readonly probabilityReconciliation: number;
  readonly baseLineRtp: number;
  readonly baseScatterRtp: number;
  readonly featureRtp: number;
  readonly totalRtp: number;
  readonly uncappedTotalRtp: number;
  readonly triggerFrequency: number;
  readonly triggerFrequencyByScatterCount: Readonly<Record<string, number>>;
  readonly expectedInitiallyAwardedFreeSpins: number;
  readonly expectedTotalFreeSpinsPerPaidSpin: number;
  readonly expectedTotalFreeSpinsPerTrigger: number;
  readonly expectedRetriggerCountPerTrigger: number;
  readonly baseHitFrequency: number;
  readonly featureInclusiveHitFrequency: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly payoutDistribution: readonly DistributionBucket[];
  readonly maximumReachableBaseWinCredits: Credits;
  readonly maximumReachableUncappedWinCredits: Credits;
  readonly maximumReachableCreditedWinCredits: Credits;
  readonly maximumWinCapCredits: Credits;
  readonly maximumWinCapReducesRtp: boolean;
}
