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
    expect(config).toMatchObject({
      configurationId: 'lucky888-balanced-base-v1',
      cascades: {
        enabled: true,
        scatterEvaluation: 'initial-grid-only',
        maximumCascadesPerSpin: 100,
      },
    });
    const simulation = runSimulation(
      config,
      { spins: 250, seed: 2026, betCredits: config.totalBetCredits },
      new SeededRandom(2026),
    );
    const report = buildDurableReport(config, 'abc123', simulation, null);

    expect(report.reconciliations).toHaveLength(8);
    expect(report.reconciliations.every((check) => check.passed)).toBe(true);
    expect(report).toMatchObject({ cascadeEnabled: true });
    expect(report.spinsWithCascade).toBeGreaterThan(0);
    expect(report.totalCascadeSteps).toBeGreaterThan(0);
    expect(report.cascadePayoutCredits).toBeGreaterThan(0);
    expect(report.cascadeRtpContribution).toBeGreaterThan(0);
    expect(report.cascadePayoutCredits).toBe(
      report.baseGameCascadePayoutCredits + report.freeSpinCascadePayoutCredits,
    );
    expect(report.totalCascadeSteps).toBe(
      report.baseGameCascadeSteps + report.freeSpinCascadeSteps,
    );
    expect(report.spinsWithCascade).toBe(
      report.baseGameSpinsWithCascade + report.freeSpinSpinsWithCascade,
    );
    expect(
      report.targetComparisons.every((comparison) =>
        ['PASS', 'WARN', 'FAIL'].includes(comparison.status),
      ),
    ).toBe(true);
    expect(renderSimulationMarkdown(report)).toContain('does not claim certification');
    expect(renderSimulationMarkdown(report)).toContain('## Cascades');
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
