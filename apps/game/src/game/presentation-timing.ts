export const PRESENTATION_SPEED_MULTIPLIER = 5;
export const MINIMUM_VISIBLE_DURATION_MS = 24;

export function scaledDuration(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    throw new RangeError('Duration must be finite and non-negative');
  if (milliseconds === 0) return 0;
  return Math.max(
    MINIMUM_VISIBLE_DURATION_MS,
    Math.round(milliseconds / PRESENTATION_SPEED_MULTIPLIER),
  );
}

export const scaledDelay = scaledDuration;

export const PRESENTATION_TIMING = {
  reelStep: scaledDuration(180),
  reelStopStagger: scaledDelay(150),
  reelDeceleration: [270, 330, 410, 520, 670, 860].map(scaledDuration),
  symbolLanding: scaledDuration(180),
  baseWinHold: scaledDelay(400),
  paylineDisplay: scaledDelay(650),
  allPaylinesDisplay: scaledDelay(500),
  freeSpinTransition: scaledDelay(600),
  retriggerDisplay: scaledDelay(750),
  featureCompletion: scaledDelay(850),
  payoutCountUp: scaledDuration(700),
} as const;
