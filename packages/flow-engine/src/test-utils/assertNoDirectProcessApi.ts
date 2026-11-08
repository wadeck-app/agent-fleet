/**
 * Guard for the ProcessLauncher seam: reports every way a source file reaches a process API without going through
 * `ProcessLauncher`. A process API is `node:child_process`, `execa`, `cross-spawn` or `ProcessTreeKiller`.
 *
 * Detected shapes: `import ... from`, `export ... from`, `require(...)` (also `import x = require(...)`), and a runtime
 * `import(...)`. Type-only uses are fine: `import type`, `import { type A }`, `export type`, `import('x').Name` in a
 * type position and `typeof import('x')`. Comments are ignored. The scan is textual, not a parser: a module name built
 * at runtime (`require(name)`) cannot be seen.
 * Throws instead of skipping when the file cannot be read.
 */
import * as fs from 'node:fs';

const FORBIDDEN_MODULES = new Set(['node:child_process', 'child_process', 'execa', 'cross-spawn']);
const QUOTE = '[\'"`]';

function isForbiddenSpecifier(specifier: string): boolean {
	return FORBIDDEN_MODULES.has(specifier) || /(^|\/)ProcessTreeKiller$/.test(specifier);
}

// Replaces comments by spaces of equal length so offsets and the code around them stay intact.
function blankComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
		.replace(/(^|\s)\/\/[^\n]*/g, (match, lead: string) => lead + ' '.repeat(match.length - lead.length));
}

// `import A, { type B }` / `export { type B }`: only a binding that is not `type`-prefixed exists at runtime.
function hasRuntimeBinding(clause: string): boolean {
	const braces = /\{([^}]*)\}/.exec(clause);
	const outside = clause.replace(/\{[^}]*\}/, '').replace(/[,\s]/g, '');
	if (outside !== '') {
		return true;
	}
	if (braces === null) {
		return false;
	}
	return (braces[1] ?? '').split(',').some(part => part.trim() !== '' && !part.trim().startsWith('type '));
}

function collapse(statement: string): string {
	return statement.replace(/\s+/g, ' ').trim();
}

export function findDirectProcessApiUses(sourcePath: string): string[] {
	const source = blankComments(fs.readFileSync(sourcePath, 'utf8'));
	const offenders: string[] = [];

	// import X from '...' / export { X } from '...' / export * (as N) from '...' (type-only forms excluded)
	const bindingStatements = new RegExp(
		`^(?:import|export)\\s+(?!type\\b)([^;]*?)\\s+from\\s+(${QUOTE})([^'"\`]+)\\2`,
		'gms'
	);
	for (const match of source.matchAll(bindingStatements)) {
		const [statement, clause, , specifier] = match;
		if (statement === undefined || clause === undefined || specifier === undefined) {
			continue;
		}
		const isStarExport = statement.startsWith('export') && clause.startsWith('*');
		if (isForbiddenSpecifier(specifier) && (isStarExport || hasRuntimeBinding(clause))) {
			offenders.push(collapse(statement));
		}
	}

	// require('...'), including `import x = require('...')`
	for (const match of source.matchAll(new RegExp(`\\brequire\\s*\\(\\s*(${QUOTE})([^'"\`]+)\\1\\s*\\)`, 'g'))) {
		if (isForbiddenSpecifier(match[2] ?? '')) {
			offenders.push(collapse(match[0]));
		}
	}

	// import('...') at runtime; `typeof import('x')` and `import('x').Name` are type positions
	for (const match of source.matchAll(new RegExp(`\\bimport\\s*\\(\\s*(${QUOTE})([^'"\`]+)\\1\\s*\\)`, 'g'))) {
		if (!isForbiddenSpecifier(match[2] ?? '')) {
			continue;
		}
		const index = match.index ?? 0;
		const before = source.slice(0, index);
		const after = source.slice(index + match[0].length);
		const isTypeof = /\btypeof\s+$/.test(before);
		const memberAfter = /^\.\s*([A-Za-z_$][\w$]*)/.exec(after)?.[1];
		const isTypeMember = memberAfter !== undefined && !['then', 'catch', 'finally'].includes(memberAfter);
		if (!isTypeof && !isTypeMember) {
			offenders.push(collapse(match[0]));
		}
	}

	return offenders;
}
