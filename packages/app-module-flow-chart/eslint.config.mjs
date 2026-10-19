import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { baseIgnores, baseRules, testFileRules } from '../../eslint.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
	{ ignores: baseIgnores },
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				tsconfigRootDir: __dirname,
			},
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
		rules: baseRules,
	},
	{
		files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts'],
		rules: testFileRules,
	},
	prettierConfig
);
