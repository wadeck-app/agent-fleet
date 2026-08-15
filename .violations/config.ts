import type { ViolationsConfig } from '@wadeck/violations-rules';

export default {
    projectTags: ['ts'],
    globalExclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/dist-types/**',
        '**/*.test.ts',
        '**/*.spec.ts',
    ],
    rules: {
        // Local rule: no raw String(err) in user-facing CLI output
        './.violations/rules/no-raw-err-in-cli.ts': true,
    },
} satisfies ViolationsConfig;
