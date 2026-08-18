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

export interface CascadeConfig {
  readonly enabled: boolean;
  readonly scatterEvaluation?: 'initial-grid-only';
  readonly maximumCascadesPerSpin?: number;
}

export interface RtpBudgetRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface RtpBudgets {
  readonly provisional: true;
  readonly initialBoardBaseLine: RtpBudgetRange;
  readonly cascadeStages: RtpBudgetRange;
  readonly freeSpinFeature: RtpBudgetRange;
  readonly scatterDirectPay: RtpBudgetRange;
  readonly creditedTotal: RtpBudgetRange;
  readonly notes?: string;
}

export type VolatilityClassification = 'low' | 'medium' | 'medium-high' | 'high';

export type ProbabilityTargetRange = RtpBudgetRange;

export interface VolatilityTarget {
  readonly classification: VolatilityClassification;
  readonly provisional: true;
  readonly standardDeviationMultiple: RtpBudgetRange;
  readonly tailTargets: Readonly<
    Record<
      '20xPlusProbability' | '50xPlusProbability' | '100xPlusProbability' | '250xPlusProbability',
      ProbabilityTargetRange
    >
  >;
  readonly notes?: string;
}

export interface FeatureFrequencyTarget {
  readonly paidSpinsPerTrigger: {
    readonly target: number;
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly provisional: true;
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
  readonly cascades?: CascadeConfig;
  readonly rtpBudgets: RtpBudgets;
  readonly volatilityTarget?: VolatilityTarget;
  readonly featureFrequencyTarget?: FeatureFrequencyTarget;
}

export interface LineWin {
  readonly paylineId: string;
  readonly symbolId: SymbolId;
  readonly count: number;
  readonly awardCredits: AwardCredits;
}

export interface GridCoordinate {
  readonly reel: number;
  readonly row: number;
}

export interface CascadeStage {
  /** Zero is the initial board; positive values are additional cascade boards. */
  readonly index: number;
  readonly window: readonly (readonly SymbolId[])[];
  readonly lineWins: readonly LineWin[];
  readonly payoutCredits: Credits;
  readonly multiplier: 1;
  readonly removedCoordinates: readonly GridCoordinate[];
}

export interface CascadeOutcome {
  readonly cascadeCount?: number;
  readonly cascades?: readonly CascadeStage[];
  readonly cascadePayoutCredits?: Credits;
}

export interface ReelOutcome extends CascadeOutcome {
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

export interface OutcomePercentiles {
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly p995: number;
  readonly p999: number;
  readonly p9999: number;
}

export interface TailMetric {
  readonly thresholdMultiple: number;
  readonly count: number;
  readonly probability: number;
  readonly rtpContribution: number;
}

export interface EngineeringTargetAssessment {
  readonly status: 'PASS' | 'FAIL';
  readonly configuredClassification: VolatilityClassification;
  readonly observedClassification: VolatilityClassification | null;
  readonly criteria: Readonly<Record<string, 'PASS' | 'FAIL'>>;
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
  readonly initialBoardBaseLinePayoutCredits: Credits;
  readonly uncappedBaseScatterPayoutCredits: Credits;
  readonly uncappedBasePayoutCredits: Credits;
  readonly uncappedFeaturePayoutCredits: Credits;
  readonly freeSpinFeatureNonCascadePayoutCredits: Credits;
  readonly uncappedTotalPayoutCredits: Credits;
  readonly creditedTotalPayoutCredits: Credits;
  readonly capReductionCredits: Credits;
  readonly uncappedBaseLineRtp: number;
  readonly initialBoardBaseLineRtp: number;
  readonly uncappedBaseScatterRtp: number;
  readonly uncappedFeatureRtp: number;
  readonly freeSpinFeatureNonCascadeRtp: number;
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
  readonly zeroReturnProbability: number;
  readonly subBetReturnProbability: number;
  readonly tailMetrics: readonly TailMetric[];
  readonly outcomePercentiles: OutcomePercentiles;
  readonly volatilityTarget?: VolatilityTarget;
  readonly volatilityAssessment?: EngineeringTargetAssessment;
  readonly featureFrequencyTarget?: FeatureFrequencyTarget;
  readonly paidSpinsPerFeatureTrigger: number | null;
  readonly cascadeEnabled: boolean;
  readonly spinsWithCascade: number;
  readonly eligibleCascadeSpins: number;
  readonly cascadeSpinRate: number;
  readonly totalCascadeSteps: number;
  readonly averageCascadeStepsPerPaidSpin: number;
  readonly averageCascadeStepsWhenTriggered: number;
  readonly maxCascadeDepthObserved: number;
  readonly cascadePayout: Credits;
  readonly cascadePayoutCredits: Credits;
  readonly cascadeRtpContribution: number;
  readonly baseGameSpinsWithCascade: number;
  readonly baseGameCascadeSpinRate: number;
  readonly baseGameCascadeSteps: number;
  readonly baseGameCascadePayoutCredits: Credits;
  readonly freeSpinSpinsWithCascade: number;
  readonly freeSpinCascadeSpinRate: number;
  readonly freeSpinCascadeSteps: number;
  readonly freeSpinCascadePayoutCredits: Credits;
}

export interface ExactMathReport {
  readonly schemaVersion: ConfigVersion;
  readonly methodology: 'exact-uncapped' | 'exact-capped' | 'hybrid';
  readonly gameVersion: ConfigVersion;
  readonly configurationId: string;
  readonly generatedAt: string;
  readonly sourceHash: string;
  readonly structuralHash?: string;
  readonly payoutHash?: string;
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

// Bathala-style Lucky888 active math contract. The older interfaces above are retained only so
// archived dashboard reports remain readable; the active engine does not consume them.
export type RegularSymbolId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'H1' | 'H2' | 'H3' | 'H4';
export type BathalaSymbolId = RegularSymbolId | 'SCATTER' | 'MULTIPLIER';
export type GameMode = 'base' | 'freegame';
export interface WeightedSymbol {
  readonly symbol: BathalaSymbolId;
  readonly weight: number;
}
export interface WeightedMultiplier {
  readonly value: number;
  readonly weight: number;
}
export interface CountPayAward {
  readonly symbol: RegularSymbolId;
  readonly minCount: number;
  readonly maxCount: number;
  readonly payout: number;
}
export interface SymbolCell {
  readonly id: string;
  readonly symbol: BathalaSymbolId;
  readonly multiplierValue?: number;
  collectedIntoFreeGamePool?: boolean;
}
export type BoardCell = SymbolCell | null;
export type Board = BoardCell[][];
export interface Position {
  readonly column: number;
  readonly row: number;
}
export interface BathalaConfig {
  readonly enabled: boolean;
  readonly trigger: 'after_scoring_elimination';
  readonly eligibleSymbols: readonly RegularSymbolId[];
  readonly selectionMode: 'random_symbol_type' | 'weighted_symbol_type';
  readonly selectionWeights?: Readonly<Partial<Record<RegularSymbolId, number>>>;
  readonly removeMode: 'all_instances' | 'random_count';
  readonly randomCount?: { readonly minimum: number; readonly maximum: number };
  readonly allowNoEligibleTarget: boolean;
  readonly awardsDirectPayout: false;
}
export interface ScatterConfig {
  readonly evaluationTiming: 'final_board';
  readonly payouts: Readonly<Record<string, number>>;
  readonly baseGameTrigger: { readonly minimumScatters: number; readonly freeGamesAwarded: number };
  readonly freeGameRetrigger: {
    readonly minimumScatters: number;
    readonly additionalFreeGames: number;
  };
}
export interface MathConfigMetadata {
  readonly profileName: string;
  readonly version: string;
  readonly volatilityProfile: 'stable' | 'balanced' | 'high' | 'custom';
}
export interface BettingConfig {
  readonly bets: readonly number[];
  readonly defaultBet: number;
  readonly startingCredits: number;
  readonly autoSpinOptions: readonly number[];
}
export interface MathReferenceConfig {
  /** Designer reference only. RTP remains an emergent simulation/session result. */
  readonly targetRtp: number;
  /** Designer reference expressed as paid spins per feature trigger. */
  readonly featureEntrySpins: number;
}
export interface BathalaLimitConfig {
  readonly maximumWinMultiple: number;
  readonly maximumMultiplier: number;
  readonly maximumSessionRecords: number;
}
export interface ActiveGameConfig {
  readonly schemaVersion: string;
  readonly gameId: 'lucky888';
  readonly gameName: string;
  readonly gameVersion: string;
  readonly configurationId: string;
  readonly metadata: MathConfigMetadata;
  readonly betting: BettingConfig;
  readonly references: MathReferenceConfig;
  readonly limits: BathalaLimitConfig;
  readonly model: 'bathala-count-pay-tumble';
  readonly columns: 6;
  readonly rows: 5;
  readonly minimumWinCount: 8;
  readonly totalBet: 1;
  readonly maximumTumbleRounds: number;
  readonly freeGameMultiplierCollectionTrigger: 'winning_round';
  readonly symbols: readonly BathalaSymbolId[];
  readonly regularSymbols: readonly RegularSymbolId[];
  readonly lowSymbols: readonly RegularSymbolId[];
  readonly baseSymbolWeights: readonly WeightedSymbol[];
  readonly freegameSymbolWeights: readonly WeightedSymbol[];
  readonly multiplierValues: readonly WeightedMultiplier[];
  readonly paytable: readonly CountPayAward[];
  readonly bathala: BathalaConfig;
  readonly scatter: ScatterConfig;
  readonly notes?: readonly string[];
}
export interface SymbolWin {
  readonly symbol: RegularSymbolId;
  readonly count: number;
  readonly payout: number;
  readonly positions: readonly Position[];
}
export interface MultiplierOccurrence {
  readonly id: string;
  readonly value: number;
  readonly newlyCollected: boolean;
}
export interface BathalaSkillResult {
  occurred: boolean;
  readonly targetSymbol?: RegularSymbolId;
  readonly removedPositions: readonly Position[];
  resultedInNextWin?: boolean;
}
export interface TumbleRound {
  readonly index: number;
  readonly winningSymbols: readonly SymbolWin[];
  readonly baseWin: number;
  readonly multiplierSymbols: readonly MultiplierOccurrence[];
  readonly visibleMultiplierSum: number;
  readonly newlyCollectedMultiplierSum: number;
  readonly effectiveMultiplier: number;
  readonly creditedWin: number;
  readonly removedWinningCells: readonly Position[];
  readonly bathala?: BathalaSkillResult;
  readonly boardBefore?: Board;
  readonly boardAfterRemoval?: Board;
  readonly boardAfterCollapse?: Board;
  readonly boardAfterRefill?: Board;
}
export interface TumbleChainResult {
  readonly initialBoard?: Board;
  readonly finalBoard: Board;
  readonly rounds: readonly TumbleRound[];
  readonly totalWin: number;
  readonly accumulatedMultiplierAfter: number;
  readonly scatterCount: number;
  readonly scatterPayout: number;
}
export interface FreeGameSpinResult {
  readonly index: number;
  /** Present only when trace mode is enabled. */
  readonly initialBoard?: Board;
  /** Presentation snapshot only; mathematical evaluation is already complete. */
  readonly finalBoard: Board;
  readonly accumulatedMultiplierBefore: number;
  readonly tumbleRounds: readonly TumbleRound[];
  readonly accumulatedMultiplierAfter: number;
  readonly scattersLanded: number;
  readonly scatterPayout: number;
  readonly retriggeredSpins: number;
  readonly win: number;
}
export interface FreeGameFeatureResult {
  readonly initialAward: number;
  readonly totalSpinsPlayed: number;
  readonly retriggerCount: number;
  readonly startingMultiplier: 0;
  readonly endingMultiplier: number;
  readonly spins: readonly FreeGameSpinResult[];
  readonly totalWin: number;
}
export interface WinComponents {
  readonly baseGameRegularPayout: number;
  readonly baseGameScatterPayout: number;
  readonly baseGameMultiplierUplift: number;
  readonly freeGameRegularPayout: number;
  readonly freeGameScatterPayout: number;
  readonly freeGameMultiplierUplift: number;
}
export interface BathalaSpinResult {
  readonly initialBoard?: Board;
  readonly finalBoard: Board;
  readonly tumbleRounds: readonly TumbleRound[];
  readonly baseGameWin: number;
  readonly scatterCount: number;
  readonly scatterPayout: number;
  readonly freeGamesAwarded: number;
  readonly feature: FreeGameFeatureResult | null;
  readonly components: WinComponents;
  readonly totalWin: number;
  readonly uncappedTotalWin: number;
  readonly maximumWinApplied: boolean;
}

export interface SpinRecord {
  readonly sessionId: string;
  readonly sessionSeed: number;
  readonly spinNumber: number;
  readonly spinIndex: number;
  readonly timestamp: string;
  readonly configurationId: string;
  readonly configurationVersion: string;
  readonly profileName: string;
  readonly bet: number;
  readonly baseWin: number;
  readonly featureWin: number;
  readonly baseRegularWin: number;
  readonly baseScatterWin: number;
  readonly baseMultiplierUplift: number;
  readonly featureRegularWin: number;
  readonly featureScatterWin: number;
  readonly featureMultiplierUplift: number;
  readonly totalWin: number;
  readonly winMultiple: number;
  readonly winning: boolean;
  readonly winOutcomes: readonly WinOutcome[];
  readonly totalTumbleRounds: number;
  readonly totalTumbleTriggers: number;
  readonly baseTumbleRounds: number;
  readonly freeGameTumbleRounds: number;
  readonly freeGameTumbleTriggers: number;
  readonly maximumTumbleDepth: number;
  readonly maximumBaseTumbleDepth: number;
  readonly maximumFreeGameTumbleDepth: number;
  readonly bathalaActivations: number;
  readonly bathalaSymbolsRemoved: number;
  readonly bathalaNextWinConversions: number;
  readonly multiplierAppeared: boolean;
  readonly multiplierValues: readonly number[];
  readonly summedMultiplier: number;
  readonly multipliedTumbleRounds: number;
  readonly summedEffectiveMultipliers: number;
  readonly scatterCount: number;
  readonly featureTriggered: boolean;
  readonly freeGamesAwarded: number;
  readonly freeGamesPlayed: number;
  readonly retriggerCount: number;
  readonly endingFreeGameMultiplier?: number;
  readonly maximumWinApplied: boolean;
}

export interface WinOutcome {
  readonly phase: 'base' | 'free';
  readonly freeGameIndex?: number;
  /** Zero is the initial winning board; positive values are subsequent tumbles. */
  readonly tumbleIndex: number;
  readonly symbolId: RegularSymbolId;
  readonly symbolCount: number;
  readonly basePayoutMultiple: number;
  readonly multiplierApplied: number;
  readonly creditedPayoutMultiple: number;
}
export interface BathalaSimulationConfig {
  readonly spins: number;
  readonly seed: number;
  readonly trace?: boolean;
}
export interface BathalaTailMetric {
  readonly threshold: number;
  readonly count: number;
  readonly frequency: number;
}
export interface BathalaSimulationReport {
  readonly schemaVersion: '2.0.0';
  readonly methodology: 'deterministic-streaming-monte-carlo';
  readonly configurationId: string;
  readonly seed: number;
  readonly totalSpins: number;
  readonly totalBet: number;
  readonly totalCreditedWin: number;
  readonly rtp: number;
  readonly winningSpinFrequency: number;
  readonly averageWinPerWinningSpin: number;
  readonly baseGameTumbleTriggerFrequency: number;
  readonly freeGameTumbleTriggerFrequency: number;
  readonly averageBaseGameTumbleRoundsPerTrigger: number;
  readonly averageFreeGameTumbleRoundsPerTrigger: number;
  readonly tumbleRoundsPerPaidSpin: number;
  readonly tumbleTriggerFrequency: number;
  readonly averageTumbleRoundsPerTriggeringSpin: number;
  readonly maximumObservedBaseGameTumbleDepth: number;
  readonly maximumObservedFreeGameTumbleDepth: number;
  readonly maximumObservedTumbleDepth: number;
  readonly bathalaActivations: number;
  readonly bathalaActivationFrequency: number;
  readonly averageSymbolsRemoved: number;
  readonly bathalaToNextWinConversionRate: number;
  readonly multiplierAppearanceFrequency: number;
  readonly averageMultiplierValue: number;
  readonly averageSummedMultiplierOnMultipliedWins: number;
  readonly maximumSummedMultiplier: number;
  readonly freeGameTriggerCount: number;
  readonly featureFrequency: number;
  readonly averageFreeGamesPlayed: number;
  readonly averageInitiallyAwardedFreeGames: number;
  readonly maximumObservedFeatureLength: number;
  readonly featureLengthPercentiles: {
    readonly p50: number;
    readonly p75: number;
    readonly p90: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly retriggerCount: number;
  readonly averageRetriggersPerFeature: number;
  readonly averageEndingFreeGameMultiplier: number;
  readonly freeGameWinContribution: number;
  readonly baseGameWinContribution: number;
  readonly maximumObservedWin: number;
  readonly meanWinPerPaidSpin: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly coefficientOfVariation: number;
  readonly standardError: number;
  readonly confidenceInterval95: readonly [number, number];
  readonly components: WinComponents;
  readonly tails: readonly BathalaTailMetric[];
}
