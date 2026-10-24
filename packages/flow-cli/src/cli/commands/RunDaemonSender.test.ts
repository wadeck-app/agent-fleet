import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientCommand } from '../../ipc/Protocol';
import { sendToDaemon } from './RunDaemonSender';

const harness = vi.hoisted(() => ({ send: vi.fn(), spawn: vi.fn() }));

vi.mock('flow-core', () => ({ createRemoteDaemonClient: () => ({ send: harness.send }) }));
vi.mock('./DaemonBackgroundSpawner', () => ({ spawnDaemonBackground: harness.spawn }));

const cmd = { type: 'run', flowFile: 'f.yml', inputs: {}, cwd: '/' } as Extract<ClientCommand, { type: 'run' }>;
const started = { type: 'execution_started', executionId: 'abcd1234' };

class ExitSignal extends Error {}

beforeEach(() => {
	harness.send.mockReset();
	harness.spawn.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(process, 'exit').mockImplementation((() => {
		throw new ExitSignal();
	}) as typeof process.exit);
});

describe('sendToDaemon', () => {
	it('returns the response without spawning when the daemon is running', async () => {
		harness.send.mockResolvedValue(started);
		expect(await sendToDaemon(cmd, '/dir')).toBe(started);
		expect(harness.spawn).not.toHaveBeenCalled();
	});

	it('rethrows errors other than DaemonNotRunningError', async () => {
		harness.send.mockRejectedValue(new Error('boom'));
		await expect(sendToDaemon(cmd, '/dir')).rejects.toThrow('boom');
	});

	it('starts the daemon and retries on ECONNRESET until it accepts', async () => {
		const reset = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
		harness.send
			.mockRejectedValueOnce(new DaemonNotRunningError('/dir'))
			.mockRejectedValueOnce(reset)
			.mockResolvedValueOnce(started);
		expect(await sendToDaemon(cmd, '/dir')).toBe(started);
		expect(harness.spawn).toHaveBeenCalledWith('/dir');
	});

	it('exits 3 when the daemon cannot be started', async () => {
		harness.send.mockRejectedValue(new DaemonNotRunningError('/dir'));
		harness.spawn.mockRejectedValue(new Error('no start'));
		await expect(sendToDaemon(cmd, '/dir')).rejects.toBeInstanceOf(ExitSignal);
		expect(process.exit).toHaveBeenCalledWith(3);
	});
});
