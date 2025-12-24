import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Ignore patterns
	{
		ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config', 'jest.config'],
	},

	// Base ESLint recommended rules
	eslint.configs.recommended,

	// TypeScript ESLint recommended rules
	...tseslint.configs.recommended,

	// Custom rules for source files (with type checking)
	{
		files: ['src/**/*.ts'],
		ignores: ['src/**/*.test.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				project: './tsconfig.json',
			},
		},
		plugins: {
			import: importPlugin,
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
			'no-console': 'warn',
			// @formatter:off
			// Restrict deep relative imports - allow ./ and ../ but not ../../ and beyond
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['../../*', '../../../*', '../../../../*', '../../../../../*'],
							message: 'Use @/* alias for imports outside parent directory',
						},
					],
				},
			],
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

	// Rules for test files (without type checking project)
	{
		files: ['src/**/*.test.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
			},
		},
		plugins: {
			import: importPlugin,
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off', // Autoriser 'any' dans les tests
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
			'no-console': 'off',
			// @formatter:off
			// Restrict deep relative imports - allow ./ and ../ but not ../../ and beyond
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['../../*', '../../../*', '../../../../*', '../../../../../*'],
							message: 'Use @/* alias for imports outside parent directory',
						},
					],
				},
			],
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
