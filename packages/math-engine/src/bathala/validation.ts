import type { ActiveGameConfig, BathalaSymbolId } from '@lucky/shared-types';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateConfig(config: ActiveGameConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  if (config.columns !== 6 || config.rows !== 5)
    issue('layout', 'must be exactly 6 columns by 5 rows');
  if (config.minimumWinCount !== 8) issue('minimumWinCount', 'must equal 8');
  if (config.totalBet !== 1) issue('totalBet', 'must equal 1');
  if (config.model !== 'bathala-count-pay-tumble')
    issue('model', 'must select Bathala count-pay tumble');
  if (!Number.isSafeInteger(config.maximumTumbleRounds) || config.maximumTumbleRounds <= 0)
    issue('maximumTumbleRounds', 'must be a positive safety limit');
  const expected = [
    'L1',
    'L2',
    'L3',
    'L4',
    'L5',
    'H1',
    'H2',
    'H3',
    'H4',
    'SCATTER',
    'MULTIPLIER',
  ] as const;
  if (JSON.stringify(config.symbols) !== JSON.stringify(expected))
    issue('symbols', 'must contain the nine regular and two special symbols, without WILD');
  const symbolSet = new Set<BathalaSymbolId>(config.symbols);
  for (const [name, weights] of [
    ['baseSymbolWeights', config.baseSymbolWeights],
    ['freegameSymbolWeights', config.freegameSymbolWeights],
  ] as const) {
    if (weights.length !== symbolSet.size) issue(name, 'must define every symbol exactly once');
    const seen = new Set<string>();
    for (const entry of weights) {
      if (!symbolSet.has(entry.symbol)) issue(name, `unknown symbol ${entry.symbol}`);
      if (seen.has(entry.symbol)) issue(name, `duplicate symbol ${entry.symbol}`);
      if (!Number.isFinite(entry.weight) || entry.weight <= 0)
        issue(name, `${entry.symbol} weight must be positive`);
      seen.add(entry.symbol);
    }
  }
  for (const symbol of config.regularSymbols) {
    for (let count = 8; count <= 30; count += 1) {
      const matches = config.paytable.filter(
        (award) => award.symbol === symbol && count >= award.minCount && count <= award.maxCount,
      );
      if (matches.length !== 1)
        issue('paytable', `${symbol} count ${count} must have exactly one award`);
    }
  }
  const requiredMultipliers = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500];
  if (
    JSON.stringify(config.multiplierValues.map(({ value }) => value)) !==
    JSON.stringify(requiredMultipliers)
  )
    issue('multiplierValues', 'must contain the required 2 through 500 values in order');
  if (config.bathala.awardsDirectPayout !== false)
    issue('bathala.awardsDirectPayout', 'must be false');
  if (config.bathala.eligibleSymbols.some((symbol) => !config.lowSymbols.includes(symbol)))
    issue('bathala.eligibleSymbols', 'may contain only L1-L5');
  if (config.scatter.evaluationTiming !== 'final_board')
    issue('scatter.evaluationTiming', 'must explicitly resolve on final board');
  for (const [count, payout] of [
    ['4', 3],
    ['5', 5],
    ['6', 100],
  ] as const)
    if (config.scatter.payouts[count] !== payout)
      issue(`scatter.payouts.${count}`, `must equal ${payout}`);
  if (
    config.scatter.baseGameTrigger.minimumScatters !== 4 ||
    config.scatter.baseGameTrigger.freeGamesAwarded !== 15
  )
    issue('scatter.baseGameTrigger', 'must award 15 Free Games for 4+ Scatters');
  if (
    config.scatter.freeGameRetrigger.minimumScatters !== 3 ||
    config.scatter.freeGameRetrigger.additionalFreeGames !== 5
  )
    issue('scatter.freeGameRetrigger', 'must add 5 Free Games for 3+ Scatters');
  return issues;
}
