export const PRESENTATION_SPEED_MULTIPLIER = 5;
export const MINIMUM_VISIBLE_DURATION_MS = 24;
export const PRESENTATION_SPEED_OPTIONS = [0.5, 1, 2, 3] as const;
export type PresentationSpeed = (typeof PRESENTATION_SPEED_OPTIONS)[number];

export function scaledDuration(milliseconds: number, speed: number = 1): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    throw new RangeError('Duration must be finite and non-negative');
  if (!Number.isFinite(speed) || speed <= 0)
    throw new RangeError('Presentation speed must be finite and positive');
  if (milliseconds === 0) return 0;
  return Math.max(
    MINIMUM_VISIBLE_DURATION_MS,
    Math.round(milliseconds / PRESENTATION_SPEED_MULTIPLIER / speed),
  );
}

export function scaledDelay(milliseconds: number, speed: number = 1): number {
  return scaledDuration(milliseconds, speed);
}

export function presentationTiming(speed: number = 1) {
  return {
    reelStep: scaledDuration(180, speed),
    reelStopStagger: scaledDelay(150, speed),
    reelDeceleration: [270, 330, 410, 520, 670, 860].map((duration) =>
      scaledDuration(duration, speed),
    ),
    symbolLanding: scaledDuration(180, speed),
    baseWinHold: scaledDelay(400, speed),
    paylineDisplay: scaledDelay(650, speed),
    allPaylinesDisplay: scaledDelay(500, speed),
    freeSpinTransition: scaledDelay(600, speed),
    retriggerDisplay: scaledDelay(750, speed),
    featureCompletion: scaledDelay(850, speed),
    payoutCountUp: scaledDuration(700, speed),
  } as const;
}

export const PRESENTATION_TIMING = presentationTiming();
