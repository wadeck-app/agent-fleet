import { FLOW_ACTION_SLOT_ACCEPTS, FLOW_EXPOSED_SLOTS } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The platform, not our own tests, must refuse a contribution whose root $type the slot does not accept: this runs the
// real `app-core-cli check` (the checker `package` and the load use) on throwaway contributors against the real manifest.
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cliBundle = join(packageDir, '../../node_modules/@wadeck-app/app-core-cli/dist/cli.bundle.js');
const WORK_DIR = mkdtempSync(join(tmpdir(), 'flow-slot-refusal-'));
const providerDir = join(WORK_DIR, 'provider');
const STUB_BACKEND = 'export default function () {}\n';

function runCli(args: string[], cwd: string) {
	const result = spawnSync(process.execPath, [cliBundle, ...args], {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, BUNDLE_VERSION: '0.0.0-dev' },
	});
	return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A contributor module whose views are `{ file: yaml }`, one contribution per entry, all to `slot`. */
function makeContributor(name: string, slot: string, views: Record<string, string>): string {
	const dir = join(WORK_DIR, name);
	mkdirSync(join(dir, 'src/dsl-views'), { recursive: true });
	for (const [file, yaml] of Object.entries(views)) writeFileSync(join(dir, 'src/dsl-views', file), yaml);
	const extensionPoints = Object.keys(views).map(file => ({
		kind: 'widget',
		slot,
		label: file,
		view: { type: 'path', value: `./src/dsl-views/${file}` },
	}));
	writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id: name, requires: { flow: '*' }, extensionPoints }));
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({
			name: `app-module-${name}`,
			version: '0.0.0',
			private: true,
			files: ['dist-module'],
			dependencies: { 'app-module-flow': '*' },
		})
	);
	mkdirSync(join(dir, 'src/backend'), { recursive: true });
	writeFileSync(join(dir, 'src/backend/index.ts'), STUB_BACKEND);
	writeFileSync(join(dir, '.gitignore'), 'dist-module\n');
	return dir;
}

function checkContributor(dir: string) {
	return runCli(['check', '.', '--link', `app-module-flow=${providerDir}`], dir);
}

beforeAll(() => {
	if (!existsSync(cliBundle)) {
		throw new Error(`app-core-cli is not installed at ${cliBundle}: run "npm install" at the repository root.`);
	}
	// The real manifest and views of the flow module; the backend is a stub, the check reads neither.
	mkdirSync(join(providerDir, 'src/backend'), { recursive: true });
	cpSync(join(packageDir, 'manifest.json'), join(providerDir, 'manifest.json'));
	cpSync(join(packageDir, 'package.json'), join(providerDir, 'package.json'));
	cpSync(join(packageDir, 'src/dsl-views'), join(providerDir, 'src/dsl-views'), { recursive: true });
	writeFileSync(join(providerDir, 'src/backend/index.ts'), 'export default function () {}\n');
	// The manifest declares a dslLib, so the check wants the entry; an empty registry keeps the copy free of the markdown dependencies.
	mkdirSync(join(providerDir, 'src/dsl-components'), { recursive: true });
	writeFileSync(join(providerDir, 'src/dsl-components/index.ts'), 'export default [];\n');
	writeFileSync(join(providerDir, '.gitignore'), 'dist-module\n');
	const packaged = runCli(['package', '.'], providerDir);
	if (packaged.status !== 0) {
		throw new Error(`Could not package a copy of the flow module for the refusal test:\n${packaged.output}`);
	}
});

// A process started by the checker may hold the directory a moment longer (EPERM on Windows): see removeTempDirectory.
afterAll(() => {
	removeTempDirectory(WORK_DIR);
});

describe('the platform refuses a contribution outside the action-slot contract', () => {
	const slots = Object.keys(FLOW_EXPOSED_SLOTS);

	it.each(slots)(
		'on flow:%s, for a free-form root, a page-sized root, a restylable button and a foreign component',
		slot => {
			const dir = makeContributor(`refused-${slot}`, `flow:${slot}`, {
				'text.yaml': '$type: Text\nlabel: hi\n',
				'graph.yaml': '$type: flow-chart:FlowGraph\nexecutionId: x\n',
				'button.yaml': '$type: ButtonLink\nto: /x\nlabel: Hi\nvariant: primary\nsize: md\n',
				'stack.yaml': '$type: HorizontalStack\nitems: []\n',
			});
			const { status, output } = checkContributor(dir);
			expect(status, output).not.toBe(0);
			const accepted = FLOW_ACTION_SLOT_ACCEPTS.join(', ');
			for (const root of ['Text', 'flow-chart:FlowGraph', 'ButtonLink', 'HorizontalStack']) {
				expect(output).toContain(`contributes a "${root}" to "flow:${slot}", which accepts only: ${accepted}`);
			}
		}
	);

	it.each(slots)('and accepts the contract component on flow:%s (the check is not refusing everything)', slot => {
		const dir = makeContributor(`accepted-${slot}`, `flow:${slot}`, {
			'link.yaml': '$type: flow-chart:FlowChartLink\ntarget: index\n',
		});
		const { status, output } = checkContributor(dir);
		expect(status, output).toBe(0);
	});

	// The platform checks the ROOT $type only: the style is protected by the component itself (FlowChartLink refuses
	// any key outside its contract), not by `accepts`. This documents that limit so nobody relies on it.
	it('does not look at the props of an accepted root', () => {
		const dir = makeContributor('restyled', 'flow:execution-actions', {
			'link.yaml': '$type: flow-chart:FlowChartLink\ntarget: index\nvariant: primary\nclassName: x\n',
		});
		expect(checkContributor(dir).status).toBe(0);
	});
});
