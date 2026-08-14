export interface TargetRange {
  minimum?: number;
  maximum?: number;
}
export interface ManagementTargets {
  rtp?: TargetRange;
  winningSpinFrequency?: TargetRange;
  baseGameTumbleTriggerFrequency?: TargetRange;
  averageBaseGameTumbleRoundsPerTrigger?: TargetRange;
  bathalaConversion?: TargetRange;
  featureFrequency?: TargetRange;
  averageFreeGamesPlayed?: TargetRange;
  averageRetriggersPerFeature?: TargetRange;
  baseGameContribution?: TargetRange;
  freeGameContribution?: TargetRange;
  multiplierContribution?: TargetRange;
  maximumObservedWin?: TargetRange;
  standardDeviation?: TargetRange;
}
// Prototype calibration intentionally has no production targets. Supply reviewed ranges here per profile.
export const MANAGEMENT_TARGETS: ManagementTargets = {};
