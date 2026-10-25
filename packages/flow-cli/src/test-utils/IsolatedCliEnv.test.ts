import { homedir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { type IsolatedCliEnv, UNREACHABLE_REGISTRY, createIsolatedCliEnv } from './IsolatedCliEnv';

describe('createIsolatedCliEnv', () => {
	let iso: IsolatedCliEnv | undefined;
	const saved = { ...process.env };

	afterEach(() => {
		iso?.cleanup();
		iso = undefined;
		for (const key of Object.keys(process.env)) {
			if (!(key in saved)) {
				delete process.env[key];
			}
		}
		Object.assign(process.env, saved);
	});

	it('points every home / config / npm location into the throwaway tree and the registry at nothing', () => {
		iso = createIsolatedCliEnv();
		const { env } = iso;
		for (const key of [
			'FLOW_CONFIG_DIR',
			'XDG_CONFIG_HOME',
			'HOME',
			'USERPROFILE',
			'APPDATA',
			'NPM_CONFIG_PREFIX',
			'NPM_CONFIG_CACHE',
			'NPM_CONFIG_USERCONFIG',
		]) {
			const value = env[key];
			expect(value, key).toBeDefined();
			expect(value?.startsWith(iso.root), `${key}=${value}`).toBe(true);
		}
		expect(env['NPM_CONFIG_REGISTRY']).toBe(UNREACHABLE_REGISTRY);
		expect(env['HOME']).not.toBe(homedir());
	});

	it('strips leaked UPDATER_*, LAUNCHER_* and npm_config_* variables from the parent, whatever their case', () => {
		process.env['UPDATER_FORCE'] = '1';
		process.env['LAUNCHER_BUNDLE_OVERRIDE'] = '/real/flow.cjs';
		process.env['npm_config_prefix'] = '/real/prefix';
		iso = createIsolatedCliEnv();
		expect(iso.env['UPDATER_FORCE']).toBeUndefined();
		expect(iso.env['LAUNCHER_BUNDLE_OVERRIDE']).toBeUndefined();
		expect(iso.env['npm_config_prefix']).toBeUndefined();
		expect(iso.env['NPM_CONFIG_PREFIX']).toBe(iso.npmPrefix);
	});

	it('applies extra entries last', () => {
		iso = createIsolatedCliEnv({ extra: { UPDATER_FORCE: '1' } });
		expect(iso.env['UPDATER_FORCE']).toBe('1');
	});
});
