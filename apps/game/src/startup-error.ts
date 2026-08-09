export function startupErrorText(
  error: unknown,
  development: boolean,
  productionFallback: string,
): string {
  if (!development) return productionFallback;
  const detail = error instanceof Error ? error.message : String(error);
  return `Unable to start: ${detail}`;
}
