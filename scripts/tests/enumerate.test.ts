import { describe, expect, it, vi } from 'vitest';
import { enumerateExact } from '@lucky/math-engine';
import type { ExactMathReport, RuntimeGameConfig } from '@lucky/shared-types';
import { runEnumerationCli } from '../enumerate.js';
import { loadSourceConfig } from '../lib/source-loader.js';

describe('exact-enumeration CLI orchestration', () => {
  it('keeps the canonical engine guard for direct cascade enumeration', async () => {
    const { config } = await loadSourceConfig('lucky888-bathala-aligned-v3');
    expect(config.cascades?.enabled).toBe(true);
    expect(() => enumerateExact(config, 'cascade-source')).toThrow(
      'Exact enumeration currently supports non-cascading profiles only',
    );
  });

  it('reports cascade profiles as not applicable without enumerating or writing reports', async () => {
    const source = await loadSourceConfig('lucky888-bathala-aligned-v3');
    const enumerate = vi.fn(() => {
      throw new Error('enumerateExact must not be called for cascades');
    });
    const runLegacy = vi.fn(() => Promise.resolve());
    const log = vi.fn<(message: string) => void>();

    await expect(
      runEnumerationCli({
        loadSource: () => Promise.resolve(source),
        validate: () => [],
        enumerate,
        runLegacy,
        log,
      }),
    ).resolves.toBe('not-applicable');

    expect(enumerate).not.toHaveBeenCalled();
    expect(runLegacy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain('Exact enumeration: SKIPPED');
    expect(log.mock.calls[0]?.[0]).toContain('Status: NOT APPLICABLE');
  });

  it('continues exact enumeration for a legacy profile with cascades omitted', async () => {
    const source = await loadSourceConfig('lucky888-bathala-aligned-v3');
    const legacyConfig = { ...source.config };
    delete legacyConfig.cascades;
    const legacySource = { ...source, config: legacyConfig };
    const exact = { probabilityReconciliation: 1 } as ExactMathReport;
    const enumerate = vi.fn(() => exact);
    const runLegacy = vi.fn(() => Promise.resolve());

    await expect(
      runEnumerationCli({
        loadSource: () => Promise.resolve(legacySource),
        validate: () => [],
        enumerate,
        runLegacy,
        log: vi.fn(),
      }),
    ).resolves.toBe('completed');

    expect(enumerate).toHaveBeenCalledOnce();
    expect(enumerate).toHaveBeenCalledWith(legacySource.config, source.sourceHash);
    expect(runLegacy).toHaveBeenCalledOnce();
    expect(runLegacy).toHaveBeenCalledWith(legacySource.config, source.sourceHash, exact);
  });

  it('continues exact enumeration when cascades are explicitly disabled', async () => {
    const source = await loadSourceConfig('lucky888-bathala-aligned-v3');
    const disabledConfig: RuntimeGameConfig = {
      ...source.config,
      cascades: { enabled: false },
    };
    const exact = { probabilityReconciliation: 1 } as ExactMathReport;
    const enumerate = vi.fn(() => exact);
    const runLegacy = vi.fn(() => Promise.resolve());

    await expect(
      runEnumerationCli({
        loadSource: () => Promise.resolve({ ...source, config: disabledConfig }),
        validate: () => [],
        enumerate,
        runLegacy,
        log: vi.fn(),
      }),
    ).resolves.toBe('completed');
    expect(enumerate).toHaveBeenCalledOnce();
    expect(runLegacy).toHaveBeenCalledOnce();
  });
});
