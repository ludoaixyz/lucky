import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'dist-pages/**',
      '**/coverage/**',
      'math/generated/**',
      'math/reports/**',
      'apps/game/src/diagnostics/**',
      'apps/game/src/game/**',
      'apps/game/src/i18n/**',
      'apps/game/src/ui/**',
      'apps/game/src/startup-error.ts',
      'apps/game/tests/branding.test.ts',
      'apps/game/tests/cascade-presentation.test.ts',
      'apps/game/tests/controller.test.ts',
      'apps/game/tests/diagnostics.test.ts',
      'apps/game/tests/i18n.test.ts',
      'apps/game/tests/load-config.test.ts',
      'apps/game/tests/presentation.test.ts',
      'apps/game/tests/production-integration.test.ts',
      'packages/math-engine/src/enumeration/**',
      'packages/math-engine/src/evaluation/**',
      'packages/math-engine/src/simulation/**',
      'packages/math-engine/src/validation/**',
      'packages/math-engine/tests/fixtures.ts',
      'packages/math-engine/tests/math-engine.test.ts',
      'scripts/analyze-cascades.ts',
      'scripts/balance.ts',
      'scripts/enumerate.ts',
      'scripts/hybrid-enumerate.ts',
      'scripts/inspect-math.ts',
      'scripts/report.ts',
      'scripts/lib/production-profile.ts',
      'scripts/lib/simulation-report.ts',
      'scripts/lib/structural-cache.ts',
      'scripts/tests/enumerate.test.ts',
      'scripts/tests/simulation-report.test.ts',
      'scripts/tests/source-runtime-reconciliation.test.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'packages/*/tests/*.ts',
            'packages/*/vitest.config.ts',
            'apps/*/tests/*.ts',
            'apps/*/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/game/tests/*.ts', 'apps/game/vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./apps/game/tsconfig.test.json'],
      },
    },
  },
  {
    files: ['apps/math-dashboard/tests/*.ts', 'apps/math-dashboard/vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./apps/math-dashboard/tsconfig.test.json'],
      },
    },
  },
  {
    files: ['packages/math-engine/tests/*.ts', 'packages/math-engine/vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./packages/math-engine/tsconfig.test.json'],
      },
    },
  },
  { files: ['*.js'], extends: [tseslint.configs.disableTypeChecked] },
);
