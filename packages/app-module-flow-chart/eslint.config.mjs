import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { baseIgnores, baseRules, testFileRules, typeAwareConfig } from '../../eslint.config.mjs';

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
		plugins: { 'react-hooks': reactHooksPlugin },
		rules: {
			...baseRules,
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'error',
		},
	},
	{
		files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts'],
		rules: testFileRules,
	},
	typeAwareConfig(__dirname),
	prettierConfig
);
