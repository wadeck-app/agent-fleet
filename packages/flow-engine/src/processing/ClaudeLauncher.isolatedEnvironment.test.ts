import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { ClaudeLauncher } from './ClaudeLauncher';

/**
 * Claude is started with an allow-listed environment that includes the host's ANTHROPIC_API_KEY. A launcher that runs the
 * process somewhere the host's environment must not reach (a sandbox) declares isolatesEnvironment, and then the host's
 * provider credential is not forwarded: the sandbox gets its own through options.env. The host launcher is unchanged.
 * (Codex and OpenCode forward only infrastructure variables and options.env, never a provider credential.)
 */

const KEY = 'sk-ant-host-credential-123456';
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = {
		ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
		CLAUDE_MOCK_PATH: process.env['CLAUDE_MOCK_PATH'],
	};
	process.env['ANTHROPIC_API_KEY'] = KEY;
	process.env['CLAUDE_MOCK_PATH'] = '/mock/claude';
});

afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

async function spawnEnv(
	launcher: FakeProcessLauncher,
	mode: 'background' | 'interactive',
	env?: Record<string, string>
): Promise<Record<string, string>> {
	const child = createFakeChild(888);
	launcher.queueChild(child);
	const options = { workingDir: '/work', prompt: 'hi', stepId: 's1', ...(env === undefined ? {} : { env }) };
	const instance = new ClaudeLauncher(launcher);
	const done = mode === 'background' ? instance.launchBackground(options) : instance.launchInteractive(options);
	child.emit('close', 0);
	await done;
	return launcher.callsOf('spawn')[0]!.options.env as Record<string, string>;
}

describe.each(['background', 'interactive'] as const)('Claude launched %s', mode => {
	it('gets the host ANTHROPIC_API_KEY through a launcher that does not isolate the environment (as today)', async () => {
		const env = await spawnEnv(new FakeProcessLauncher(), mode);

		expect(env['ANTHROPIC_API_KEY']).toBe(KEY);
	});

	it('does not get it through a launcher that declares isolatesEnvironment', async () => {
		const env = await spawnEnv(new FakeProcessLauncher({ isolatesEnvironment: true }), mode);

		expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
		expect(Object.values(env)).not.toContain(KEY);
	});

	it('still gets the credential the step or the sandbox supplies in options.env', async () => {
		const env = await spawnEnv(new FakeProcessLauncher({ isolatesEnvironment: true }), mode, {
			ANTHROPIC_API_KEY: 'sandbox-own-key',
		});

		expect(env['ANTHROPIC_API_KEY']).toBe('sandbox-own-key');
	});

	it('keeps the rest of the allow-list under an isolating launcher: PATH and HOME', async () => {
		const env = await spawnEnv(new FakeProcessLauncher({ isolatesEnvironment: true }), mode);

		expect(env['PATH'] ?? env['Path']).toBeDefined();
	});
});
