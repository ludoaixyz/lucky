import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'math/generated/**', 'math/reports/**'] },
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
