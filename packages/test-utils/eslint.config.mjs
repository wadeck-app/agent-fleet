import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { baseIgnores, baseRules } from '../../eslint.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// test-utils is a special package - allow any for flexibility in test helpers
const testUtilsRules = {
	...baseRules,
	'@typescript-eslint/no-explicit-any': 'off',
};

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
		rules: testUtilsRules,
	},
	prettierConfig
);
