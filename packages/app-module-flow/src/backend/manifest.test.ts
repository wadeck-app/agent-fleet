import { FLOW_ACTION_SLOT_ACCEPTS, FLOW_APP_MODULE_ID, FLOW_EXPOSED_SLOTS, FLOW_PAGE_PATHS } from 'flow-core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { satisfies } from 'semver';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as {
	id?: string;
	version?: unknown;
	backendEntryPath?: unknown;
	requires?: unknown;
	dslLib?: { shared?: Record<string, string> };
	expose?: { slots?: Record<string, { accepts: string[] }> };
	extensionPoints: {
		kind: string;
		slot: string;
		label?: string;
		path?: string;
		view: { type: string; value: string };
	}[];
};

describe('manifest.json (source manifest of the app-core-cli layout)', () => {
	it('declares the id the module is registered under: app-core refuses a manifest without it', () => {
		expect(manifest.id).toBe(FLOW_APP_MODULE_ID);
	});

	it('holds neither version nor backendEntryPath: `app-core-cli package` stamps the first and fixes the second', () => {
		expect(manifest).not.toHaveProperty('version');
		expect(manifest).not.toHaveProperty('backendEntryPath');
	});

	it('declares a dslLib (the MarkdownText component) with the shared ranges it was built against', () => {
		expect(Object.keys(manifest.dslLib?.shared ?? {}).sort()).toEqual([
			'@wadeck-app/dsl-renderer',
			'@wadeck-app/dsl-ui',
			'react',
			'react-router-dom',
		]);
		expect(existsSync(join(packageDir, 'src/dsl-components/index.ts'))).toBe(true);
	});

	// app-core checks these ranges against the build-info.json of its SERVER and refuses the whole module when it is
	// older ("built for ... but the shell provides"). 2026.10.26-290 is the first shell build with the central date
	// formatter (DateFormatProvider, useDateFormat, DateText) these components call. The range ends in "-0" on purpose:
	// semver ranks the numeric prerelease "290" BELOW any alphanumeric one such as "289-a8a6cc98" (CI stamps
	// <build>-<hash>), so ">=2026.10.26-290" or "^2026.10.26-290" would accept the older builds of that day.
	it.each(['@wadeck-app/dsl-ui', '@wadeck-app/dsl-renderer'])(
		'%s accepts the server build and refuses older shells',
		name => {
			const range = manifest.dslLib?.shared?.[name] ?? '';
			expect(satisfies('2026.10.26-290-52b6493c', range, { includePrerelease: true })).toBe(true);
			expect(satisfies('2026.10.26-291-8cd15823', range, { includePrerelease: true })).toBe(true);
			expect(satisfies('2026.10.27-5-abcdef12', range, { includePrerelease: true })).toBe(true);
			expect(satisfies('2026.10.26-289-a8a6cc98', range, { includePrerelease: true })).toBe(false);
			expect(satisfies('2026.10.26-279-33f64eeb', range, { includePrerelease: true })).toBe(false);
			expect(satisfies('2026.10.24-153-308eef77', range, { includePrerelease: true })).toBe(false);
			expect(satisfies('2026.10.18-101-b2ef217e', range, { includePrerelease: true })).toBe(false);
		}
	);

	it('references every view as ./src/dsl-views/<file> and each of them exists', () => {
		const paths = manifest.extensionPoints.map(point => point.view.value);
		expect(paths.length).toBeGreaterThan(0);
		for (const path of paths) {
			expect(path).toMatch(/^\.\/src\/dsl-views\/[\w.-]+\.ya?ml$/);
			expect(existsSync(join(packageDir, path))).toBe(true);
		}
	});

	it('offers the executions, workers, logs and plugins pages in the nav, the detail pages as routes and a dashboard widget', () => {
		const summary = manifest.extensionPoints.map(p => `${p.kind}:${p.slot}:${p.path ?? ''}`);
		expect(summary).toEqual(
			expect.arrayContaining([
				'page:nav:/executions',
				'page:route:/executions/:id',
				'page:route:/executions/:id/logs',
				'page:nav:/workers',
				'page:nav:/logs',
				'page:nav:/plugins',
				'page:route:/plugins/:id',
				'widget:dashboard:',
			])
		);
	});

	it('names its route pages, for the breadcrumb', () => {
		const labels = manifest.extensionPoints.filter(p => p.slot === 'route').map(p => `${p.path}=${p.label}`);
		expect(labels.sort()).toEqual([
			'/executions/:id/logs=Logs',
			'/executions/:id=Execution',
			'/plugins/:id=Plugin',
		]);
	});

	it('declares exactly the pages of flow-core FLOW_PAGE_PATHS, the contract the modules linking to them are tested against', () => {
		const pages = manifest.extensionPoints.filter(p => p.kind === 'page').map(p => p.path!);
		expect([...pages].sort()).toEqual([...FLOW_PAGE_PATHS].sort());
	});

	describe('extension slots other modules can fill', () => {
		const slots = manifest.expose?.slots ?? {};

		it('exposes exactly the slots of flow-core FLOW_EXPOSED_SLOTS, the contract the modules filling them are tested against', () => {
			expect(Object.keys(slots).sort()).toEqual(Object.keys(FLOW_EXPOSED_SLOTS).sort());
			for (const [name, accepts] of Object.entries(FLOW_EXPOSED_SLOTS)) {
				expect([...(slots[name]?.accepts ?? [])].sort(), `slot ${name}`).toEqual([...accepts].sort());
			}
		});

		it('accepts only the action-slot contract roots (the one component whose style is fixed), never a free-form component', () => {
			for (const [name, slot] of Object.entries(slots)) {
				expect(slot.accepts, `slot ${name}`).toEqual([...FLOW_ACTION_SLOT_ACCEPTS]);
			}
		});

		it('requires no other module: flow works with no contributor installed', () => {
			expect(manifest.requires).toBeUndefined();
		});
	});
});
