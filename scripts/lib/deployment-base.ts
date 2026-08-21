export interface DeploymentBases {
  readonly game: string;
  readonly dashboard: string;
  readonly report: string;
}

export function normalizeDeploymentBase(value: string | undefined): string {
  const candidate = (value ?? '/').trim();
  if (!candidate || /^\/+$/u.test(candidate)) return '/';

  if (/[\\\s?#]/u.test(candidate) || /^[a-z][a-z\d+.-]*:/iu.test(candidate)) {
    throw new Error(`Invalid deployment base: ${candidate}`);
  }

  const path = candidate.replace(/^\/+|\/+$/gu, '');
  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Invalid deployment base: ${candidate}`);
  }

  return `/${path}/`;
}

export function resolveDeploymentBases(value: string | undefined): DeploymentBases {
  const game = normalizeDeploymentBase(value);
  return { game, dashboard: `${game}dashboard/`, report: `${game}report/` };
}
