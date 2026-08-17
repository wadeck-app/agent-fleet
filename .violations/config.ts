import type { ViolationsConfig } from '@wadeck/violations-rules';

export default {
	projectTags: ['ts', 'shared'],
	globalExclude: ['**/node_modules/**', '**/dist/**', '**/dist-types/**', '**/*.test.ts', '**/*.spec.ts'],
	rules: {
		// Local rule: no raw String(err) in user-facing CLI output
		'./.violations/rules/no-raw-err-in-cli.ts': true,
		// Plugin system structural rules (PLUGIN-001 to PLUGIN-010)
		'./.violations/rules/plugin-rules.ts': true,
	},
} satisfies ViolationsConfig;
