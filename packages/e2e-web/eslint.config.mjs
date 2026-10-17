import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { baseIgnores, e2eRules } from '../../eslint.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
	{
		ignores: [
			...baseIgnores,
			'**/playwright-report/**',
			'**/test-results/**',
			'**/_results/**',
			// Generated, gitignored output (temp/ in .gitignore): built Storybook bundle, not source
			'temp/**',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				tsconfigRootDir: __dirname,
			},
			globals: {
				...globals.node,
			},
		},
		rules: e2eRules,
	},
	{
		// Playwright fixtures that need no other fixture are written `async ({}, use)`: Playwright parses the
		// first parameter's source and throws unless it is an object destructuring pattern, so `_fixtures` or
		// omitting it is not possible. Only empty patterns used as function parameters are allowed, and only here.
		files: ['playwright-hooks/hooks-*.ts'],
		rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] },
	},
	{
		// Plain CommonJS Node scripts. tsconfigRootDir must be explicit: without it the TypeScript
		// parser fails on these files because two tsconfig roots (repo root and this package) are candidates.
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'commonjs',
			parserOptions: { tsconfigRootDir: __dirname },
			globals: { ...globals.node },
		},
		// CommonJS is the module system of these scripts (run directly by node, no transpile step)
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
	prettierConfig
);
