import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { installWorkerCrashHandlers } from './WorkerCrashHandlers';

function setup() {
	const proc = new EventEmitter();
	const writeStderr = vi.fn();
	const exit = vi.fn();
	installWorkerCrashHandlers(proc, writeStderr, exit);
	return { proc, writeStderr, exit };
}

describe('installWorkerCrashHandlers', () => {
	// The daemon keeps the last stderr lines of a dead worker; without a line here the log says nothing.
	it('writes the stack of an uncaught exception to stderr, then exits 1', () => {
		const { proc, writeStderr, exit } = setup();

		proc.emit('uncaughtException', new Error('kaboom'));

		const written = String(writeStderr.mock.calls[0]?.[0]);
		expect(written).toMatch(/uncaughtException/);
		expect(written).toMatch(/kaboom/);
		expect(exit).toHaveBeenCalledWith(1);
		expect(writeStderr.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0]!);
	});

	it('writes an unhandled rejection reason to stderr, then exits 1', () => {
		const { proc, writeStderr, exit } = setup();

		proc.emit('unhandledRejection', new Error('nope'), Promise.resolve());

		expect(String(writeStderr.mock.calls[0]?.[0])).toMatch(/unhandledRejection.*nope/s);
		expect(exit).toHaveBeenCalledWith(1);
	});

	it('handles a non-Error rejection reason', () => {
		const { proc, writeStderr } = setup();

		proc.emit('unhandledRejection', 'plain string', Promise.resolve());

		expect(String(writeStderr.mock.calls[0]?.[0])).toMatch(/plain string/);
	});

	it.each([
		['SIGTERM', 143],
		['SIGINT', 130],
	])('records %s on stderr and exits %i', (signal, code) => {
		const { proc, writeStderr, exit } = setup();

		proc.emit(signal);

		expect(String(writeStderr.mock.calls[0]?.[0])).toMatch(new RegExp(`received ${signal}`));
		expect(exit).toHaveBeenCalledWith(code);
	});
});
