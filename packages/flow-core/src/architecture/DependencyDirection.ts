import * as fs from 'node:fs';
import * as path from 'node:path';

// The dependency direction of the flow packages, as a checkable rule:
//
//   flow-core        <- flow-cli, app-module-flow, app-module-flow-chart      (they share logic ONLY through it)
//   flow-cli, app-module-*  never reference each other, and flow-core references none of them
//
// "Reference" is any import/require specifier, any relative or `packages/<name>` path literal, and any
// package.json / tsconfig entry that names the other package. Tests count: a test that reads a sibling's
// sources is the same coupling as an import.

export const FLOW_CLI_PACKAGE = 'flow-cli';
export const FLOW_CORE_PACKAGE = 'flow-core';
export const APP_MODULE_PACKAGE_PREFIX = 'app-module-';

export interface DependencyViolation {
	/** Path relative to the packages directory. */
	file: string;
	line: number;
	/** The offending text as written. */
	reference: string;
	rule: string;
}

const SKIPPED_DIRECTORIES = new Set([
	'node_modules',
	'dist',
	'dist-types',
	'dist-module',
	'dist-bundle',
	'coverage',
	'.git',
]);
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

/** The part of a package.json read here: dependency sections map package names to version ranges. */
type PackageJsonDependencies = Partial<Record<(typeof DEPENDENCY_SECTIONS)[number], Record<string, string>>>;
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']);

// import x from 'a' / export ... from 'a' / import 'a' / import('a') / require('a')
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;
// A string that walks to or names a sibling package directory: '../flow-cli/x', 'packages/app-module-flow'.
const PATH_LITERAL_PATTERN = /(['"`])([^'"`\n]*?(?:\.\.\/|\bpackages\/)([\w-]+)[^'"`\n]*)\1/g;

function isAppModule(packageName: string): boolean {
	return packageName.startsWith(APP_MODULE_PACKAGE_PREFIX);
}

/** What `ownPackage` may not name, or undefined when `name` is fine for it. */
function forbiddenReason(ownPackage: string, name: string): string | undefined {
	if (name === ownPackage) {
		return undefined;
	}
	if (ownPackage === FLOW_CORE_PACKAGE && (name === FLOW_CLI_PACKAGE || isAppModule(name))) {
		return `${FLOW_CORE_PACKAGE} must not reference ${name}: it is the shared layer, hosts depend on it, not the reverse`;
	}
	if (ownPackage === FLOW_CLI_PACKAGE && isAppModule(name)) {
		return `${FLOW_CLI_PACKAGE} must not reference ${name}: share logic through ${FLOW_CORE_PACKAGE}`;
	}
	if (isAppModule(ownPackage) && (name === FLOW_CLI_PACKAGE || isAppModule(name))) {
		return `${ownPackage} must not reference ${name}: share logic through ${FLOW_CORE_PACKAGE}`;
	}
	return undefined;
}

/** The package an import specifier points at: its first segment, or any segment of a relative path. */
function packageNamesOfSpecifier(specifier: string): string[] {
	const segments = specifier.split('/').filter(segment => segment !== '' && segment !== '.' && segment !== '..');
	return specifier.startsWith('.') ? segments : segments.slice(0, 1);
}

const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const NOT_LINE_BREAK_PATTERN = /[^\n]/g;
// A `//` that starts a comment, not the one of `https://`.
const LINE_COMMENT_PATTERN = /(^|[^:'"`\\])\/\/[^\n]*/gm;

/**
 * `source` without comments (line breaks kept, so line numbers stay right): prose may name any package, only code
 * and string values couple packages.
 */
function withoutComments(source: string): string {
	const blanked = source.replace(BLOCK_COMMENT_PATTERN, comment => comment.replace(NOT_LINE_BREAK_PATTERN, ''));
	return blanked.replace(LINE_COMMENT_PATTERN, '$1');
}

/** Violations in the text of one file of `ownPackage`. */
export function findViolationsInSource(ownPackage: string, file: string, rawSource: string): DependencyViolation[] {
	const source = withoutComments(rawSource);
	const violations: DependencyViolation[] = [];
	const lineOf = (index: number): number => source.slice(0, index).split('\n').length;
	// A relative import matches both patterns: one finding per line and reference.
	const report = (index: number, reference: string, rule: string): void => {
		const line = lineOf(index);
		if (violations.some(v => v.line === line && v.reference === reference)) {
			return;
		}
		violations.push({ file, line, reference, rule });
	};
	for (const match of source.matchAll(SPECIFIER_PATTERN)) {
		const specifier = match[2]!;
		for (const name of packageNamesOfSpecifier(specifier)) {
			const rule = forbiddenReason(ownPackage, name);
			if (rule) {
				report(match.index, specifier, rule);
			}
		}
	}
	for (const match of source.matchAll(PATH_LITERAL_PATTERN)) {
		const rule = forbiddenReason(ownPackage, match[3]!);
		if (rule) {
			report(match.index, match[2]!, rule);
		}
	}
	return violations;
}

/**
 * Build-time module requirements: `app-core-cli package` finds the module that provides the slots a manifest fills
 * among the package.json dependencies, so flow-chart (which `requires` flow in its manifest) must list the flow
 * module. This is a packaging declaration, never an import: the code rule above still forbids reading it.
 */
const MODULE_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
	'app-module-flow-chart': ['app-module-flow'],
};

/** Violations in a package.json: dependencies on a sibling flow package. */
export function findViolationsInPackageJson(ownPackage: string, file: string, source: string): DependencyViolation[] {
	const manifest = JSON.parse(source) as PackageJsonDependencies;
	const violations: DependencyViolation[] = [];
	for (const section of DEPENDENCY_SECTIONS) {
		const entries = manifest[section] ?? {};
		for (const [name, range] of Object.entries(entries)) {
			if (MODULE_REQUIREMENTS[ownPackage]?.includes(name)) {
				continue;
			}
			const rule = forbiddenReason(ownPackage, name);
			if (rule) {
				violations.push({ file, line: 1, reference: `${section}: ${name}@${range}`, rule });
			}
		}
	}
	return violations;
}

function withoutDependencySections(packageJson: string): string {
	const manifest = JSON.parse(packageJson) as PackageJsonDependencies;
	for (const section of DEPENDENCY_SECTIONS) {
		delete manifest[section];
	}
	return JSON.stringify(manifest, null, '\t');
}

function* walk(directory: string): Generator<string> {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name)) {
				yield* walk(path.join(directory, entry.name));
			}
		} else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
			yield path.join(directory, entry.name);
		}
	}
}

