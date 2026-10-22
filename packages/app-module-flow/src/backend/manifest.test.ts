import { FLOW_APP_MODULE_ID, FLOW_EXPOSED_SLOTS, FLOW_PAGE_PATHS } from 'flow-core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as {
	id?: string;
	version?: unknown;
	backendEntryPath?: unknown;
	requires?: unknown;
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

		it('accepts button-like root $types only, never a page-sized component', () => {
			for (const [name, slot] of Object.entries(slots)) {
				expect(slot.accepts, `slot ${name}`).toEqual(expect.arrayContaining(['ActionBar', 'ButtonLink']));
				expect(slot.accepts, `slot ${name}`).not.toContain('PageContent');
			}
		});

		it('requires no other module: flow works with no contributor installed', () => {
			expect(manifest.requires).toBeUndefined();
		});
	});
});
