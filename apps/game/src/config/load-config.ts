import { validateConfig } from '@lucky/math-engine';
import type { ActiveGameConfig } from '@lucky/shared-types';

export async function loadConfig(): Promise<ActiveGameConfig> {
  const url = `${import.meta.env.BASE_URL}data/runtime-config.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  const payload = (await response.json()) as { config?: unknown };
  const config = payload.config as ActiveGameConfig;
  const issues = validateConfig(config);
  if (issues.length > 0)
    throw new Error(`Invalid Bathala math config: ${issues[0]?.path} ${issues[0]?.message}`);
  return config;
}
