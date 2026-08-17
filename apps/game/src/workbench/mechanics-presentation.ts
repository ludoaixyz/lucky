import type { BathalaSpinResult, SpinRecord } from '@lucky/shared-types';
import { formatMultiplier } from './number-format.js';

export interface MechanicValues {
  readonly tumbles: string;
  readonly bathala: string;
  readonly multiplier: string;
}

const multiplierText = (values: readonly number[]): string =>
  values.length ? values.map(formatMultiplier).join(' + ') : '—';

export function resultMechanicValues(result: BathalaSpinResult): MechanicValues {
  const rounds = [
    ...result.tumbleRounds,
    ...(result.feature?.spins.flatMap((spin) => spin.tumbleRounds) ?? []),
  ];
  const bathalaCount = rounds.filter((round) => round.bathala?.occurred).length;
  const multipliers = rounds.flatMap((round) => round.multiplierSymbols.map(({ value }) => value));
  return {
    tumbles: String(rounds.length),
    bathala: bathalaCount > 0 ? String(bathalaCount) : '—',
    multiplier: multiplierText(multipliers),
  };
}

export function recordMechanicValues(record: SpinRecord): MechanicValues {
  return {
    tumbles: String(record.totalTumbleRounds),
    bathala: String(record.bathalaActivations),
    multiplier: multiplierText(record.multiplierValues),
  };
}
