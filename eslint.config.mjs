import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(exec|prepare)$/] > TemplateLiteral:first-child',
          message:
            'Do not pass template literals to better-sqlite3 .exec()/.prepare(). Use prepared statements with bound parameters to prevent SQL injection.',
        },
      ],
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'data/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
    ],
  },
];

export default config;
