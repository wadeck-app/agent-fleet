import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Ignore patterns
	{
		ignores: [
			'dist/**',
			'dist-types/**',
			'node_modules/**',
			'coverage/**',
			'*.config',
			'jest.config',
			'**/*',
			'**/*.d.ts',
		],
	},

	// Base ESLint recommended rules
	eslint.configs.recommended,

	// TypeScript ESLint recommended rules
	...tseslint.configs.recommended,

	// Custom rules for source files
	{
		root: true,
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
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
				},
			],
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

	// Rules for test files
	{
		files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off', // Autoriser 'any' dans les tests
		},
	},

	// Prettier integration - disable conflicting ESLint rules
	prettierConfig
);
