import { describe, expect, it, vi } from 'vitest';

import { DAEMON_STOPPING_CODE } from '../ipc/Protocol';
import type { DaemonIdleShutdown } from './DaemonIdleShutdown';
import { guardRunAgainstStop } from './StoppingDaemonRunGuard';

type Commands = Record<string, (payload: unknown) => Promise<unknown> | unknown>;

/** Admission as DaemonIdleShutdown.admit does it, with the stopping decision under the test's control. */
function admission(stopping: boolean): Pick<DaemonIdleShutdown, 'admit'> {
	return {
		admit: async <T>(work: () => Promise<T> | T, refusal: () => T): Promise<T> => {
			return stopping ? refusal() : await work();
		},
	};
}

describe('guardRunAgainstStop', () => {
	it('runs the command of a daemon that is not stopping', async () => {
		const run = vi.fn(() => Promise.resolve({ type: 'execution_started', executionId: 'e1' }));
		const guarded = guardRunAgainstStop({ run } as Commands, admission(false));

		expect(await guarded['run']!({ a: 1 })).toEqual({ type: 'execution_started', executionId: 'e1' });
		expect(run).toHaveBeenCalledWith({ a: 1 });
	});

	it('answers a stopping daemon with a typed refusal that tells the client to start another daemon', async () => {
		const run = vi.fn();
		const guarded = guardRunAgainstStop({ run } as Commands, admission(true));

		const response = (await guarded['run']!({})) as { type: string; code: string; message: string };

		expect(run).not.toHaveBeenCalled();
		expect(response.type).toBe('error');
		expect(response.code).toBe(DAEMON_STOPPING_CODE);
		expect(response.message).toContain('stopping');
	});

	it('leaves the other commands untouched', () => {
		const workers = vi.fn();
		const guarded = guardRunAgainstStop({ run: vi.fn(), workers } as Commands, admission(true));

		expect(guarded['workers']).toBe(workers);
	});

	it('fails loudly when the table has no run command to guard', () => {
		expect(() => guardRunAgainstStop({} as Commands, admission(false))).toThrow(/run/);
	});
});
