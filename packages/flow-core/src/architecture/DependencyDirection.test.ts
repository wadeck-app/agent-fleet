import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	describeViolations,
	findDependencyViolations,
	findViolationsInPackageJson,
	findViolationsInSource,
} from './DependencyDirection.js';

const PACKAGES_DIR = fileURLToPath(new URL('../../..', import.meta.url));

// The two files that define the rules spell the forbidden names out (as examples), so they are not scanned.
const RULE_FILES = [
	'flow-core/src/architecture/DependencyDirection.ts',
	'flow-core/src/architecture/DependencyDirection.test.ts',
];

describe('dependency direction of the flow packages (the real repository)', () => {
	// The user rule: flow-cli and the app-modules share logic ONLY through flow-core.
	it('flow-core, flow-cli and the app-modules reference each other only as allowed, in sources, tests and manifests', () => {
		const violations = findDependencyViolations(
			PACKAGES_DIR,
			['flow-core', 'flow-cli', 'app-module-flow', 'app-module-flow-chart'],
			RULE_FILES
		);
		expect(violations, `\n${describeViolations(violations)}\n`).toEqual([]);
	});

	it('fails loudly when a package folder is missing instead of skipping it', () => {
		expect(() => findDependencyViolations(PACKAGES_DIR, ['no-such-package'])).toThrow(/no-such-package/);
	});
});

describe('findViolationsInSource', () => {
	const rules = (own: string, source: string): string[] =>
		findViolationsInSource(own, 'x.ts', source).map(v => v.reference);

	it('flags flow-cli importing an app-module, by package name or by relative path', () => {
		expect(rules('flow-cli', "import { x } from 'app-module-flow';")).toEqual(['app-module-flow']);
		expect(rules('flow-cli', "import x from '../../app-module-flow-chart/src/y.js';")).toEqual([
			'../../app-module-flow-chart/src/y.js',
		]);
	});

	it('flags an app-module importing flow-cli or the other module', () => {
		expect(rules('app-module-flow', "import { x } from 'flow-cli/dist/y.js';")).toEqual(['flow-cli/dist/y.js']);
		expect(rules('app-module-flow-chart', "const m = require('../app-module-flow/x');")).toEqual([
			'../app-module-flow/x',
		]);
		expect(rules('app-module-flow', "const m = await import('../flow-cli/x.js');")).toEqual(['../flow-cli/x.js']);
	});

	it('flags flow-core importing any of them', () => {
		expect(rules('flow-core', "export { x } from 'flow-cli';")).toEqual(['flow-cli']);
		expect(rules('flow-core', "import 'app-module-flow';")).toEqual(['app-module-flow']);
	});

	it('flags a test that reads a sibling package through a path literal', () => {
		const source = "readFileSync(join(packageDir, '../flow-cli/src/daemon/AppModules.ts'), 'utf8');";
		expect(rules('app-module-flow', source)).toEqual(['../flow-cli/src/daemon/AppModules.ts']);
		expect(rules('flow-cli', 'join(root, `packages/app-module-flow/dist-module`)')).toEqual([
			'packages/app-module-flow/dist-module',
		]);
	});

	it('reports the line of the reference', () => {
		const [violation] = findViolationsInSource('flow-core', 'f.ts', "a;\nb;\nimport x from 'flow-cli';\n");
		expect(violation!.line).toBe(3);
	});

	it('allows the declared directions and a package naming itself', () => {
		expect(rules('flow-cli', "import { x } from 'flow-core'; import y from 'flow-core/testing';")).toEqual([]);
		expect(rules('app-module-flow', "import { x } from 'flow-core';")).toEqual([]);
		expect(rules('flow-cli', "import { x } from 'flow-cli/dist/y.js'; import z from '../ipc/Protocol';")).toEqual(
			[]
		);
		expect(rules('app-module-flow', "import z from '../../app-module-flow/x.js';")).toEqual([]);
	});

	it('ignores comments, keeping the line numbers of the code after them', () => {
		const source =
			"// import a from 'flow-cli';\n/* import b from 'flow-cli';\n   see '../flow-cli/x' */\nimport c from 'flow-cli';\n";
		const violations = findViolationsInSource('flow-core', 'f.ts', source);
		expect(violations.map(v => [v.line, v.reference])).toEqual([[4, 'flow-cli']]);
	});

	it('does not take the // of a URL for a comment', () => {
		const source = "const url = 'https://example.org'; import c from 'flow-cli';";
		expect(rules('flow-core', source)).toEqual(['flow-cli']);
	});

	it('does not mistake prose or a package-name value for a reference', () => {
		expect(
			rules('flow-cli', "const descriptor = { sourcePackage: 'app-module-flow' }; // see app-module-flow")
		).toEqual([]);
		expect(rules('app-module-flow', "const msg = 'reinstall flow-cli';")).toEqual([]);
	});
});

