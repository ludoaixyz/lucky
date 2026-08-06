import { describe, expect, it } from 'vitest';
import type { CompletedSpin } from '../src/diagnostics/types.js';
import { SessionDiagnosticsStore } from '../src/diagnostics/session-diagnostics.js';
import { buildSpinHistoryCsv, spinHistoryFilename } from '../src/diagnostics/csv.js';

function completedSpin(index: number): CompletedSpin {
  const betCredits = 5;
  const winCredits = index % 3 === 0 ? 10 : 0;
  const creditsBefore = 1000 - (index - 1) * betCredits;
  return {
    timestamp: `2026-08-06T00:00:${String(index).padStart(2, '0')}.000Z`,
    betCredits,
    winCredits,
    creditsBefore,
    creditsAfter: creditsBefore - betCredits + winCredits,
    featureTriggered: index === 3,
    outcome: {
      visibleWindow: [
        ['A', 'K', 'Q'],
        ['J', 'A', 'K'],
      ],
      reelStops: [index, index + 1],
      lineWins:
        winCredits > 0
          ? [{ paylineId: 'L1', symbolId: 'A', count: 3, awardCredits: winCredits }]
          : [],
    },
  };
}

describe('session diagnostics', () => {
  it('accumulates completed spins and exposes the latest ten newest-first', () => {
    const store = new SessionDiagnosticsStore();
    for (let index = 1; index <= 12; index += 1) store.record(completedSpin(index));
    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({ totalSpins: 12, totalWagered: 60, totalWon: 40 });
    expect(snapshot.rtp).toBeCloseTo(40 / 60);
    expect(snapshot.recentSpins).toHaveLength(10);
    expect(snapshot.recentSpins.map((entry) => entry.spinNumber)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3,
    ]);
  });

  it('records net credits and cumulative totals on each entry', () => {
    const store = new SessionDiagnosticsStore();
    store.record(completedSpin(1));
    const entry = store.record(completedSpin(3));
    expect(entry).toMatchObject({
      spinNumber: 2,
      netCredits: 5,
      sessionTotalSpins: 2,
      sessionTotalWagered: 10,
      sessionTotalWon: 10,
    });
  });
});

describe('CSV export', () => {
  it('includes required outcome and cumulative fields with CSV escaping', () => {
    const store = new SessionDiagnosticsStore();
    store.record(completedSpin(3));
    const csv = buildSpinHistoryCsv(store.snapshot().history);
    expect(csv).toContain('spinNumber,timestamp,betCredits,winCredits,netCredits');
    expect(csv).toContain('featureTriggered,visibleWindow,reelStops,lineWins');
    expect(csv).toContain('A|K|Q / J|A|K');
    expect(csv).toContain('L1:A×3=10');
  });

  it('creates the requested timestamped filename', () => {
    expect(spinHistoryFilename(new Date('2026-08-06T12:34:56.000Z'))).toBe(
      'lucky888-spin-history-20260806-123456.csv',
    );
  });
});
