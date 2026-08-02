// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
      // Runs inside the browser's AudioWorkletGlobalScope: no DOM/Node lib applies,
      // so it is linted by the browser at runtime rather than here.
      'apps/web/public/worklets/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build and utility scripts are plain ESM JavaScript run by Node, so the
    // Node globals have to be declared — TypeScript files get them from @types/node.
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // CLI entry points legitimately write to stdout.
    files: ['**/eval/**', '**/prisma/seed.ts', '**/scripts/**', 'apps/voice/src/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
