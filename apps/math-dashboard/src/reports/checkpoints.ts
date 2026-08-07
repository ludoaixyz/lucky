import { DEFAULT_SIMULATION_CHECKPOINTS } from '@lucky/shared-types';
import type { SimulationCheckpoint } from '@lucky/shared-types';
import type { SimulationReport } from '../types/simulation-report.js';

export interface CheckpointViewModel {
  readonly checkpoints: readonly SimulationCheckpoint[];
  readonly labels: readonly string[];
  readonly simulatedRtp: readonly number[];
  readonly theoreticalRtp: readonly number[];
  readonly tableRows: readonly SimulationCheckpoint[];
  readonly isCanonical: boolean;
}

export function formatCheckpointAxisLabel(bets: number): string {
  if (bets >= 1_000_000 && bets % 1_000_000 === 0) return `${bets / 1_000_000}M`;
  if (bets >= 1_000 && bets % 1_000 === 0) return `${bets / 1_000}K`;
  return String(bets);
}

export function normalizeSimulationCheckpoints(
  checkpoints: readonly SimulationCheckpoint[] | undefined,
): readonly SimulationCheckpoint[] {
  return Object.freeze(
    [...(checkpoints ?? [])]
      .filter((checkpoint) => Number.isFinite(checkpoint.bets))
      .sort((left, right) => left.bets - right.bets),
  );
}

export function isCanonicalCheckpointSeries(checkpoints: readonly SimulationCheckpoint[]): boolean {
  return (
    checkpoints.length === DEFAULT_SIMULATION_CHECKPOINTS.length &&
    checkpoints.every(
      (checkpoint, index) => checkpoint.bets === DEFAULT_SIMULATION_CHECKPOINTS[index],
    )
  );
}

export function createCheckpointViewModel(report: SimulationReport): CheckpointViewModel {
  const checkpoints = normalizeSimulationCheckpoints(report.simulationCheckpoints);
  return Object.freeze({
    checkpoints,
    labels: Object.freeze(
      checkpoints.map((checkpoint) => formatCheckpointAxisLabel(checkpoint.bets)),
    ),
    simulatedRtp: Object.freeze(checkpoints.map((checkpoint) => checkpoint.simulatedRtp * 100)),
    theoreticalRtp: Object.freeze(checkpoints.map((checkpoint) => checkpoint.theoreticalRtp * 100)),
    tableRows: checkpoints,
    isCanonical: isCanonicalCheckpointSeries(checkpoints),
  });
}
