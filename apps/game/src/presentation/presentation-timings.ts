export type SpinSpeed = 'normal' | 'x1' | 'x2';

export const PRESENTATION_TIMINGS = Object.freeze({
  normal: {
    drop: {
      total: 2100,
      motion: 500,
      columnStagger: 305,
      rowStagger: 205,
      landing: 100,
      postLandingHold: 300,
    },
    win: {
      perGroupHold: 1500,
      combinedWinHold: 500,
      connectorDraw: 350,
      remove: 250,
      afterRemoveHold: 250,
      bathalaRemove: 500,
      afterBathalaHold: 350,
      collapse: 550,
      afterCollapseHold: 200,
      refill: 500,
      postRefillHold: 450,
      stoppedHold: 70,
    },
  },
  x1: {
    drop: {
      total: 1100,
      motion: 500,
      columnStagger: 30,
      rowStagger: 20,
      landing: 120,
      postLandingHold: 250,
    },
    win: {
      perGroupHold: 750,
      combinedWinHold: 300,
      connectorDraw: 250,
      remove: 260,
      afterRemoveHold: 150,
      bathalaRemove: 300,
      afterBathalaHold: 200,
      collapse: 320,
      afterCollapseHold: 120,
      refill: 500,
      postRefillHold: 220,
      stoppedHold: 70,
    },
  },
  x2: {
    drop: {
      total: 600,
      motion: 500,
      columnStagger: 16,
      rowStagger: 10,
      landing: 80,
      postLandingHold: 150,
    },
    win: {
      perGroupHold: 350,
      combinedWinHold: 160,
      connectorDraw: 160,
      remove: 140,
      afterRemoveHold: 70,
      bathalaRemove: 160,
      afterBathalaHold: 90,
      collapse: 180,
      afterCollapseHold: 60,
      refill: 280,
      postRefillHold: 100,
      stoppedHold: 50,
    },
  },
} as const);

/** Internal values map to the visible x1, x2 and x3 controls. */
export const SPIN_SPEEDS = Object.freeze({ normal: 2100, x1: 1100, x2: 600 } as const);

export function speedLabel(speed: SpinSpeed): 'x1' | 'x2' | 'x3' {
  return speed === 'normal' ? 'x1' : speed === 'x1' ? 'x2' : 'x3';
}
