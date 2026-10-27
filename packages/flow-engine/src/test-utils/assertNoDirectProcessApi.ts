/**
 * Guard for the ProcessLauncher seam: fails when a source file imports a runtime value from
 * `node:child_process` (type-only imports are fine) or from `ProcessTreeKiller`.
 * Throws instead of skipping when the file cannot be read.
 */
import * as fs from 'node:fs';

export function findDirectProcessApiUses(sourcePath: string): string[] {
	const source = fs.readFileSync(sourcePath, 'utf8');
	const offenders: string[] = [];
	for (const match of source.matchAll(/^import\s+(?!type\b)([^;]*?)\s+from\s+'([^']+)';/gms)) {
		const [statement, clause, specifier] = match;
		if (specifier === undefined || clause === undefined) {
			continue;
		}
		const isChildProcess = specifier === 'node:child_process' || specifier === 'child_process';
		// `import { type A, type B }` has no runtime binding.
		const hasRuntimeBinding = /\{[^}]*\}/.test(clause)
			? clause
					.replace(/[{}]/g, '')
					.split(',')
					.some(part => part.trim() !== '' && !part.trim().startsWith('type '))
			: true;
		if ((isChildProcess && hasRuntimeBinding) || specifier.endsWith('/ProcessTreeKiller')) {
			offenders.push(statement.replace(/\s+/g, ' '));
		}
	}
	return offenders;
}
