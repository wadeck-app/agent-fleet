import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	AppModuleNotFoundError,
	appCoreModuleOption,
	appCoreModuleOptions,
	defaultAppModuleLocations,
	locateAppModuleManifest,
} from './AppModuleLocator.js';
import { APP_MODULES, type AppModuleDescriptor } from './AppModules.js';

const FLOW = APP_MODULES[0]!;
const FLOW_CHART = APP_MODULES[1]!;

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-module-locator-'));
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

function touch(name: string): string {
	const file = path.join(dir, name);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, '{}');
	return file;
}

describe('defaultAppModuleLocations', () => {
	it('bundle layout: app-module/ next to the CLI bundle file', () => {
		const bundleUrl = pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;
		expect(defaultAppModuleLocations(bundleUrl, FLOW).bundled).toBe(
			path.join(dir, 'install', FLOW.bundleDir, 'manifest.json')
		);
	});

	it('source layout: dist-module of the sibling package, three levels up from dist/cli/FlowIndex.js', () => {
		const sourceUrl = pathToFileURL(path.join(dir, 'packages', 'flow-cli', 'dist', 'cli', 'FlowIndex.js')).href;
		expect(defaultAppModuleLocations(sourceUrl, FLOW).dev).toBe(
			path.join(dir, 'packages', FLOW.sourcePackage, 'dist-module', 'manifest.json')
		);
	});
});

describe('appCoreModuleOption', () => {
	it('returns the manifest to register when the module is built', () => {
		const bundled = touch(`bundle/${FLOW.bundleDir}/manifest.json`);
		const errors: string[] = [];
		expect(appCoreModuleOption({ bundled, dev: 'unused' }, FLOW, m => errors.push(m))).toEqual({
			manifestPath: bundled,
		});
		expect(errors).toEqual([]);
	});

	it('reports the problem and returns undefined (the daemon still starts) when the module is not built', () => {
		const errors: string[] = [];
		const option = appCoreModuleOption(
			{ bundled: path.join(dir, 'a/manifest.json'), dev: path.join(dir, 'b/manifest.json') },
			FLOW,
			m => errors.push(m)
		);
		expect(option).toBeUndefined();
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('npm run bundle');
		expect(errors[0]).toContain('starts without registering');
	});
});

describe('locateAppModuleManifest', () => {
	it('prefers the manifest bundled next to the CLI', () => {
		const bundled = touch(`bundle/${FLOW.bundleDir}/manifest.json`);
		const dev = touch('dev/dist-module/manifest.json');
		expect(locateAppModuleManifest({ bundled, dev }, FLOW)).toBe(bundled);
	});

	it('falls back to the packaged module of the sibling package in a source checkout', () => {
		const dev = touch('dev/dist-module/manifest.json');
		expect(locateAppModuleManifest({ bundled: path.join(dir, 'missing/manifest.json'), dev }, FLOW)).toBe(dev);
	});

	it('throws naming both locations and the command that builds the module when neither exists', () => {
		const bundled = path.join(dir, 'missing-a/manifest.json');
		const dev = path.join(dir, 'missing-b/manifest.json');
		expect(() => locateAppModuleManifest({ bundled, dev }, FLOW)).toThrow(AppModuleNotFoundError);
		expect(() => locateAppModuleManifest({ bundled, dev }, FLOW)).toThrow(bundled);
		expect(() => locateAppModuleManifest({ bundled, dev }, FLOW)).toThrow(dev);
		expect(() => locateAppModuleManifest({ bundled, dev }, FLOW)).toThrow('npm run bundle');
	});
});

describe('locating from a whole installed layout (default locations + lookup together)', () => {
	it('a published install: flow.cjs with app-module/ next to it resolves to that manifest', () => {
		const manifest = touch(`install/${FLOW.bundleDir}/manifest.json`);
		const bundleUrl = pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;
		expect(locateAppModuleManifest(defaultAppModuleLocations(bundleUrl, FLOW), FLOW)).toBe(manifest);
	});

	it('a source checkout: dist/cli/FlowIndex.js resolves to the sibling package dist-module', () => {
		const manifest = touch(`packages/${FLOW.sourcePackage}/dist-module/manifest.json`);
		const sourceUrl = pathToFileURL(path.join(dir, 'packages', 'flow-cli', 'dist', 'cli', 'FlowIndex.js')).href;
		expect(locateAppModuleManifest(defaultAppModuleLocations(sourceUrl, FLOW), FLOW)).toBe(manifest);
	});

	it('an install that lacks app-module/ (older package) is reported, not silently skipped', () => {
		touch('install/flow.cjs');
		const bundleUrl = pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;
		expect(() => locateAppModuleManifest(defaultAppModuleLocations(bundleUrl, FLOW), FLOW)).toThrow(
			AppModuleNotFoundError
		);
	});
});

describe('flow-chart layout', () => {
	it('bundle layout: app-module-flow-chart/ next to the CLI bundle file', () => {
		const bundleUrl = pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;
		expect(defaultAppModuleLocations(bundleUrl, FLOW_CHART).bundled).toBe(
			path.join(dir, 'install', FLOW_CHART.bundleDir, 'manifest.json')
		);
	});

	it('source layout: dist-module of the flow-chart source package', () => {
		const sourceUrl = pathToFileURL(path.join(dir, 'packages', 'flow-cli', 'dist', 'cli', 'FlowIndex.js')).href;
		expect(defaultAppModuleLocations(sourceUrl, FLOW_CHART).dev).toBe(
			path.join(dir, 'packages', FLOW_CHART.sourcePackage, 'dist-module', 'manifest.json')
		);
	});

	it('the not-found message names the module and the package to build', () => {
		const missing: AppModuleDescriptor = FLOW_CHART;
		const locations = { bundled: path.join(dir, 'a/manifest.json'), dev: path.join(dir, 'b/manifest.json') };
		expect(() => locateAppModuleManifest(locations, missing)).toThrow(FLOW_CHART.id);
		expect(() => locateAppModuleManifest(locations, missing)).toThrow(`packages/${FLOW_CHART.sourcePackage}`);
	});
});

describe('appCoreModuleOptions', () => {
	const bundleUrl = (): string => pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;

	it('returns both modules, flow first, from a complete install', () => {
		touch(`install/${FLOW.bundleDir}/manifest.json`);
		touch(`install/${FLOW_CHART.bundleDir}/manifest.json`);
		const errors: string[] = [];
		expect(appCoreModuleOptions(bundleUrl(), m => errors.push(m))).toEqual([
			{ id: FLOW.id, manifestPath: path.join(dir, 'install', FLOW.bundleDir, 'manifest.json') },
			{ id: FLOW_CHART.id, manifestPath: path.join(dir, 'install', FLOW_CHART.bundleDir, 'manifest.json') },
		]);
		expect(errors).toEqual([]);
	});

	it('reports a missing flow-chart (older install) and still returns flow', () => {
		touch(`install/${FLOW.bundleDir}/manifest.json`);
		const errors: string[] = [];
		const options = appCoreModuleOptions(bundleUrl(), m => errors.push(m));
		expect(options.map(o => o.id)).toEqual([FLOW.id]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain(FLOW_CHART.id);
	});

	it('reports a missing flow and still returns flow-chart (app-core then answers with its own reason)', () => {
		touch(`install/${FLOW_CHART.bundleDir}/manifest.json`);
		const errors: string[] = [];
		expect(appCoreModuleOptions(bundleUrl(), m => errors.push(m)).map(o => o.id)).toEqual([FLOW_CHART.id]);
		expect(errors).toHaveLength(1);
	});
});
