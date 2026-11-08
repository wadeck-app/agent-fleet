import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DaemonIsolationGuard } from './DaemonIsolationGuard';
import { eachRow } from './EachRow';

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function scratch(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-guard-test-'));
	directories.push(directory);
	return directory;
}

const REAL_HOME = path.resolve('/real-home');

/** The environment createIsolatedCliEnv builds, plus FLOW_DAEMON_PORT=0, for a root. */
function isolatedEnv(root: string): NodeJS.ProcessEnv {
	const home = path.join(root, 'home');
	return {
		HOME: home,
		USERPROFILE: home,
		APPDATA: path.join(home, 'AppData', 'Roaming'),
		LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
		FLOW_CONFIG_DIR: path.join(home, '.config', 'flow'),
		XDG_CONFIG_HOME: path.join(home, '.config'),
		APP_CORE_CONFIG_DIR: path.join(home, '.config', 'app-core'),
		APP_CORE_PORT: '1',
		FLOW_DAEMON_PORT: '0',
	};
}

describe('DaemonIsolationGuard', () => {
	it('accepts the environment of createIsolatedCliEnv with FLOW_DAEMON_PORT=0', () => {
		const root = scratch();

		expect(
			DaemonIsolationGuard.problems({ env: isolatedEnv(root), isolatedRoot: root, realHome: REAL_HOME })
		).toEqual([]);
		expect(() =>
			DaemonIsolationGuard.assert({ env: isolatedEnv(root), isolatedRoot: root, realHome: REAL_HOME })
		).not.toThrow();
	});

	it('refuses, naming the variable, every way the daemon could reach the real user state or the user daemon port', async () => {
		const root = scratch();
		const realAppCore = path.join(REAL_HOME, '.config', 'app-core');
		const existing = scratch();
		await eachRow<[string, Partial<Record<string, string | undefined>>, RegExp]>(
			[
				['the real HOME', { HOME: REAL_HOME }, /HOME is .*outside the isolated root/],
				['the real USERPROFILE', { USERPROFILE: REAL_HOME }, /USERPROFILE is .*outside the isolated root/],
				['the real APPDATA', { APPDATA: path.join(REAL_HOME, 'AppData', 'Roaming') }, /APPDATA is .*outside/],
				[
					'the real LOCALAPPDATA',
					{ LOCALAPPDATA: path.join(REAL_HOME, 'AppData', 'Local') },
					/LOCALAPPDATA is .*outside/,
				],
				['no HOME', { HOME: undefined }, /HOME is not set/],
				[
					'the real flow config dir',
					{ FLOW_CONFIG_DIR: path.join(REAL_HOME, '.config', 'flow') },
					/FLOW_CONFIG_DIR is .*outside/,
				],
				[
					'the real project registry home',
					{ XDG_CONFIG_HOME: path.join(REAL_HOME, '.config') },
					/XDG_CONFIG_HOME is .*outside/,
				],
				['a sibling that only shares the prefix', { HOME: `${root}-other` }, /HOME is .*outside/],
				['no app-core directory', { APP_CORE_CONFIG_DIR: undefined }, /APP_CORE_CONFIG_DIR is not set/],
				[
					'the real app-core directory',
					{ APP_CORE_CONFIG_DIR: realAppCore },
					/APP_CORE_CONFIG_DIR is .*outside[\s\S]*real/,
				],
				[
					'an existing app-core directory',
					{ APP_CORE_CONFIG_DIR: path.join(existing) },
					/outside the isolated root/,
				],
				['no app-core port', { APP_CORE_PORT: undefined }, /APP_CORE_PORT is not set/],
				['the app-core default port', { APP_CORE_PORT: '4850' }, /APP_CORE_PORT is 4850/],
				['a bad app-core port', { APP_CORE_PORT: 'abc' }, /APP_CORE_PORT "abc" is not a port/],
				['no daemon port', { FLOW_DAEMON_PORT: undefined }, /FLOW_DAEMON_PORT is not set/],
				[
					'a daemon port in the standard range',
					{ FLOW_DAEMON_PORT: '47824' },
					/FLOW_DAEMON_PORT 47824 is in the standard range/,
				],
				['a bad daemon port', { FLOW_DAEMON_PORT: '99999' }, /FLOW_DAEMON_PORT "99999" is not a port/],
			],
			(_name, overrides, expected) => {
				const env = { ...isolatedEnv(root), ...overrides };
				for (const [key, value] of Object.entries(overrides)) if (value === undefined) delete env[key];

				const problems = DaemonIsolationGuard.problems({ env, isolatedRoot: root, realHome: REAL_HOME });

				expect(problems.join('\n')).toMatch(expected);
				expect(() => DaemonIsolationGuard.assert({ env, isolatedRoot: root, realHome: REAL_HOME })).toThrow(
					/Refusing to start a flow daemon[\s\S]*createIsolatedCliEnv/
				);
			}
		);
	});

	it('refuses an app-core config directory that exists under the isolated root, and an app-core port recorded by the real app-core', () => {
		const root = scratch();
		const env = isolatedEnv(root);
		fs.mkdirSync(env['APP_CORE_CONFIG_DIR'] as string, { recursive: true });
		const home = scratch();
		fs.mkdirSync(path.join(home, '.config', 'app-core'), { recursive: true });
		fs.writeFileSync(path.join(home, '.config', 'app-core', 'server.port.json'), JSON.stringify({ port: 5123 }));

		expect(DaemonIsolationGuard.problems({ env, isolatedRoot: root, realHome: REAL_HOME }).join('\n')).toMatch(
			/APP_CORE_CONFIG_DIR .* exists/
		);
		expect(
			DaemonIsolationGuard.problems({
				env: { ...isolatedEnv(root), APP_CORE_PORT: '5123' },
				isolatedRoot: root,
				realHome: home,
			}).join('\n')
		).toMatch(/APP_CORE_PORT is 5123, the port the real app-core recorded/);
	});
});
