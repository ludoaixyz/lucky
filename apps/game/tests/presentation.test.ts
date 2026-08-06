import { describe, expect, it } from 'vitest';
import { matchedPaylineCenters, paylineColor } from '../src/game/payline-presentation.js';
import {
  MINIMUM_VISIBLE_DURATION_MS,
  PRESENTATION_SPEED_MULTIPLIER,
  scaledDelay,
  scaledDuration,
} from '../src/game/presentation-timing.js';

describe('prototype presentation timing', () => {
  it('uses one five-times multiplier while preserving a visible frame', () => {
    expect(PRESENTATION_SPEED_MULTIPLIER).toBe(5);
    expect(scaledDuration(1000)).toBe(200);
    expect(scaledDelay(10)).toBe(MINIMUM_VISIBLE_DURATION_MS);
    expect(scaledDuration(0)).toBe(0);
  });
});

describe('payline presentation geometry', () => {
  it('supports horizontal, V, and inverted V paths through matched reels only', () => {
    const horizontal = matchedPaylineCenters(
      { id: 'L1', rows: [1, 1, 1, 1, 1] },
      3,
      5,
      3,
      800,
      480,
    );
    const vee = matchedPaylineCenters({ id: 'L4', rows: [0, 1, 2, 1, 0] }, 5, 5, 3, 800, 480);
    const inverted = matchedPaylineCenters({ id: 'L5', rows: [2, 1, 0, 1, 2] }, 5, 5, 3, 800, 480);

    expect(horizontal).toHaveLength(3);
    expect(horizontal.map((point) => point.y)).toEqual([240, 240, 240]);
    expect(vee.map((point) => point.y)).toEqual([80, 240, 400, 240, 80]);
    expect(inverted.map((point) => point.y)).toEqual([400, 240, 80, 240, 400]);
  });

  it('selects readable colors deterministically by payline id', () => {
    expect(paylineColor('L4')).toBe(paylineColor('L4'));
    expect(paylineColor('L4')).not.toBe(paylineColor('L5'));
  });
});