describe('findViolationsInPackageJson', () => {
	const refs = (own: string, json: object): string[] =>
		findViolationsInPackageJson(own, 'package.json', JSON.stringify(json)).map(v => v.reference);

	it('flags a dependency on a sibling flow package in any dependency section', () => {
		expect(refs('flow-cli', { devDependencies: { 'app-module-flow': 'file:../app-module-flow' } })).toEqual([
			'devDependencies: app-module-flow@file:../app-module-flow',
		]);
		expect(refs('app-module-flow', { dependencies: { 'flow-cli': '*' } })).toEqual(['dependencies: flow-cli@*']);
		expect(refs('flow-core', { peerDependencies: { 'flow-cli': '*' } })).toEqual(['peerDependencies: flow-cli@*']);
	});

	it('allows flow-chart to list the flow module it requires (app-core-cli resolves slot providers there), and nothing else', () => {
		expect(
			refs('app-module-flow-chart', { devDependencies: { 'app-module-flow': 'file:../app-module-flow' } })
		).toEqual([]);
		expect(refs('app-module-flow-chart', { devDependencies: { 'flow-cli': '*' } })).toEqual([
			'devDependencies: flow-cli@*',
		]);
		expect(refs('app-module-flow', { devDependencies: { 'app-module-flow-chart': '*' } })).toEqual([
			'devDependencies: app-module-flow-chart@*',
		]);
	});

	it('allows flow-core as a dependency of the hosts', () => {
		expect(refs('flow-cli', { dependencies: { 'flow-core': 'file:../flow-core' } })).toEqual([]);
		expect(refs('app-module-flow-chart', { dependencies: { 'flow-core': 'file:../flow-core' } })).toEqual([]);
	});
});

describe('findDependencyViolations on a throwaway tree', () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-dependency-direction-'));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	const write = (file: string, content: string): void => {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), content);
	};

	it('scans sources, tests and package.json, and skips build output and node_modules', () => {
		write('flow-cli/src/A.ts', "import x from 'app-module-flow';\n");
		write('flow-cli/src/A.test.ts', "import x from 'app-module-flow-chart';\n");
		write('flow-cli/package.json', JSON.stringify({ dependencies: { 'app-module-flow': '1' } }));
		write('flow-cli/dist/B.js', "import x from 'app-module-flow';\n");
		write('flow-cli/node_modules/pkg/C.js', "import x from 'app-module-flow';\n");
		write('app-module-flow/src/ok.ts', "import x from 'flow-core';\n");
		const files = findDependencyViolations(root, ['flow-cli', 'app-module-flow']).map(v => v.file);
		expect(files.sort()).toEqual(['flow-cli/package.json', 'flow-cli/src/A.test.ts', 'flow-cli/src/A.ts']);
	});

	it('skips the files it is told to', () => {
		write('flow-core/src/Rules.ts', "import x from 'flow-cli';\n");
		expect(findDependencyViolations(root, ['flow-core'], ['flow-core/src/Rules.ts'])).toEqual([]);
	});
});
