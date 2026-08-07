import type { DistributionBucket, ExactMathReport, RuntimeGameConfig } from '@lucky/shared-types';
import { resolveBonusAward, resolveRetriggerAward } from '../evaluation/bonus.js';
import { aggregateWins, countScatters, evaluatePaylines } from '../evaluation/evaluate.js';
import { buildVisibleWindow } from '../evaluation/reels.js';

interface OutcomeClass {
  readonly probability: number;
  readonly lineWin: number;
  readonly scatterCount: number;
  readonly retriggerAward: number;
}

interface FeatureMoments {
  readonly mean: number;
  readonly secondMoment: number;
  readonly spins: number;
  readonly retriggers: number;
  readonly positiveProbability: number;
  readonly maximum: number;
}

const EMPTY_FEATURE: FeatureMoments = {
  mean: 0,
  secondMoment: 0,
  spins: 0,
  retriggers: 0,
  positiveProbability: 0,
  maximum: 0,
};

function enumerateOutcomeClasses(
  config: RuntimeGameConfig,
  strips: readonly (readonly string[])[],
): {
  outcomes: readonly OutcomeClass[];
  combinations: number;
  probability: number;
} {
  const combinations = strips.reduce((product, reel) => product * reel.length, 1);
  if (!Number.isSafeInteger(combinations) || combinations <= 0)
    throw new RangeError('Exact enumeration requires a positive safe-integer combination count');
  const classes = new Map<string, { count: number; lineWin: number; scatterCount: number }>();
  const stops = Array<number>(config.reelCount).fill(0);
  for (let combination = 0; combination < combinations; combination += 1) {
    const window = buildVisibleWindow(strips, stops, config.visibleRows);
    const lineWin = aggregateWins(evaluatePaylines(window, config));
    const scatterCount = countScatters(window, config.bonus.triggerSymbolId);
    const key = `${lineWin}|${scatterCount}`;
    const existing = classes.get(key);
    if (existing) existing.count += 1;
    else classes.set(key, { count: 1, lineWin, scatterCount });
    for (let reel = stops.length - 1; reel >= 0; reel -= 1) {
      const next = (stops[reel] ?? 0) + 1;
      if (next < (strips[reel]?.length ?? 0)) {
        stops[reel] = next;
        break;
      }
      stops[reel] = 0;
    }
  }
  const outcomes = [...classes.values()].map((entry) => ({
    probability: entry.count / combinations,
    lineWin: entry.lineWin,
    scatterCount: entry.scatterCount,
    retriggerAward: resolveRetriggerAward(config.bonus, entry.scatterCount),
  }));
  return {
    outcomes,
    combinations,
    probability: outcomes.reduce((sum, outcome) => sum + outcome.probability, 0),
  };
}

