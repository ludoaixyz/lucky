export interface ReciprocalTailTick {
  readonly frequency: number;
  readonly logFrequency: number;
}

export interface ReciprocalTailScale {
  readonly domainMinimumLog: number;
  readonly domainMaximumLog: number;
  readonly ticks: readonly ReciprocalTailTick[];
}

export const FIXED_TAIL_OCCURRENCES = Object.freeze([
  10, 100, 1_000, 10_000, 100_000, 1_000_000,
] as const);

export function reciprocalTailScale(frequencies: readonly number[]): ReciprocalTailScale | null {
  const positive = frequencies.filter((frequency) => Number.isFinite(frequency) && frequency > 0);
  if (positive.length === 0) return null;
  const ticks = FIXED_TAIL_OCCURRENCES.map((occurrence) => ({
    frequency: 1 / occurrence,
    logFrequency: Math.log10(1 / occurrence),
  })).sort((left, right) => right.logFrequency - left.logFrequency);
  return {
    domainMinimumLog: -6,
    domainMaximumLog: -1,
    ticks,
  };
}

export function formatReciprocalTailTick(
  frequency: number,
  oneIn: string,
  million: string,
): string {
  const occurrence = Math.round(1 / frequency);
  if (occurrence === 1_000_000) return `${oneIn} ${million}`;
  if (occurrence >= 1_000) return `${oneIn} ${occurrence / 1_000}k`;
  return `${oneIn} ${occurrence}`;
}

export function reciprocalTailY(
  scale: ReciprocalTailScale,
  frequency: number,
  top: number,
  plotHeight: number,
): number | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  return (
    top +
    ((scale.domainMaximumLog - Math.log10(frequency)) /
      (scale.domainMaximumLog - scale.domainMinimumLog)) *
      plotHeight
  );
}
