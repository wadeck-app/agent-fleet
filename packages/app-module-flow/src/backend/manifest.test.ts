import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as {
	id?: string;
	version?: unknown;
	backendEntryPath?: unknown;
	extensionPoints: { kind: string; slot: string; path?: string; view: { type: string; value: string } }[];
};

describe('manifest.json (source manifest of the app-core-cli layout)', () => {
	it('declares the id the module is registered under: app-core refuses a manifest without it', () => {
		expect(manifest.id).toBe('flow');
	});

	it('keeps the id flow-cli registers it as (flow-cli/src/daemon/AppCoreRegistration.ts APP_CORE_MODULE_ID)', () => {
		const registration = readFileSync(join(packageDir, '../flow-cli/src/daemon/AppCoreRegistration.ts'), 'utf8');
		expect(registration).toContain(`APP_CORE_MODULE_ID = '${String(manifest.id)}'`);
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
				'page:nav:/workers',
				'page:nav:/logs',
				'page:nav:/plugins',
				'page:route:/plugins/:id',
				'widget:dashboard:',
			])
		);
	});
});
