export default {
    projectTags: ['ts', 'shared', 'cli', 'react', 'tailwind'],
    globalExclude: ['**/node_modules/**', '**/dist/**', '**/dist-types/**', '**/*.test.ts', '**/*.spec.ts', 'suppress-unsafe-casts.*'],
    rules: {
        // Local rule: no raw String(err) in user-facing CLI output
        './.violations/rules/no-raw-err-in-cli.ts': true,
        // Plugin system structural rules (PLUGIN-001 to PLUGIN-010)
        './.violations/rules/plugin-rules.ts': true,
        // Downgrade to warning: 338 pre-existing unsafe casts across 91 files require broader refactoring
        'ts/no-unsafe-type-cast': { $severity: 'warning' },
    },
};
