import type { RuntimeGameConfig } from '@lucky/shared-types';
import { validateConfig } from '@lucky/math-engine';

interface RuntimeArtifact {
  readonly config: RuntimeGameConfig;
}

export async function loadConfig(): Promise<RuntimeGameConfig> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/runtime-config.json`);
  if (!response.ok) throw new Error(`Could not load math configuration (${response.status})`);
  const artifact = (await response.json()) as RuntimeArtifact;
  const issues = validateConfig(artifact.config, 'data/runtime-config.json');
  if (issues.length > 0) {
    const first = issues[0];
    throw new Error(
      `Invalid runtime configuration at ${first?.record ?? 'unknown'}:${first?.field ?? 'unknown'}`,
    );
  }
  return artifact.config;
}
