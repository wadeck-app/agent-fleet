import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import tailwindcssPlugin from 'eslint-plugin-better-tailwindcss';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
	{
		ignores: ['dist/**', 'node_modules/**', 'storybook-static/**', '.storybook/**', 'vite.config.ts'],
	},
	js.configs.recommended,
	{
		plugins: {
			'better-tailwindcss': tailwindcssPlugin,
		},
		settings: {
			'better-tailwindcss': {
				entryPoint: 'src/index.css',
				printWidth: 120, // Align with Prettier config
				config: './tailwind.config', // Load custom utilities from Tailwind config
			},
		},
		rules: {
			...tailwindcssPlugin.configs.recommended.rules,
			// Allow custom animation classes defined in animations.css and registered in tailwind.config.js
			'better-tailwindcss/no-unregistered-classes': [
				'error',
				{
					ignore: ['no-scrollbar', 'animate-typing-dot', 'animate-pulse-once'],
				},
			],
		},
	},
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parser: tsParser,
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
				// Browser globals
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				fetch: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				queueMicrotask: 'readonly',
				alert: 'readonly',
				confirm: 'readonly',
				prompt: 'readonly',
				localStorage: 'readonly',
				sessionStorage: 'readonly',
				Storage: 'readonly',
				MediaQueryList: 'readonly',
				MediaQueryListEvent: 'readonly',
				// HTML/DOM types
				HTMLElement: 'readonly',
				HTMLDivElement: 'readonly',
				HTMLButtonElement: 'readonly',
				HTMLInputElement: 'readonly',
				HTMLTextAreaElement: 'readonly',
				HTMLFormElement: 'readonly',
				Element: 'readonly',
				Node: 'readonly',
				MouseEvent: 'readonly',
				KeyboardEvent: 'readonly',
				Event: 'readonly',
				// React (for JSX)
				React: 'readonly',
				JSX: 'readonly',
				// Node globals (for config files)
				global: 'readonly',
				process: 'readonly',
				// Test globals
				describe: 'readonly',
				it: 'readonly',
				test: 'readonly',
				expect: 'readonly',
				vi: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
			react: reactPlugin,
			'react-hooks': reactHooksPlugin,
			import: importPlugin,
		},
		rules: {
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
			'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
			'no-undef': 'error',

			// React rules
			'react/react-in-jsx-scope': 'off', // Not needed with React 17+
			'react/prop-types': 'off', // We use TypeScript

			// React Hooks rules - CRITICAL for detecting useCallback issues
			'react-hooks/rules-of-hooks': 'error', // Enforces rules of Hooks
			'react-hooks/exhaustive-deps': 'error', // Warns about missing dependencies
			// This rule will automatically warn when:
			// 1. A function is used in useEffect/useMemo/useCallback deps but not memoized
			// 2. Dependencies are missing from the deps array
			// 3. Dependencies should be removed from the deps array

			// @formatter:off
			// Import rules - Restrict deep relative imports
			// Allow ./ and ../ but not ../../ and beyond
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
			// See: .claude/agents/backend-review.md:33 (applies to frontend too)
			// Also forbid hardcoded Tailwind colors (Radix Nova compliance)
			// Also forbid inline SVG elements (use lucide-react icons instead)
			// Also forbid native HTML elements when shadcn components exist
			// Also detect objects in hook dependencies (params, options, config, etc.)
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
				{
					selector: 'JSXElement[openingElement.name.name="svg"]',
					message:
						'❌ Inline SVG elements are forbidden. Use lucide-react icons instead (e.g., import { IconName } from "lucide-react").',
				},
				{
					selector: 'JSXElement[openingElement.name.name="button"]',
					message:
						'❌ Native <button> is forbidden. Use <Button> from @/components/ui/Button instead. See .claude/docs/radix-nova-style-guide.md',
				},
				{
					selector: 'JSXElement[openingElement.name.name="input"]',
					message:
						'❌ Native <input> is forbidden. Use <Input> from @/components/ui/Input instead (or Radix primitives for checkbox/radio).',
				},
				{
					selector: 'JSXElement[openingElement.name.name="textarea"]',
					message: '❌ Native <textarea> is forbidden. Use <Textarea> from @/components/ui/Textarea instead.',
				},
				{
					selector: 'JSXElement[openingElement.name.name="label"]',
					message: '❌ Native <label> is forbidden. Use <Label> from @/components/ui/Label instead.',
				},
				{
					selector:
						'JSXAttribute[name.name="className"] Literal[value=/bg-(blue|green|red|yellow|orange|purple|pink|indigo|teal|cyan|lime|emerald|sky|violet|fuchsia|rose)-[0-9]/]',
					message:
						'❌ Radix Nova: Use theme colors (bg-primary, bg-secondary, bg-accent, bg-destructive, bg-muted) instead of hardcoded Tailwind colors. See .claude/docs/radix-nova-style-guide.md',
				},
				{
					selector:
						'JSXAttribute[name.name="className"] Literal[value=/text-(blue|green|red|yellow|orange|purple|pink|indigo|teal|cyan|lime|emerald|sky|violet|fuchsia|rose)-[0-9]/]',
					message:
						'❌ Radix Nova: Use theme colors (text-foreground, text-muted-foreground, text-primary, etc.) instead of hardcoded Tailwind colors.',
				},
				{
					selector:
						'CallExpression[callee.name=/^use(Effect|LayoutEffect|Memo|Callback|AbortableEffect)$/] > ArrayExpression > Identifier[name=/^(params|options|config|settings|data|state)$/]',
					message:
						'❌ Likely object "{{name}}" in hook dependencies. Extract primitive properties instead (e.g., {{name}}.page, {{name}}.id)',
				},
			],
			// @formatter:on

			// General rules
			'no-console': 'off', // Allow console in frontend for now
			'no-debugger': 'warn',
		},
		settings: {
			react: {
				version: 'detect',
			},
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
			'src/components/ui/Table/TableRow.tsx', // Has checkboxes for selection
			'src/components/ui/Table/TableHeader.tsx', // Has checkboxes for select all
		],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
				// Allow native elements in these wrapper components
			],
		},
	},
	// Storybook files - disable React Hooks rule for render functions
	// Also allow hardcoded colors and native elements in stories (they're examples, not production code)
	{
		files: ['**/*.stories.tsx', '**/*.stories.ts'],
		rules: {
			'react-hooks/rules-of-hooks': 'off', // Storybook render functions can use hooks
			'no-restricted-syntax': 'off', // Allow hardcoded colors and native elements in examples
			'@typescript-eslint/no-explicit-any': 'off', // Allow any in story args and examples
		},
	},
	// Test files - also allow hardcoded colors and native elements for test-specific styling
	{
		files: ['**/*.test.tsx', '**/*.test.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
				// Don't check for hardcoded colors or native elements in tests
			],
			'@typescript-eslint/no-explicit-any': 'off', // Allow any in test mocks and fixtures
			'better-tailwindcss/no-unregistered-classes': 'off', // Allow custom test classes (custom-class, my-custom-class, etc.)
		},
	},
	// Radix UI wrapper components - allow native checkbox/radio/input for primitives
	{
		files: ['src/components/ui/radix/*.tsx'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportAllDeclaration',
					message: 'export * is forbidden. Use explicit named exports instead.',
				},
				// Allow native elements in Radix primitives (they manage their own inputs)
			],
		},
	},
	// Prettier integration - disable conflicting ESLint rules
	prettierConfig,
];
