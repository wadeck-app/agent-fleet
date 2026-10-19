import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRemoteDaemonClient, isUnknownCommandError, outdatedDaemonMessage } from './RemoteDaemonClient.js';

const kit = vi.hoisted(() => ({ createDaemonClient: vi.fn() }));

vi.mock('@wadeck-app/singleton-daemon-kit', () => ({ createDaemonClient: kit.createDaemonClient }));

beforeEach(() => kit.createDaemonClient.mockReset());

describe('createRemoteDaemonClient', () => {
	it('builds a client for the given daemon directory with no local command implementation', () => {
		const client = { send: vi.fn() };
		kit.createDaemonClient.mockReturnValue(client);
		expect(createRemoteDaemonClient('/cfg/flow')).toBe(client);
		// An empty `commands` is the point: a local handler would answer in-process when no daemon runs.
		expect(kit.createDaemonClient).toHaveBeenCalledWith({ configDir: '/cfg/flow', commands: {} });
	});

	it('refuses an empty daemon directory instead of looking for a daemon in the working directory', () => {
		expect(() => createRemoteDaemonClient(' ')).toThrow(/non-empty daemon directory/);
		expect(kit.createDaemonClient).not.toHaveBeenCalled();
	});
});

describe('isUnknownCommandError', () => {
	it.each(['Unknown command: workers', 'unknown command "x"'])('recognises %s', message => {
		expect(isUnknownCommandError(message)).toBe(true);
	});

	it('ignores other failures', () => {
		expect(isUnknownCommandError('ECONNRESET')).toBe(false);
	});
});

describe('outdatedDaemonMessage', () => {
	it('names the command and tells how to restart the daemon', () => {
		const message = outdatedDaemonMessage('flow worker list');
		expect(message).toContain('does not support "flow worker list"');
		expect(message).toContain('"flow stop" then "flow start"');
		expect(message).toContain('"flow cli update"');
	});
});
