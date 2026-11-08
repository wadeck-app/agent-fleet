import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { DEAD_APP_CORE_PORT, type IsolatedCliEnv, UNREACHABLE_REGISTRY, createIsolatedCliEnv } from './IsolatedCliEnv';

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
			// A spawned CLI that starts a daemon writes its launcher script to os.tmpdir() (TEMP/TMP on Windows, TMPDIR elsewhere).
			'TEMP',
			'TMP',
			'TMPDIR',
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

	it('switches the queue events off, so a spawned daemon never declares events to the real queue', () => {
		iso = createIsolatedCliEnv();
		expect(iso.env['FLOW_QUEUE_EVENTS']).toBe('0');
	});

	it('does not let the parent shell turn the queue events back on', () => {
		process.env['FLOW_QUEUE_EVENTS'] = '1';
		iso = createIsolatedCliEnv();
		expect(iso.env['FLOW_QUEUE_EVENTS']).toBe('0');
	});

	it('keeps the queue events on only when the test asks for it (it must then point at a fake queue)', () => {
		iso = createIsolatedCliEnv({ queueEvents: true });
		expect(iso.env['FLOW_QUEUE_EVENTS']).toBe('1');
	});

	it('applies extra entries last', () => {
		iso = createIsolatedCliEnv({ extra: { UPDATER_FORCE: '1' } });
		expect(iso.env['UPDATER_FORCE']).toBe('1');
	});
});

describe('createIsolatedCliEnv app-core registration', () => {
	const saved = { ...process.env };
	let iso: IsolatedCliEnv | undefined;

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

	// A daemon started from a source checkout registers its dev modules with app-core: the SDK targets
	// APP_CORE_PORT (else 4850) and APP_CORE_CONFIG_DIR (else ~/.config/app-core).
	it('cannot reach the real app-core: private config dir that does not exist, and a port nothing listens on', () => {
		process.env['APP_CORE_PORT'] = '4850';
		process.env['APP_CORE_CONFIG_DIR'] = 'C:/real/app-core';
		iso = createIsolatedCliEnv();
		expect(iso.env['APP_CORE_CONFIG_DIR']?.startsWith(iso.root)).toBe(true);
		expect(existsSync(iso.env['APP_CORE_CONFIG_DIR'] as string)).toBe(false);
		expect(iso.env['APP_CORE_PORT']).toBe(DEAD_APP_CORE_PORT);
		expect(DEAD_APP_CORE_PORT).not.toBe('4850');
	});

	it('lets the caller opt back in through `extra` (a test against a FAKE app-core)', () => {
		iso = createIsolatedCliEnv({ extra: { APP_CORE_PORT: '54321' } });
		expect(iso.env['APP_CORE_PORT']).toBe('54321');
	});
});
