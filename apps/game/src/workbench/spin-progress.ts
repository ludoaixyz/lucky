export function formatSpinProgress(
  sessionSpinNumber: number,
  currentAutoSpin: number,
  totalAutoSpins: number,
): string {
  return totalAutoSpins > 1
    ? `Spin ${currentAutoSpin} of ${totalAutoSpins} · Spin #${sessionSpinNumber} in progress..`
    : `Spin #${sessionSpinNumber} in progress..`;
}
