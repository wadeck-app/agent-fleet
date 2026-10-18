import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	AppModuleNotFoundError,
	appCoreModuleOption,
	defaultAppModuleLocations,
	locateAppModuleManifest,
} from './AppModuleLocator.js';

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
		expect(defaultAppModuleLocations(bundleUrl).bundled).toBe(
			path.join(dir, 'install', 'app-module', 'manifest.json')
		);
	});

	it('source layout: dist-module of the sibling package, three levels up from dist/cli/FlowIndex.js', () => {
		const sourceUrl = pathToFileURL(path.join(dir, 'packages', 'flow-cli', 'dist', 'cli', 'FlowIndex.js')).href;
		expect(defaultAppModuleLocations(sourceUrl).dev).toBe(
			path.join(dir, 'packages', 'app-module-flow', 'dist-module', 'manifest.json')
		);
	});
});

describe('appCoreModuleOption', () => {
	it('returns the manifest to register when the module is built', () => {
		const bundled = touch('bundle/app-module/manifest.json');
		const errors: string[] = [];
		expect(appCoreModuleOption({ bundled, dev: 'unused' }, m => errors.push(m))).toEqual({ manifestPath: bundled });
		expect(errors).toEqual([]);
	});

	it('reports the problem and returns undefined (the daemon still starts) when the module is not built', () => {
		const errors: string[] = [];
		const option = appCoreModuleOption(
			{ bundled: path.join(dir, 'a/manifest.json'), dev: path.join(dir, 'b/manifest.json') },
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
		const bundled = touch('bundle/app-module/manifest.json');
		const dev = touch('dev/dist-module/manifest.json');
		expect(locateAppModuleManifest({ bundled, dev })).toBe(bundled);
	});

	it('falls back to the packaged module of the sibling package in a source checkout', () => {
		const dev = touch('dev/dist-module/manifest.json');
		expect(locateAppModuleManifest({ bundled: path.join(dir, 'missing/manifest.json'), dev })).toBe(dev);
	});

	it('throws naming both locations and the command that builds the module when neither exists', () => {
		const bundled = path.join(dir, 'missing-a/manifest.json');
		const dev = path.join(dir, 'missing-b/manifest.json');
		expect(() => locateAppModuleManifest({ bundled, dev })).toThrow(AppModuleNotFoundError);
		expect(() => locateAppModuleManifest({ bundled, dev })).toThrow(bundled);
		expect(() => locateAppModuleManifest({ bundled, dev })).toThrow(dev);
		expect(() => locateAppModuleManifest({ bundled, dev })).toThrow('npm run bundle');
	});
});

describe('locating from a whole installed layout (default locations + lookup together)', () => {
	it('a published install: flow.cjs with app-module/ next to it resolves to that manifest', () => {
		const manifest = touch('install/app-module/manifest.json');
		const bundleUrl = pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;
		expect(locateAppModuleManifest(defaultAppModuleLocations(bundleUrl))).toBe(manifest);
	});

	it('a source checkout: dist/cli/FlowIndex.js resolves to the sibling package dist-module', () => {
		const manifest = touch('packages/app-module-flow/dist-module/manifest.json');
		const sourceUrl = pathToFileURL(path.join(dir, 'packages', 'flow-cli', 'dist', 'cli', 'FlowIndex.js')).href;
		expect(locateAppModuleManifest(defaultAppModuleLocations(sourceUrl))).toBe(manifest);
	});

	it('an install that lacks app-module/ (older package) is reported, not silently skipped', () => {
		touch('install/flow.cjs');
		const bundleUrl = pathToFileURL(path.join(dir, 'install', 'flow.cjs')).href;
		expect(() => locateAppModuleManifest(defaultAppModuleLocations(bundleUrl))).toThrow(AppModuleNotFoundError);
	});
});
