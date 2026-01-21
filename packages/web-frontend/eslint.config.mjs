import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tailwindcssPlugin from 'eslint-plugin-better-tailwindcss';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { baseIgnores, baseRules } from '../../eslint.config.mjs';
import errorHandlingRules from '../../scripts/eslint-rules/error-handling-rules.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Frontend-specific rules (extends baseRules)
const frontendRules = {
	...baseRules,
	// TypeScript rules
	'@typescript-eslint/no-unused-vars': [
		'error',
		{
			argsIgnorePattern: '^_',
			varsIgnorePattern: '^_',
			caughtErrorsIgnorePattern: '^_',
			destructuredArrayIgnorePattern: '^_',
		},
	],
	'@typescript-eslint/no-explicit-any': 'warn',

	// General JS rules
	'no-unused-vars': 'off',
	'no-undef': 'error',

	// React rules
	'react/react-in-jsx-scope': 'off',
	'react/prop-types': 'off',

	// React Hooks rules - CRITICAL for detecting useCallback issues
	'react-hooks/rules-of-hooks': 'error',
	'react-hooks/exhaustive-deps': 'error',

	// @formatter:off
	// Import rules - Restrict deep relative imports
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

	// Forbid barrel exports, hardcoded colors, inline SVG, native HTML elements
	'no-restricted-syntax': [
		'error',
		{
			selector: 'ExportAllDeclaration',
			message: 'export * is forbidden. Use explicit named exports instead.',
		},
		{
			selector: 'JSXElement[openingElement.name.name="svg"]',
			message:
				'Inline SVG elements are forbidden. Use lucide-react icons instead (e.g., import { IconName } from "lucide-react").',
		},
		{
			selector: 'JSXElement[openingElement.name.name="button"]',
			message: 'Native <button> is forbidden. Use <Button> from @/components/ui/Button instead.',
		},
		{
			selector: 'JSXElement[openingElement.name.name="input"]',
			message:
				'Native <input> is forbidden. Use <Input> from @/components/ui/Input instead (or Radix primitives for checkbox/radio).',
		},
		{
			selector: 'JSXElement[openingElement.name.name="textarea"]',
			message: 'Native <textarea> is forbidden. Use <Textarea> from @/components/ui/Textarea instead.',
		},
		{
			selector: 'JSXElement[openingElement.name.name="label"]',
			message: 'Native <label> is forbidden. Use <Label> from @/components/ui/Label instead.',
		},
		{
			selector:
				'JSXAttribute[name.name="className"] Literal[value=/bg-(blue|green|red|yellow|orange|purple|pink|indigo|teal|cyan|lime|emerald|sky|violet|fuchsia|rose)-[0-9]/]',
			message: 'Use theme colors (bg-primary, bg-secondary, bg-accent, bg-destructive, bg-muted) instead.',
		},
		{
			selector:
				'JSXAttribute[name.name="className"] Literal[value=/text-(blue|green|red|yellow|orange|purple|pink|indigo|teal|cyan|lime|emerald|sky|violet|fuchsia|rose)-[0-9]/]',
			message: 'Use theme colors (text-foreground, text-muted-foreground, text-primary, etc.) instead.',
		},
		{
			selector:
				'CallExpression[callee.name=/^use(Effect|LayoutEffect|Memo|Callback|AbortableEffect)$/] > ArrayExpression > Identifier[name=/^(params|options|config|settings|data|state)$/]',
			message:
				'Likely object "{{name}}" in hook dependencies. Extract primitive properties instead (e.g., {{name}}.page, {{name}}.id)',
		},
	],
	// @formatter:on

	// General rules
	'no-console': 'off',
	'no-debugger': 'warn',
};

export default tseslint.config(
	{
		ignores: [...baseIgnores, 'storybook-static/**', '.storybook/**', 'vite.config.ts'],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,

	// Tailwind CSS plugin config
	{
		plugins: {
			'better-tailwindcss': tailwindcssPlugin,
		},
		settings: {
			'better-tailwindcss': {
				entryPoint: 'src/index.css',
				printWidth: 120,
				config: './tailwind.config',
			},
		},
		rules: {
			...tailwindcssPlugin.configs.recommended.rules,
			'better-tailwindcss/no-unregistered-classes': [
				'error',
				{
					ignore: ['no-scrollbar', 'animate-typing-dot', 'animate-pulse-once'],
				},
			],
			'better-tailwindcss/enforce-consistent-line-wrapping': 'warn',
		},
	},

	// Main TypeScript/React config
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json',
				tsconfigRootDir: __dirname,
				ecmaFeatures: {
					jsx: true,
				},
			},
			globals: {
				...globals.browser,
				...globals.node,
				React: 'readonly',
				JSX: 'readonly',
				vi: 'readonly',
				describe: 'readonly',
				it: 'readonly',
				expect: 'readonly',
				afterEach: 'readonly',
				beforeEach: 'readonly',
				afterAll: 'readonly',
				beforeAll: 'readonly',
			},
		},
		plugins: {
			react: reactPlugin,
			'react-hooks': reactHooksPlugin,
			'error-handling': errorHandlingRules,
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
		rules: {
			...frontendRules,
			// Custom error handling rules
			'error-handling/require-get-error-message': 'error',
			'error-handling/require-user-feedback-on-error': 'warn',
			'error-handling/defensive-array-access': 'warn',
		},
	},

	// Low-level UI components - MUST use native HTML elements (they wrap them)
	{
		files: [
			'src/components/ui/Input.tsx',
			'src/components/ui/Button.tsx',
			'src/components/ui/Textarea.tsx',
			'src/components/ui/Label.tsx',
			'src/components/ui/Select.tsx',
			'src/components/ui/Table/TableRow.tsx',
			'src/components/ui/Table/TableHeader.tsx',
		],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
			],
		},
	},

	// Storybook files - relaxed rules
	{
		files: ['**/*.stories.tsx', '**/*.stories.ts'],
		rules: {
			'react-hooks/rules-of-hooks': 'off',
			'no-restricted-syntax': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},

	// Test files - relaxed rules
	{
		files: ['**/*.test.tsx', '**/*.test.ts'],
		languageOptions: {
			globals: {
				describe: 'readonly',
				it: 'readonly',
				expect: 'readonly',
				afterEach: 'readonly',
				beforeEach: 'readonly',
				afterAll: 'readonly',
				beforeAll: 'readonly',
			},
		},
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
			],
			'@typescript-eslint/no-explicit-any': 'off',
			'better-tailwindcss/no-unregistered-classes': 'off',
		},
	},

	// Radix UI wrapper components
	{
		files: ['src/components/ui/radix/*.tsx'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
			],
		},
	},

	prettierConfig
);
