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
		ignores: [...baseIgnores, '**/playwright-report/**', '**/test-results/**', '**/_results/**'],
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
	prettierConfig
);
