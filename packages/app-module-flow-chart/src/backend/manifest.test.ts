import { FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID, FLOW_EXPOSED_SLOTS, FLOW_REQUIRED_RANGE } from 'flow-core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { satisfies, valid } from 'semver';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
interface Manifest {
	id?: string;
	version?: unknown;
	backendEntryPath?: unknown;
	requires?: Record<string, string>;
	expose?: { slots?: Record<string, { accepts: string[] }> };
	dslLib?: { shared?: Record<string, string> };
	extensionPoints: {
		kind: string;
		slot: string;
		label?: string;
		order?: number;
		path?: string;
		view: { type: string; value: string };
	}[];
}

const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as Manifest;
// The slot prefix a contributor writes to fill a slot of the flow module.
const flowSlotPrefix = `${FLOW_APP_MODULE_ID}:`;
// The side menu of flow, not a slot flow exposes: any module a module requires has one (app-core `<provider>:nav`).
const FLOW_MENU_SLOT = `${flowSlotPrefix}nav`;

describe('manifest.json (source manifest of the app-core-cli layout)', () => {
	it('declares the id the module is registered under', () => {
		expect(manifest.id).toBe(FLOW_CHART_APP_MODULE_ID);
	});

	it('holds neither version nor backendEntryPath: `app-core-cli package` stamps the first and fixes the second', () => {
		expect(manifest).not.toHaveProperty('version');
		expect(manifest).not.toHaveProperty('backendEntryPath');
	});

	it('references every view as ./src/dsl-views/<file> and each of them exists', () => {
		const paths = manifest.extensionPoints.map(point => point.view.value);
		expect(paths.length).toBeGreaterThan(0);
		for (const path of paths) {
			expect(path).toMatch(/^\.\/src\/dsl-views\/[\w.-]+\.ya?ml$/);
			expect(existsSync(join(packageDir, path))).toBe(true);
		}
	});

	it('puts the flow charts index in the side menu of flow and the two chart pages as routes', () => {
		const summary = manifest.extensionPoints.filter(p => p.kind === 'page').map(p => `${p.slot}:${p.path}`);
		expect(summary.sort()).toEqual(['flow:nav:/flows', 'route:/flows/:flowId', 'route:/flows/runs/:id']);
	});

	it('has no page in its own nav: that would give it a tab of the top bar next to Flow', () => {
		expect(manifest.extensionPoints.filter(p => p.slot === 'nav')).toEqual([]);
	});

	it('orders and names its menu entry, and names its route pages for the breadcrumb', () => {
		const menu = manifest.extensionPoints.find(p => p.slot === FLOW_MENU_SLOT);
		expect(menu).toMatchObject({ label: 'Flow Charts', order: 10 });
		const labels = manifest.extensionPoints.filter(p => p.slot === 'route').map(p => `${p.path}=${p.label}`);
		expect(labels.sort()).toEqual(['/flows/:flowId=Flow', '/flows/runs/:id=Execution']);
	});

	it('declares a dslLib (the FlowGraph and FlowChartLink components) with the shared ranges it was built against', () => {
		expect(Object.keys(manifest.dslLib?.shared ?? {}).sort()).toEqual([
			'@wadeck-app/dsl-renderer',
			'@wadeck-app/dsl-ui',
			'react',
			'react-router-dom',
		]);
	});

	// app-core checks these ranges against the build-info.json of its SERVER and refuses the whole module when it is
	// older ("built for ... but the shell provides"). Raise them only once that server build is newer: 2026.10.23-136
	// is what the user's server served when the components needed the A/B hooks and the DataTable column options.
	it.each(['@wadeck-app/dsl-ui', '@wadeck-app/dsl-renderer'])(
		'%s accepts the server build and refuses older shells',
		name => {
			const range = manifest.dslLib?.shared?.[name] ?? '';
			expect(satisfies('2026.10.23-136-d5f44a0f', range, { includePrerelease: true })).toBe(true);
			expect(satisfies('2026.10.18-101-b2ef217e', range, { includePrerelease: true })).toBe(false);
		}
	);
});

describe('requirement on the flow module', () => {
	it('requires flow: without it the slots it fills do not exist', () => {
		expect(Object.keys(manifest.requires ?? {})).toEqual([FLOW_APP_MODULE_ID]);
	});

	// "*" on purpose: app-core matches with includePrerelease, and CI stamps prereleases like 2026.10.19-663-3ea4c829.
	it('accepts any flow version', () => {
		expect(manifest.requires?.[FLOW_APP_MODULE_ID]).toBe(FLOW_REQUIRED_RANGE);
	});

	// app-core matches with includePrerelease: CI stamps 2026.10.19-663-3ea4c829, a local build 0.1.0.
	it.each(['2026.10.19-663-3ea4c829', '0.1.0', '2026.10.19', '0.0.0-test-integration'])(
		'accepts the flow version %s',
		version => {
			const range = manifest.requires?.[FLOW_APP_MODULE_ID] ?? '';
			expect(valid(version)).not.toBeNull();
			expect(satisfies(version, range, { includePrerelease: true })).toBe(true);
		}
	);
});

describe('contributions to the slots of flow', () => {
	const contributions = manifest.extensionPoints.filter(
		p => p.slot.startsWith(flowSlotPrefix) && p.slot !== FLOW_MENU_SLOT
	);

	it('fills only slots flow exposes (flow-core FLOW_EXPOSED_SLOTS)', () => {
		expect(contributions.length).toBeGreaterThan(0);
		for (const point of contributions) {
			expect(Object.keys(FLOW_EXPOSED_SLOTS)).toContain(point.slot.slice(flowSlotPrefix.length));
		}
	});

	it('uses a root $type the slot accepts (app-core validates the root only)', () => {
		for (const point of contributions) {
			const view = readFileSync(join(packageDir, point.view.value), 'utf8');
			const root = /^\$type:\s*(\S+)\s*$/m.exec(view)?.[1];
			expect(root, `${point.view.value} has no root $type`).toBeDefined();
			expect(FLOW_EXPOSED_SLOTS[point.slot.slice(flowSlotPrefix.length)]).toContain(root);
		}
	});

	it('fills the execution detail page and the executions list', () => {
		expect(contributions.map(p => p.slot).sort()).toEqual(
			Object.keys(FLOW_EXPOSED_SLOTS)
				.map(slot => `${flowSlotPrefix}${slot}`)
				.sort()
		);
	});
});