/**
 * Scans every source, test, config and manifest file of the package folders `packageNames` under `packagesDir`.
 * `excludedFiles` (paths relative to `packagesDir`) are skipped: the files that define these rules and so
 * must spell the forbidden names out.
 */
export function findDependencyViolations(
	packagesDir: string,
	packageNames: readonly string[],
	excludedFiles: readonly string[] = []
): DependencyViolation[] {
	const violations: DependencyViolation[] = [];
	for (const packageName of packageNames) {
		const packageDir = path.join(packagesDir, packageName);
		if (!fs.existsSync(packageDir)) {
			throw new Error(
				`Package folder ${packageDir} does not exist: the dependency-direction check cannot silently skip ${packageName}. Update the package list in DependencyDirection.test.ts if it was renamed.`
			);
		}
		for (const absolute of walk(packageDir)) {
			const file = path.relative(packagesDir, absolute).split(path.sep).join('/');
			if (excludedFiles.includes(file)) {
				continue;
			}
			const source = fs.readFileSync(absolute, 'utf8');
			if (path.basename(absolute) === 'package.json') {
				violations.push(...findViolationsInPackageJson(packageName, file, source));
				// The dependency sections were judged above (with the module requirements); scripts, exports... are scanned as text.
				violations.push(...findViolationsInSource(packageName, file, withoutDependencySections(source)));
			} else {
				violations.push(...findViolationsInSource(packageName, file, source));
			}
		}
	}
	return violations;
}

export function describeViolations(violations: readonly DependencyViolation[]): string {
	return violations.map(v => `${v.file}:${v.line}  '${v.reference}'  -- ${v.rule}`).join('\n');
}
