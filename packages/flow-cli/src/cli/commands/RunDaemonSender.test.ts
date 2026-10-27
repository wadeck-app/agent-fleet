import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientCommand } from '../../ipc/Protocol';
import { DAEMON_CONTACT_ATTEMPTS, DaemonContactError, sendToDaemon } from './RunDaemonSender';

const harness = vi.hoisted(() => ({ send: vi.fn(), spawn: vi.fn() }));

vi.mock('flow-core', () => ({ createRemoteDaemonClient: () => ({ send: harness.send }) }));
vi.mock('./DaemonBackgroundSpawner', () => ({ spawnDaemonBackground: harness.spawn }));

const cmd = { type: 'run', flowFile: 'f.yml', inputs: {}, cwd: '/' } as Extract<ClientCommand, { type: 'run' }>;
/** Backoff shrunk so the retries cost nothing. */
const fast = { backoffMs: 1 };
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

	it('names the cause and the log, and prints no stack, when the daemon cannot be started', async () => {
		harness.send.mockRejectedValue(new DaemonNotRunningError('/dir'));
		harness.spawn.mockRejectedValue(new Error('no start'));
		await expect(sendToDaemon(cmd, '/dir', fast)).rejects.toBeInstanceOf(ExitSignal);
		const printed = vi
			.mocked(console.error)
			.mock.calls.map(call => call.map(String).join(' '))
			.join('\n');
		expect(printed).toContain('no start');
		expect(printed).toContain('flow logs');
		expect(printed).not.toMatch(/\n\s+at /);
	});

	// The daemon of the previous run stops itself about a second after its last execution; a run issued right then
	// reaches a listener that is closing. Node reports that as "socket hang up" (code ECONNRESET, message without it)
	// or "write EPIPE": the kit only maps messages containing ECONNREFUSED/ECONNRESET/timeout.
	it.each([
		['socket hang up', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
		['EPIPE', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })],
		['ECONNREFUSED', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' })],
		['an aborted request', Object.assign(new Error('aborted'), { code: 'ECONNABORTED' })],
	])('treats %s from a closing daemon as "not running": starts a daemon and sends again', async (_label, failure) => {
		harness.send.mockRejectedValueOnce(failure).mockResolvedValueOnce(started);

		expect(await sendToDaemon(cmd, '/dir', fast)).toBe(started);
		expect(harness.spawn).toHaveBeenCalledWith('/dir');
	});

	it('treats a daemon that answers "stopping" as not running: waits for it to be gone, starts another, sends again', async () => {
		const stopping = { type: 'error', code: 'DAEMON_STOPPING', message: 'the daemon is stopping' };
		harness.send
			.mockResolvedValueOnce(stopping)
			.mockResolvedValueOnce(stopping)
			.mockRejectedValueOnce(new DaemonNotRunningError('/dir'))
			.mockResolvedValueOnce(started);

		expect(await sendToDaemon(cmd, '/dir', fast)).toBe(started);
		expect(harness.send).toHaveBeenCalledTimes(4);
		expect(harness.spawn).toHaveBeenCalledTimes(3);
	});

	it('does not retry an error the daemon itself returned for the run (a refusal is not an outage)', async () => {
		harness.send.mockRejectedValue(new Error('"x/.flow/config.yml" is no longer read'));

		await expect(sendToDaemon(cmd, '/dir', fast)).rejects.toThrow('no longer read');
		expect(harness.send).toHaveBeenCalledTimes(1);
		expect(harness.spawn).not.toHaveBeenCalled();
	});

	// The daemon is up (started by this very call) and refuses the run: that is an answer, not "the daemon could not be
	// started" (exit 3 with the raw stack of the error), which is what the message used to be wrapped in.
	it('rethrows the refusal of a daemon this call had to start, instead of reporting a start failure', async () => {
		const refusal = new Error('"x/.flow/config.yml" is no longer read: ... Move it: mv a b');
		harness.send.mockRejectedValueOnce(new DaemonNotRunningError('/dir')).mockRejectedValueOnce(refusal);

		await expect(sendToDaemon(cmd, '/dir', fast)).rejects.toBe(refusal);
		expect(process.exit).not.toHaveBeenCalled();
	});

	it('does not retry a typed refusal either', async () => {
		const refusal = { type: 'error', code: 'VALIDATION_FAILED', message: 'bad flow' };
		harness.send.mockResolvedValue(refusal);

		expect(await sendToDaemon(cmd, '/dir', fast)).toBe(refusal);
		expect(harness.send).toHaveBeenCalledTimes(1);
	});

	it('gives up after a bounded number of attempts with what was tried, the port and the log', async () => {
		const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
		harness.send.mockRejectedValue(reset);

		const failure = await sendToDaemon(cmd, '/dir', fast).catch((e: unknown) => e);

		expect(failure).toBeInstanceOf(DaemonContactError);
		const message = (failure as DaemonContactError).message;
		expect(message).toContain('socket hang up');
		expect(message).toContain(`${String(DAEMON_CONTACT_ATTEMPTS)} attempts`);
		expect(message).toContain('flow logs');
		expect(message).toContain('flow start');
		expect(harness.send).toHaveBeenCalledTimes(DAEMON_CONTACT_ATTEMPTS);
	});
});

describe('sendToDaemon request id (a retry must not start a second execution)', () => {
	function sentIds(): unknown[] {
		return harness.send.mock.calls.map(call => (call[1] as { requestId?: string }).requestId);
	}

	it('sends a request id on the first attempt', async () => {
		harness.send.mockResolvedValue(started);

		await sendToDaemon(cmd, '/dir', fast);

		expect(sentIds()).toEqual([expect.any(String)]);
		expect((sentIds()[0] as string).length).toBeGreaterThan(8);
	});

	it('sends the same id again after a timeout-like failure, then succeeds', async () => {
		// The kit turns "HTTP timeout after 5s" into DaemonNotRunningError.
		harness.send.mockRejectedValueOnce(new DaemonNotRunningError('/dir')).mockResolvedValueOnce(started);

		expect(await sendToDaemon(cmd, '/dir', fast)).toBe(started);

		const ids = sentIds();
		expect(ids).toHaveLength(2);
		expect(ids[1]).toBe(ids[0]);
	});

	it('carries the same id on every attempt', async () => {
		harness.send.mockRejectedValue(new DaemonNotRunningError('/dir'));

		await sendToDaemon(cmd, '/dir', fast).catch(() => undefined);

		expect(new Set(sentIds()).size).toBe(1);
		expect(sentIds()).toHaveLength(DAEMON_CONTACT_ATTEMPTS);
	});

	it('uses a different id for each invocation', async () => {
		harness.send.mockResolvedValue(started);

		await sendToDaemon(cmd, '/dir', fast);
		await sendToDaemon(cmd, '/dir', fast);

		const ids = sentIds();
		expect(ids[1]).not.toBe(ids[0]);
	});

	it('keeps an id the caller already chose', async () => {
		harness.send.mockResolvedValue(started);

		await sendToDaemon({ ...cmd, requestId: 'chosen' }, '/dir', fast);

		expect(sentIds()).toEqual(['chosen']);
	});
});
