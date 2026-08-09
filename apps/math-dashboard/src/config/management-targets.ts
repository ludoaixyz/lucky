export const DASHBOARD_DEFAULT_BASE_BET_CREDITS = 5;

export const MANAGEMENT_TARGETS = {
  creditedRtp: { minimum: 0.94, maximum: 0.97 },
  baseHitFrequency: { minimum: 0.25, maximum: 0.32 },
  featureOccurrenceOdds: { minimum: 100, maximum: 140 },
  averageFeatureLength: { minimum: 9, maximum: 12 },
  baseCascadeRate: { minimum: 0.25, maximum: 0.3 },
  freeSpinCascadeRate: { minimum: 0.3, maximum: 0.35 },
  averageCascadesWhenTriggered: { minimum: 1.2, maximum: 1.5 },
  p95FeatureLengthMaximumExclusive: 30,
  capHitFrequencyMaximum: 0,
} as const;