function featureCalculator(config: RuntimeGameConfig, outcomes: readonly OutcomeClass[]) {
  const featureClasses = new Map<string, OutcomeClass>();
  for (const outcome of outcomes) {
    const key = `${outcome.lineWin}|${outcome.retriggerAward}`;
    const existing = featureClasses.get(key);
    featureClasses.set(key, {
      ...outcome,
      probability: (existing?.probability ?? 0) + outcome.probability,
    });
  }
  const featureOutcomes = [...featureClasses.values()];
  const uncappedMemo = new Map<string, FeatureMoments>();
  const cdfMemo = new Map<string, number>();
  const multiplier = config.bonus.freeSpinMultiplier;

  const transition = (
    remaining: number,
    played: number,
    retriggers: number,
    requested: number,
  ): readonly [number, number, number, number] => {
    const playedAfter = played + 1;
    let allowed = 0;
    if (requested > 0 && retriggers < config.bonus.maximumRetriggers) {
      const capacity = config.bonus.maximumFeatureSpins - (playedAfter + remaining - 1);
      allowed = Math.min(requested, Math.max(0, capacity));
    }
    return [remaining - 1 + allowed, playedAfter, retriggers + (allowed > 0 ? 1 : 0), allowed];
  };

  const uncapped = (remaining: number, played: number, retriggers: number): FeatureMoments => {
    if (remaining <= 0 || played >= config.bonus.maximumFeatureSpins) return EMPTY_FEATURE;
    const key = `${remaining}|${played}|${retriggers}`;
    const cached = uncappedMemo.get(key);
    if (cached) return cached;
    let mean = 0;
    let secondMoment = 0;
    let spins = 0;
    let expectedRetriggers = 0;
    let zeroProbability = 0;
    let maximum = 0;
    for (const outcome of featureOutcomes) {
      const immediate = outcome.lineWin * multiplier;
      const [nextRemaining, nextPlayed, nextRetriggers, allowed] = transition(
        remaining,
        played,
        retriggers,
        outcome.retriggerAward,
      );
      const continuation = uncapped(nextRemaining, nextPlayed, nextRetriggers);
      const totalMean = immediate + continuation.mean;
      mean += outcome.probability * totalMean;
      secondMoment +=
        outcome.probability *
        (immediate ** 2 + 2 * immediate * continuation.mean + continuation.secondMoment);
      spins += outcome.probability * (1 + continuation.spins);
      expectedRetriggers += outcome.probability * ((allowed > 0 ? 1 : 0) + continuation.retriggers);
      if (immediate === 0)
        zeroProbability += outcome.probability * (1 - continuation.positiveProbability);
      maximum = Math.max(maximum, immediate + continuation.maximum);
    }
    const result = {
      mean,
      secondMoment,
      spins,
      retriggers: expectedRetriggers,
      positiveProbability: 1 - zeroProbability,
      maximum,
    };
    uncappedMemo.set(key, result);
    return result;
  };

  const cdf = (
    remaining: number,
    played: number,
    retriggers: number,
    maximumWin: number,
  ): number => {
    if (maximumWin < 0) return 0;
    if (remaining <= 0 || played >= config.bonus.maximumFeatureSpins) return 1;
    const key = `${remaining}|${played}|${retriggers}|${maximumWin}`;
    const cached = cdfMemo.get(key);
    if (cached !== undefined) return cached;
    let probability = 0;
    for (const outcome of featureOutcomes) {
      const immediate = outcome.lineWin * multiplier;
      const [nextRemaining, nextPlayed, nextRetriggers] = transition(
        remaining,
        played,
        retriggers,
        outcome.retriggerAward,
      );
      probability +=
        outcome.probability *
        cdf(nextRemaining, nextPlayed, nextRetriggers, maximumWin - immediate);
    }
    cdfMemo.set(key, probability);
    return probability;
  };
  return { uncapped, cdf };
}

