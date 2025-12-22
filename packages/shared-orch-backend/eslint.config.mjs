import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Ignore patterns
	{
		ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js', 'jest.config.js', '**/*.js', '**/*.d.ts'],
	},

	// Base ESLint recommended rules
	eslint.configs.recommended,

	// TypeScript ESLint recommended rules
	...tseslint.configs.recommended,

	// Custom rules for source files
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
			},
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			// @formatter:off
			// Forbid barrel exports with export * (architectural requirement)
			// See: .claude/agents/backend-review.md:33
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message:
						'export * is forbidden. Use explicit named exports instead. See .claude/agents/backend-review.md:33',
				},
			],
			// @formatter:on
		},
	},

	// Prettier integration - disable conflicting ESLint rules
	prettierConfig
);
