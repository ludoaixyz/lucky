import { describe, expect, it } from 'vitest';
import { normalizeDeploymentBase, resolveDeploymentBases } from '../lib/deployment-base.js';

describe('deployment base paths', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['///', '/'],
    ['lucky', '/lucky/'],
    ['/lucky', '/lucky/'],
    ['lucky/', '/lucky/'],
    ['/lucky/', '/lucky/'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeDeploymentBase(input)).toBe(expected);
  });

  it('derives the dashboard and report paths from the game path', () => {
    expect(resolveDeploymentBases('/')).toEqual({
      game: '/',
      dashboard: '/dashboard/',
      report: '/report/',
    });
    expect(resolveDeploymentBases('/lucky/')).toEqual({
      game: '/lucky/',
      dashboard: '/lucky/dashboard/',
      report: '/lucky/report/',
    });
  });

  it.each(['https://example.com/lucky/', '/lucky?preview=1', '/lucky#top', '/lucky//test'])(
    'rejects malformed base %s',
    (input) => {
      expect(() => normalizeDeploymentBase(input)).toThrow('Invalid deployment base');
    },
  );
});
