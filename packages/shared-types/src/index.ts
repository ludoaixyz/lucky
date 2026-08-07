export type Credits = number;
export type BetCredits = number;
export type AwardCredits = number;
export type SymbolId = string;
export type ConfigVersion = string;
export type ReelStop = number;

export function formatPercentRatio(value: number, decimals = 2): string {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError('Percentage ratio must be finite and non-negative');
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 20)
    throw new RangeError('Percentage decimals must be a safe integer from 0 to 20');
  return `${(value * 100).toFixed(decimals)}%`;
}

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

export interface WildRules {
  readonly symbolId: SymbolId;
  readonly enabled: boolean;
  readonly substitutesFor: readonly SymbolId[];
  readonly substitutesForWild: boolean;
  readonly substitutesForScatter: boolean;
  readonly hasOwnLinePay: boolean;
  readonly multiplier: number;
  readonly allWildCombinationRule: 'no-pay';
}

export interface LineAwardRules {
  readonly direction: 'left-to-right';
  readonly activePaylines: number;
  readonly lineBetCredits: BetCredits;
  readonly totalBetCredits: BetCredits;
  readonly awardScaling: 'award-credits-per-line-bet';
  readonly matchRule: 'consecutive-from-leftmost-reel';
  readonly winSelection: 'highest-award-per-payline';
  readonly multiplePaylinesAccumulate: boolean;
  readonly nestedAwardsAccumulate: boolean;
  readonly scatterBreaksLineMatch: boolean;
}

export interface ScatterRules {
  readonly symbolId: SymbolId;
  readonly enabled: boolean;
  readonly evaluation: 'anywhere';
  readonly countMode: 'visible-symbols';
  readonly maximumCountMode: 'one-visible-scatter-per-reel';
  readonly substitutesOnLines: boolean;
  readonly wildSubstitutesForScatter: boolean;
  readonly scatterSubstitutesForRegular: boolean;
  readonly directCreditPaysEnabled: boolean;
  readonly triggersFeature: boolean;
}

export interface RulesConfig {
  readonly schemaVersion: ConfigVersion;
  readonly wild: WildRules;
  readonly lineAwardRules: LineAwardRules;
  readonly scatter: ScatterRules;
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
  readonly alternateReelStripConfigurationId?: string;
  readonly useAlternatePaytable: boolean;
  readonly notes?: string;
}

export interface RuntimeGameConfig {
  readonly schemaVersion: ConfigVersion;
  readonly gameId: string;
  readonly gameName: string;
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly selectedRtpProfile: string;
  readonly payModel: 'fixed-paylines-left-to-right';
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly lineBetCredits: BetCredits;
  readonly totalBetCredits: BetCredits;
  readonly maximumWinCredits: Credits;
  readonly maximumWinScope: 'paid-spin-including-feature';
  readonly symbols: readonly SymbolDefinition[];
  readonly reelStrips: readonly (readonly SymbolId[])[];
  readonly freeSpinReelStrips: readonly (readonly SymbolId[])[];
  readonly paylines: readonly Payline[];
  readonly paytable: readonly PayAward[];
  readonly bonus: BonusConfig;
  readonly rules: RulesConfig;
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
  readonly uncappedBaseLineWinCredits: Credits;
  readonly uncappedBaseScatterWinCredits: Credits;
  readonly uncappedBaseWinCredits: Credits;
  readonly uncappedFeatureWinCredits: Credits;
  readonly uncappedTotalWinCredits: Credits;
  readonly totalWinCredits: Credits;
  readonly capReductionCredits: Credits;
  readonly featureTriggered: boolean;
  readonly feature: FeatureResult | null;
  readonly maximumWinApplied: boolean;
}

export interface SimulationConfig {
  readonly spins: number;
  readonly seed: number;
  readonly betCredits: BetCredits;
}

export const DEFAULT_SIMULATION_CHECKPOINTS = [
  100, 1_000, 10_000, 100_000, 250_000, 500_000, 1_000_000,
] as const;

export interface SimulationCheckpoint {
  readonly bets: number;
  readonly totalWageredCredits: Credits;
  readonly totalReturnedCredits: Credits;
  readonly simulatedRtp: number;
  readonly theoreticalRtp: number;
  readonly rtpDeviation: number;
  readonly totalWins: number;
  readonly hitFrequency: number;
  readonly bonusTriggers: number;
  readonly bonusFrequency: number;
  readonly maximumWinCredits: Credits;
  readonly maximumWinMultiplier: number;
  readonly standardDeviation: number;
  readonly confidenceInterval95: readonly [number, number];
}

export interface SimulationCheckpointSeries {
  readonly seed: number;
  readonly maxBets: number;
  readonly betCredits: BetCredits;
  readonly theoreticalRtp: number;
  readonly checkpoints: readonly SimulationCheckpoint[];
  readonly finalReport: SimulationReport;
}

export interface DistributionBucket {
  readonly label: string;
  readonly minimumMultiple: number;
  readonly maximumMultiple: number | null;
  readonly count: number;
  readonly probability: number;
}

export interface FeatureLengthPercentiles {
  readonly median: number;
  readonly p75: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export interface SimulationReport {
  readonly schemaVersion: ConfigVersion;
  readonly methodology: 'deterministic-monte-carlo';
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly generatedAt: string;
  readonly seed: number;
  readonly paidSpins: number;
  readonly totalWageredCredits: Credits;
  readonly uncappedBaseLinePayoutCredits: Credits;
  readonly uncappedBaseScatterPayoutCredits: Credits;
  readonly uncappedBasePayoutCredits: Credits;
  readonly uncappedFeaturePayoutCredits: Credits;
  readonly uncappedTotalPayoutCredits: Credits;
  readonly creditedTotalPayoutCredits: Credits;
  readonly capReductionCredits: Credits;
  readonly uncappedBaseLineRtp: number;
  readonly uncappedBaseScatterRtp: number;
  readonly uncappedFeatureRtp: number;
  readonly uncappedTotalRtp: number;
  readonly creditedTotalRtp: number;
  readonly baseHitFrequency: number;
  readonly featureTriggerFrequency: number;
  readonly featureTriggerFrequencyByScatterCount: Readonly<Record<string, number>>;
  readonly featureInclusiveHitFrequency: number;
  readonly averageInitiallyAwardedFreeSpins: number;
  readonly averageTotalFreeSpinsPerTrigger: number;
  readonly averageRetriggersPerTrigger: number;
  readonly featureLengthPercentiles: FeatureLengthPercentiles;
  readonly maximumObservedFeatureLength: number;
  readonly featureCapHitFrequency: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly standardError: number;
  readonly confidenceInterval95: readonly [number, number];
  readonly maximumObservedWinCredits: Credits;
  readonly capApplications: number;
  readonly capApplicationFrequency: number;
  readonly payoutDistribution: readonly DistributionBucket[];
}

export interface ExactMathReport {
  readonly schemaVersion: ConfigVersion;
  readonly methodology: 'exact-uncapped' | 'exact-capped' | 'hybrid';
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly generatedAt: string;
  readonly sourceHash: string;
  readonly totalPaidSpinCombinations: number;
  readonly probabilityReconciliation: number;
  readonly uncappedBaseLineRtp: number;
  readonly uncappedBaseScatterRtp: number;
  readonly uncappedFeatureRtp: number;
  readonly uncappedTotalRtp: number;
  readonly creditedTotalRtp?: number;
  readonly creditedTotalRtpMethodology?: 'exact' | 'monte-carlo-estimate';
  readonly estimatedCapReductionRtp?: number;
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
