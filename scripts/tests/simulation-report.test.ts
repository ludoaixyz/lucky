import { describe, expect, it } from 'vitest';
import { runSimulation, SeededRandom } from '@lucky/math-engine';
import { loadSourceConfig } from '../lib/source-loader.js';
import {
  buildDurableReport,
  reconcileSimulation,
  renderSimulationMarkdown,
} from '../lib/simulation-report.js';

describe('durable simulation report', () => {
  it('generates JSON-ready data and all required reconciliation checks', async () => {
    const { config } = await loadSourceConfig();
    const simulation = runSimulation(
      config,
      { spins: 250, seed: 2026, betCredits: config.totalBetCredits },
      new SeededRandom(2026),
    );
    const report = buildDurableReport(config, 'abc123', simulation, null);

    expect(report.reconciliations).toHaveLength(5);
    expect(report.reconciliations.every((check) => check.passed)).toBe(true);
    expect(
      report.targetComparisons.every((comparison) =>
        ['PASS', 'WARN', 'FAIL'].includes(comparison.status),
      ),
    ).toBe(true);
    expect(renderSimulationMarkdown(report)).toContain('does not claim certification');
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({ sourceHash: 'abc123', seed: 2026 });
  });

  it('rejects reports whose accounting does not reconcile', async () => {
    const { config } = await loadSourceConfig();
    const simulation = runSimulation(
      config,
      { spins: 10, seed: 7, betCredits: config.totalBetCredits },
      new SeededRandom(7),
    );
    const broken = {
      ...simulation,
      creditedTotalPayoutCredits: simulation.creditedTotalPayoutCredits + 1,
    };

    expect(reconcileSimulation(broken, config.totalBetCredits).some((check) => !check.passed)).toBe(
      true,
    );
    expect(() => buildDurableReport(config, 'hash', broken, null)).toThrow(
      /credited-plus-cap-reduction/u,
    );
  });
});
