import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['lib/**', 'node_modules/**', 'src/data/snapshot.ts', 'coverage/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // The adapter is the only place allowed to touch upstream packages; the
    // rule below is the machine-checked half of the Stage 5 "adapter 层解耦"
    // constraint (see scripts/check-adapter-isolation.mjs for the file scan).
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/adapter/**', 'src/client/adapter/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@deepseek-ai/*'],
              message: 'Upstream @deepseek-ai/* imports are only allowed under src/adapter/ or src/client/adapter/.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } }
  }
)
