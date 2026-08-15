import { validateConfig, type ValidationIssue } from '@lucky/math-engine';
import type { ActiveGameConfig } from '@lucky/shared-types';

export function cloneMathConfig(config: ActiveGameConfig): ActiveGameConfig {
  return structuredClone(config);
}

export function serializeMathConfig(config: ActiveGameConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function parseMathConfig(text: string): ActiveGameConfig {
  const parsed = JSON.parse(text) as ActiveGameConfig;
  const issues = validateConfig(parsed);
  if (issues.length) throw new Error(formatValidationIssues(issues));
  return cloneMathConfig(parsed);
}

export function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ path, message }) => `${path}: ${message}`).join('\n');
}

export class MathConfigManager {
  private activeValue: ActiveGameConfig;
  private draftValue: ActiveGameConfig;

  constructor(config: ActiveGameConfig) {
    this.activeValue = cloneMathConfig(config);
    this.draftValue = cloneMathConfig(config);
  }

  active(): ActiveGameConfig {
    return cloneMathConfig(this.activeValue);
  }

  draft(): ActiveGameConfig {
    return cloneMathConfig(this.draftValue);
  }

  replaceDraft(config: ActiveGameConfig): void {
    this.draftValue = cloneMathConfig(config);
  }

  discard(): void {
    this.draftValue = cloneMathConfig(this.activeValue);
  }

  isDirty(): boolean {
    return JSON.stringify(this.activeValue) !== JSON.stringify(this.draftValue);
  }

  validateDraft(): readonly ValidationIssue[] {
    return validateConfig(this.draftValue);
  }

  apply(): ActiveGameConfig {
    const issues = this.validateDraft();
    if (issues.length) throw new Error(formatValidationIssues(issues));
    this.activeValue = cloneMathConfig(this.draftValue);
    return this.active();
  }
}
