export type TailFrequencyDelta =
  | { readonly kind: 'rarer'; readonly factor: number }
  | { readonly kind: 'moreFrequent'; readonly factor: number }
  | { readonly kind: 'unchanged'; readonly factor: 1 }
  | { readonly kind: 'notComparable' };

const comparable = (baseline: number | null, comparison: number | null): boolean =>
  baseline !== null &&
  comparison !== null &&
  Number.isFinite(baseline) &&
  Number.isFinite(comparison);

export function percentagePointDelta(
  baseline: number | null,
  comparison: number | null,
): number | null {
  return comparable(baseline, comparison) ? (comparison! - baseline!) * 100 : null;
}

export function relativePercentageDelta(
  baseline: number | null,
  comparison: number | null,
): number | null {
  if (
    baseline === null ||
    comparison === null ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(comparison) ||
    baseline === 0
  )
    return null;
  return ((comparison - baseline) / Math.abs(baseline)) * 100;
}

export function tailFrequencyDelta(
  baseline: number | null,
  comparison: number | null,
): TailFrequencyDelta {
  if (!comparable(baseline, comparison) || baseline! <= 0 || comparison! <= 0)
    return { kind: 'notComparable' };
  const ratio = comparison! / baseline!;
  if (Math.abs(ratio - 1) < 1e-12) return { kind: 'unchanged', factor: 1 };
  return ratio < 1 ? { kind: 'rarer', factor: 1 / ratio } : { kind: 'moreFrequent', factor: ratio };
}
