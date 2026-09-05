import { readFileSync } from 'node:fs';
// Detects spawn/execFile calls that lack windowsHide:true on non-inherit stdio.
// Without windowsHide:true, cmd.exe or subprocesses flash visible terminal windows on Windows.
// Exemption: stdio:'inherit' is intentional (user-facing interactive process).
const SPAWN_CALL = /\bspawn\s*\(|execFile\s*\(/;
const WINDOWS_HIDE = /windowsHide\s*:\s*true/;
const STDIO_INHERIT = /stdio\s*:\s*['"]inherit['"]/;
export const rule = {
    id: 'local/no-spawn-without-windows-hide',
    tags: 'ts',
    defaultScope: [
        'packages/flow-engine/src/**/*.ts',
        'packages/flow-cli/src/**/*.ts',
        'packages/task-cli/src/**/*.ts',
    ],
    defaultSeverity: 'warning',
    async check(files, _config) {
        const violations = [];
        for (const file of files) {
            if (file.includes('.test.') || file.includes('.spec.'))
                continue;
            const lines = readFileSync(file, 'utf8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!SPAWN_CALL.test(line))
                    continue;
                // Collect the spawn call block (up to 8 lines to find options object)
                const block = lines.slice(i, i + 8).join('\n');
                if (STDIO_INHERIT.test(block))
                    continue; // intentional interactive spawn
                if (WINDOWS_HIDE.test(block))
                    continue; // already compliant
                violations.push({
                    file,
                    line: i + 1,
                    message: 'spawn/execFile without windowsHide:true will open visible terminal windows on Windows. Add windowsHide:true to spawn options, or suppress if stdio:\'inherit\' is intentional.',
                });
            }
        }
        return violations;
    },
};
export default rule;
