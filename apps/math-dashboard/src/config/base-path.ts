export function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/gu, '')}/`;
}

export function resolveDashboardBase(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment.VITE_BASE_PATH) return normalizeBasePath(environment.VITE_BASE_PATH);
  return environment.GITHUB_ACTIONS ? '/lucky/math-dashboard/' : '/';
}
