import * as fs from 'node:fs/promises';
/**
 * Prevents raw error details (String(err), err.message in catch blocks, err.stack)
 * from being printed directly to user-facing terminal output in CLI command files.
 *
 * User-facing output must be human-friendly messages only.
 * Technical details must go to file logs (logWriter) or daemon stderr.
 *
 * Pattern flagged: console.error/log or process.stderr.write on a line that also
 * contains String(err) or template literal with err — in CLI command source files.
 *
 * Suppression: add `// violations-suppress: security/no-raw-err-in-cli reason` on the line.
 */
export const rule = {
    id: 'security/no-raw-err-in-cli',
    tags: 'ts',
    defaultScope: ['packages/flow-cli/src/cli/**/*.ts', 'packages/flow-cli/src/utils/loadYaml.ts'],
    defaultSeverity: 'error',
    async check(files) {
        const violations = [];
        // Patterns that output to user-facing terminal
        const OUTPUT_PATTERNS = [/console\.(error|warn|log)\s*\(/, /process\.(stderr|stdout)\.write\s*\(/];
        // Patterns that expose raw error internals
        const RAW_ERR_PATTERNS = [
            /String\s*\(\s*err\s*\)/, // String(err)
            /err\s*instanceof\s*Error.*message/, // err instanceof Error ? err.message — borderline
            /\$\{.*\berr\b.*\}/, // template literal containing err variable
            /\berr\.stack\b/, // err.stack
        ];
        for (const file of files) {
            let source;
            try {
                source = await fs.readFile(file, 'utf8');
            }
            catch {
                continue;
            }
            const lines = source.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip suppression comments and pure comments
                if (line.trimStart().startsWith('//'))
                    continue;
                // Must have an output call
                const hasOutput = OUTPUT_PATTERNS.some(p => p.test(line));
                if (!hasOutput)
                    continue;
                // Must contain a raw error reference
                const hasRawErr = RAW_ERR_PATTERNS.some(p => p.test(line));
                if (!hasRawErr)
                    continue;
                violations.push({
                    file,
                    line: i + 1,
                    message: `Raw error details in user-facing output: replace with a human-friendly message. ` +
                        `Log technical details to logWriter instead. ` +
                        `(matched: ${line.trim().slice(0, 80)})`,
                });
            }
        }
        return violations;
    },
};
