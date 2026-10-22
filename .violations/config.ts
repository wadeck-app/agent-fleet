import type { ViolationsConfig } from '@wadeck-app/violations-rules';

export default {
	projectTags: ['ts', 'cli', 'react', 'tailwind'],
	globalExclude: [
		'**/node_modules/**',
		'**/dist/**',
		'**/dist-types/**',
		// Bundled CLI output (packages/*/dist-bundle, git-ignored): generated, not source
		'**/dist-bundle/**',
		// App-module build output (packages/app-module-*/dist-module, git-ignored): generated, not source
		'**/dist-module/**',
		'**/*.test.ts',
		'**/*.test.tsx',
		'**/*.spec.ts',
		'**/*.spec.tsx',
		'**/*.stories.ts',
		'**/*.stories.tsx',
		'suppress-unsafe-casts.*',
		// Generated output, not source: storybook builds land here and are bundled/minified
		'**/temp/**',
		'**/storybook-static/**',
	],
	rules: {
		// Local rule: no raw String(err) in user-facing CLI output
		'./.violations/rules/no-raw-err-in-cli.ts': true,
		// Plugin system structural rules (PLUGIN-001 to PLUGIN-010)
		'./.violations/rules/plugin-rules.ts': true,
		// Non-ASCII characters (check marks, ellipsis, em dashes, accents) are forbidden in app-module packages and flow-core, tests included
		'./.violations/rules/app-module-ascii-only.ts': true,
		// The app-modules' manifest.json, validated with the schemas app-core applies (rule shipped by app-core-sdk)
		'./.violations/rules/app-core-manifest.js': true,
		// Downgrade to warning: 338 pre-existing unsafe casts across 91 files require broader refactoring
		'ts/no-unsafe-type-cast': { $severity: 'warning' },
		// ReviewThreadItem uses icon-only ghost buttons requiring muted/destructive tokens without matching variant
		'tailwind/no-button-classname-style-override': { $exclude: ['**/tickets/ReviewThreadItem.tsx'] },
	},
} satisfies ViolationsConfig;
