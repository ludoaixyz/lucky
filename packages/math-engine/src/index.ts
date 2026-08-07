export type { RandomSource, ProductionRandomSource } from './rng/random-source.js';
export { SeededRandom } from './rng/seeded-random.js';
export { selectReelStops, buildVisibleWindow } from './evaluation/reels.js';
export {
  DEFAULT_MAXIMUM_CASCADES_PER_SPIN,
  collapseAndRefill,
  extractWinningCoordinates,
  resolveCascadeSequence,
} from './evaluation/cascade.js';
export {
  countScatters,
  evaluatePaylines,
  aggregateWins,
  enforceMaximumWin,
} from './evaluation/evaluate.js';
export { resolveSpin } from './evaluation/spin.js';
export {
  resolveBonusAward,
  resolveRetriggerAward,
  resolveFreeSpin,
  resolveFreeSpinFeature,
} from './evaluation/bonus.js';
export { maximumReachableScatterCount, validateConfig } from './validation/config.js';
export type { ValidationIssue } from './validation/config.js';
export {
  SimulationAccumulator,
  runSimulation,
  runSimulationCheckpoints,
  assertFiniteReport,
} from './simulation/accumulator.js';
export { enumerateExact } from './enumeration/exact.js';
