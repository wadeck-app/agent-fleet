import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dependency direction for the flow features:
 *
 *   flow-cli ──► flow-core ◄── web-backend ◄── web-frontend (via shared-frontend-backend)
 *
 * Shared logic lives only in flow-core. flow-cli and the web packages may each use it but must never
 * reach each other, in package.json or in source imports. The web packages never import the app-modules
 * either (they are hosted by app-core, not by this web app). The rules about flow-core and the
 * app-modules themselves live in flow-core/src/architecture/DependencyDirection.test.ts.
 */
const PACKAGES_DIR = path.resolve(__dirname, '../../..');

const WEB_PACKAGES = ['web-backend', 'web-frontend', 'shared-frontend-backend', 'e2e-web'];
const CLI_PACKAGES = ['flow-cli'];
const APP_MODULE_PACKAGES = ['app-module-flow', 'app-module-flow-chart'];
const SHARED_BASE = 'flow-core';

function sourceFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			return entry.name === 'node_modules' || entry.name === 'dist' ? [] : sourceFiles(full);
		}
		return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
	});
}

function importedSpecifiers(file: string): string[] {
	const text = fs.readFileSync(file, 'utf8');
	const specifiers = [...text.matchAll(/(?:from|import|require\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]!);
	return specifiers;
}

function pointsAt(specifier: string, target: string): boolean {
	return (
		specifier === target ||
		specifier.startsWith(`${target}/`) ||
		new RegExp(`(^|/)packages/${target}(/|$)`).test(specifier)
	);
}

function violations(fromPackages: string[], forbidden: string[]): string[] {
	const found: string[] = [];
	for (const pkg of fromPackages) {
		const packageDir = path.join(PACKAGES_DIR, pkg);
		if (!fs.existsSync(packageDir)) {
			throw new Error(
				`Package '${pkg}' not found at ${packageDir}: update FlowPackageDependencyDirection.test.ts.`
			);
		}
		const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as Record<
			string,
			Record<string, string> | undefined
		>;
		const declared = Object.keys({
			...manifest.dependencies,
			...manifest.devDependencies,
			...manifest.peerDependencies,
		});
		for (const target of forbidden) {
			if (declared.includes(target)) found.push(`${pkg}/package.json depends on ${target}`);
		}
		for (const file of sourceFiles(path.join(packageDir, 'src'))) {
			for (const specifier of importedSpecifiers(file)) {
				for (const target of forbidden) {
					if (pointsAt(specifier, target)) {
						found.push(`${path.relative(PACKAGES_DIR, file)} imports '${specifier}' (${target})`);
					}
				}
			}
		}
	}
	return found;
}

describe('flow package dependency direction', () => {
	it('the web packages never depend on flow-cli', () => {
		expect(violations(WEB_PACKAGES, CLI_PACKAGES)).toEqual([]);
	});

	it('flow-cli never depends on the web packages', () => {
		expect(violations(CLI_PACKAGES, WEB_PACKAGES)).toEqual([]);
	});

	it('the web packages never depend on the app-modules', () => {
		expect(violations(WEB_PACKAGES, APP_MODULE_PACKAGES)).toEqual([]);
	});

	it('the checker detects a violation (guards against a silently empty scan)', () => {
		// web-backend does import flow-core: scanning it for that target must find something.
		expect(violations(['web-backend'], [SHARED_BASE]).length).toBeGreaterThan(0);
	});
});
