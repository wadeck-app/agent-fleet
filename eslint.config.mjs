import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ═══════════════════════════════════════════════════════════════════
// DEPENDENCY MATRIX - Defines allowed imports between packages
// ═══════════════════════════════════════════════════════════════════
const dependencyMatrix = {
	cli: ['shared-common', 'orchestrator', 'worker', 'flow-engine'],
	'flow-engine': ['shared-common', 'shared-orch-worker', 'test-utils'],
	orchestrator: ['shared-orch-worker', 'shared-orch-backend', 'shared-common', 'flow-engine', 'test-utils'],
	'shared-common': ['shared-orch-worker'],
	'shared-frontend-backend': ['shared-common'],
	'shared-orch-backend': ['shared-common'],
	'shared-orch-worker': [],
	'test-utils': ['shared-common'],
	'web-backend': ['shared-frontend-backend', 'shared-common', 'flow-engine', 'test-utils', 'orchestrator'],
	'web-frontend': ['shared-frontend-backend'],
	worker: ['shared-orch-worker', 'shared-common', 'flow-engine', 'test-utils'],
};

function generateImportRestrictions() {
	return Object.entries(dependencyMatrix).map(([pkg, allowed]) => ({
		target: `./packages/${pkg}/src`,
		from: './packages',
		except: allowed.map(dep => `${dep}/src`),
	}));
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTED CONFIGURATIONS (for package-level configs to import)
// ═══════════════════════════════════════════════════════════════════

/**
 * Base ignore patterns for all packages
 */
export const baseIgnores = [
	'**/dist/**',
	'**/dist-types/**',
	'**/node_modules/**',
	'**/coverage/**',
	'**/*.d.ts',
	'**/*.config.mjs',
	'**/*.config.ts',
	'**/*.config.js',
];

/**
 * Base rules shared by all TypeScript packages
 */
export const baseRules = {
	// Enforce type-only imports for type annotations (auto-fixable)
	'@typescript-eslint/consistent-type-imports': [
		'error',
		{
			prefer: 'type-imports',
			fixStyle: 'separate-type-imports',
			disallowTypeAnnotations: false,
		},
	],
	'@typescript-eslint/no-explicit-any': 'warn',
	'@typescript-eslint/explicit-function-return-type': 'off',
	'@typescript-eslint/no-unused-vars': [
		'warn', // Downgrade to warning for now - can be fixed incrementally
		{
			argsIgnorePattern: '^_',
			varsIgnorePattern: '^_',
			caughtErrorsIgnorePattern: '^_',
			destructuredArrayIgnorePattern: '^_',
		},
	],
	// Allow Function type for callbacks (common pattern in this codebase)
	'@typescript-eslint/no-unsafe-function-type': 'off',
	// Allow empty interfaces for extension points
	'@typescript-eslint/no-empty-object-type': 'off',
	// Allow require for dynamic imports
	'@typescript-eslint/no-require-imports': 'off',
	// Allow this aliasing (useful in some callback patterns)
	'@typescript-eslint/no-this-alias': 'off',
	// Allow case declarations without braces (common pattern)
	'no-case-declarations': 'off',
	// @formatter:off
	// Forbid barrel exports with export * (architectural requirement)
	'no-restricted-syntax': [
		'error',
		{
			selector: 'ExportAllDeclaration',
			message: 'export * is forbidden. Use explicit named exports instead.',
		},
	],
	// @formatter:on
};

/**
 * Backend-specific rules (web-backend, orchestrator, worker, etc.)
 */
export const backendRules = {
	...baseRules,
	'no-console': 'warn',
	// FIXME: Restore no-restricted-imports after adjusting import paths
	// 'no-restricted-imports': [...]
};

/**
 * Rules for test files - more permissive
 */
export const testFileRules = {
	'@typescript-eslint/no-explicit-any': 'off',
	'@typescript-eslint/no-unused-vars': 'off', // Tests often have unused vars for setup
	'no-console': 'off',
};

/**
 * CLI-specific rules (console is allowed)
 */
export const cliRules = {
	...baseRules,
	'no-console': 'off',
};

/**
 * E2E test rules - most permissive (barrel exports allowed)
 */
export const e2eRules = {
	'@typescript-eslint/no-explicit-any': 'off',
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
	// No barrel export restriction for e2e tests
};

// ═══════════════════════════════════════════════════════════════════
// ROOT CONFIG (for running eslint from monorepo root)
// ═══════════════════════════════════════════════════════════════════
export default [
	// Global ignores
	{
		ignores: [
			...baseIgnores,
			'**/e2e-web/**', // e2e-web has its own relaxed config
			'**/web-frontend/**', // web-frontend has React-specific config
			'**/scripts/**',
			'**/bin/**',
			'**/.claude/**', // Ignore Claude documentation examples
			'**/.agent-fleet/**', // Ignore agent-fleet configuration
			'**/docs/**', // Ignore documentation
			'**/build.mjs', // Ignore build scripts
		],
	},

	// Base ESLint recommended rules
	eslint.configs.recommended,

	// TypeScript ESLint recommended rules
	...tseslint.configs.recommended,

	// Backend packages configuration
	{
		files: ['packages/*/src/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				tsconfigRootDir: process.cwd(),
			},
			globals: {
				...globals.node,
			},
		},
		plugins: {
			import: importPlugin,
		},
		settings: {
			'import/resolver': {
				typescript: {
					project: './tsconfig.base.json',
				},
			},
		},
		rules: {
			...baseRules,
			// Note: import/no-restricted-paths is disabled as it conflicts with relative imports
			// Package dependencies are enforced by package.json and TypeScript resolution
		},
	},

	// CLI package - allow console
	{
		files: ['packages/cli/src/**/*.ts'],
		rules: {
			'no-console': 'off',
		},
	},

	// Test files - relaxed rules
	{
		files: ['**/*.test.ts', '**/*.spec.ts', '**/__mocks__/**/*.ts'],
		rules: testFileRules,
	},

	// Prettier integration - disable conflicting ESLint rules
	prettierConfig,
];