export function enumerateExact(config: RuntimeGameConfig, sourceHash: string): ExactMathReport {
  if (config.cascades?.enabled === true) {
    throw new Error(
      'Exact enumeration currently supports non-cascading profiles only. Use Monte Carlo simulation for cascade-enabled profiles.',
    );
  }
  const { outcomes, combinations, probability } = enumerateOutcomeClasses(
    config,
    config.reelStrips,
  );
  const { outcomes: freeSpinOutcomes } = enumerateOutcomeClasses(config, config.freeSpinReelStrips);
  const feature = featureCalculator(config, freeSpinOutcomes);
  const bet = config.totalBetCredits;
  let baseMean = 0;
  let featureMean = 0;
  let uncappedTotalMean = 0;
  let totalSecondMoment = 0;
  let triggerFrequency = 0;
  let expectedInitialSpins = 0;
  let expectedFeatureSpins = 0;
  let expectedRetriggers = 0;
  let baseHitFrequency = 0;
  let inclusiveHitFrequency = 0;
  let maximumBase = 0;
  let maximumUncapped = 0;
  let maximumCredited = 0;
  const triggerFrequencyByScatterCount: Record<string, number> = {};
  const cdfThresholds = [0, bet - 1, 5 * bet - 1, 20 * bet - 1];
  const cdfs = Array<number>(cdfThresholds.length).fill(0);

  for (const outcome of outcomes) {
    const initialAward = resolveBonusAward(config.bonus, outcome.scatterCount);
    const initialSpins = Math.min(initialAward, config.bonus.maximumFeatureSpins);
    const uncappedFeature = initialSpins > 0 ? feature.uncapped(initialSpins, 0, 0) : EMPTY_FEATURE;
    baseMean += outcome.probability * outcome.lineWin;
    featureMean += outcome.probability * uncappedFeature.mean;
    uncappedTotalMean += outcome.probability * (outcome.lineWin + uncappedFeature.mean);
    totalSecondMoment +=
      outcome.probability *
      (outcome.lineWin ** 2 +
        2 * outcome.lineWin * uncappedFeature.mean +
        uncappedFeature.secondMoment);
    if (outcome.lineWin > 0) baseHitFrequency += outcome.probability;
    inclusiveHitFrequency +=
      outcome.probability * (outcome.lineWin > 0 ? 1 : uncappedFeature.positiveProbability);
    maximumBase = Math.max(maximumBase, outcome.lineWin);
    maximumUncapped = Math.max(maximumUncapped, outcome.lineWin + uncappedFeature.maximum);
    maximumCredited = Math.max(
      maximumCredited,
      Math.min(config.maximumWinCredits, outcome.lineWin + uncappedFeature.maximum),
    );
    if (initialSpins > 0) {
      triggerFrequency += outcome.probability;
      expectedInitialSpins += outcome.probability * initialSpins;
      expectedFeatureSpins += outcome.probability * uncappedFeature.spins;
      expectedRetriggers += outcome.probability * uncappedFeature.retriggers;
      const scatterKey = String(outcome.scatterCount);
      triggerFrequencyByScatterCount[scatterKey] =
        (triggerFrequencyByScatterCount[scatterKey] ?? 0) + outcome.probability;
    }
    cdfThresholds.forEach((threshold, index) => {
      const conditional =
        initialSpins > 0
          ? feature.cdf(initialSpins, 0, 0, threshold - outcome.lineWin)
          : outcome.lineWin <= threshold
            ? 1
            : 0;
      cdfs[index] = (cdfs[index] ?? 0) + outcome.probability * conditional;
    });
  }

  const bucketProbabilities = [
    cdfs[0] ?? 0,
    (cdfs[1] ?? 0) - (cdfs[0] ?? 0),
    (cdfs[2] ?? 0) - (cdfs[1] ?? 0),
    (cdfs[3] ?? 0) - (cdfs[2] ?? 0),
    1 - (cdfs[3] ?? 0),
  ];
  const definitions = [
    { label: '0x', minimumMultiple: 0, maximumMultiple: 0 },
    { label: '(0,1)x', minimumMultiple: Number.EPSILON, maximumMultiple: 1 },
    { label: '[1,5)x', minimumMultiple: 1, maximumMultiple: 5 },
    { label: '[5,20)x', minimumMultiple: 5, maximumMultiple: 20 },
    { label: '20x+', minimumMultiple: 20, maximumMultiple: null },
  ] as const;
  const payoutDistribution: DistributionBucket[] = definitions.map((definition, index) => ({
    ...definition,
    probability: bucketProbabilities[index] ?? 0,
    count: (bucketProbabilities[index] ?? 0) * combinations,
  }));
  const uncappedTotalRtp = uncappedTotalMean / bet;
  const variance = totalSecondMoment / bet ** 2 - uncappedTotalRtp ** 2;
  return {
    schemaVersion: '1.2.0',
    methodology: 'exact-uncapped',
    gameVersion: config.gameVersion,
    configurationId: config.configurationId,
    generatedAt: new Date().toISOString(),
    sourceHash,
    totalPaidSpinCombinations: combinations,
    probabilityReconciliation: probability,
    uncappedBaseLineRtp: baseMean / bet,
    uncappedBaseScatterRtp: 0,
    uncappedFeatureRtp: featureMean / bet,
    uncappedTotalRtp,
    triggerFrequency,
    triggerFrequencyByScatterCount,
    expectedInitiallyAwardedFreeSpins: expectedInitialSpins,
    expectedTotalFreeSpinsPerPaidSpin: expectedFeatureSpins,
    expectedTotalFreeSpinsPerTrigger:
      triggerFrequency === 0 ? 0 : expectedFeatureSpins / triggerFrequency,
    expectedRetriggerCountPerTrigger:
      triggerFrequency === 0 ? 0 : expectedRetriggers / triggerFrequency,
    baseHitFrequency,
    featureInclusiveHitFrequency: inclusiveHitFrequency,
    variance: Math.max(0, variance),
    standardDeviation: Math.sqrt(Math.max(0, variance)),
    payoutDistribution,
    maximumReachableBaseWinCredits: maximumBase,
    maximumReachableUncappedWinCredits: maximumUncapped,
    maximumReachableCreditedWinCredits: maximumCredited,
    maximumWinCapCredits: config.maximumWinCredits,
    maximumWinCapReducesRtp: maximumUncapped > config.maximumWinCredits,
  };
}
