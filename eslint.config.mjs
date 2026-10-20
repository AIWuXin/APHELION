// ESLint flat config.
//
// Beyond correctness rules this enforces the dependency direction of the
// architecture: `web/src/render` and `web/src/ui` may not import `app` or `net`,
// so the presentation layers stay replaceable and the single direction of data
// flow (input → Command → sim → Snapshot → render/HUD) cannot be short-circuited.
//
// Also bans `Math.random`: randomness must come from the simulation RNG streams.

import tseslint from 'typescript-eslint';

const LAYER_RULES = [
  'error',
  {
    patterns: [
      {
        group: ['**/app/*'],
        message:
          'render/ and ui/ may not import the app layer: dependencies point one way only.',
      },
    ],
  },
];

const PRESENTATION_RULES = [
  'error',
  {
    patterns: [
      {
        group: ['**/app/*', '**/net/transport*', '**/net/wasm-transport*'],
        message:
          'The presentation layers receive a Frame/HudView; they must not reach into app/net.',
      },
    ],
  },
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'target/**', 'web/public/**', 'web/tests/fixtures/**'],
  },
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['web/src/**/*.ts', 'web/tests/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
  })),
  {
    files: ['web/src/**/*.ts', 'web/tests/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-restricted-imports': LAYER_RULES,
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random is forbidden: randomness must come from the simulation RNG.',
        },
      ],
    },
  },
  {
    // The presentation layers get a stricter rule: no reaching into net either.
    files: ['web/src/render/**/*.ts', 'web/src/ui/**/*.ts'],
    rules: { 'no-restricted-imports': PRESENTATION_RULES },
  },
  {
    // Composition roots may wire everything together.
    files: ['web/src/main.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    rules: { 'no-restricted-imports': 'off' },
  },
);
