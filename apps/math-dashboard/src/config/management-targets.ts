export type TargetType = 'range' | 'minimum' | 'maximum' | 'exact' | 'informational';
export type TargetCriticality = 'critical' | 'standard';

export interface ManagementTarget {
  readonly metric: string;
  readonly type: TargetType;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly warningMinimum?: number;
  readonly warningMaximum?: number;
  readonly exact?: number;
  readonly unit?: string;
  readonly criticality?: TargetCriticality;
}

export type ManagementTargets = Readonly<Record<string, ManagementTarget>>;

// Intentionally uncalibrated. Reviewed targets may be injected by configuration profile.
// Example shape: { rtp: { metric: 'rtp', type: 'range', minimum: .95, maximum: .96,
// warningMinimum: .945, warningMaximum: .965, unit: 'percent', criticality: 'critical' } }
export const MANAGEMENT_TARGETS: ManagementTargets = Object.freeze({});
