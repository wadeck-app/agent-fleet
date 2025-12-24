import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { backendRules, baseIgnores, testFileRules } from '../../eslint.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
	{ ignores: baseIgnores },
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
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
		rules: backendRules,
	},
	{
		files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
		rules: testFileRules,
	},
	prettierConfig
);
