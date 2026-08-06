export const DASHBOARD_DEFAULT_BASE_BET_CREDITS = 5;

export const MANAGEMENT_TARGETS = {
  creditedRtp: { minimum: 0.94, maximum: 0.97 },
  baseHitFrequency: { minimum: 0.2, maximum: 0.35 },
  featureOccurrenceOdds: { minimum: 80, maximum: 150 },
  averageFeatureLength: { minimum: 9, maximum: 14 },
  p95FeatureLengthMaximumExclusive: 30,
  capHitFrequencyMaximum: 0,
} as const;
