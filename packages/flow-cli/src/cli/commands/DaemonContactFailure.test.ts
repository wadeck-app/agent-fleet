import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { describe, expect, it } from 'vitest';

import { describeDaemonContactFailure, isDaemonUnavailable } from './DaemonContactFailure';

const errno = (code: string, message: string): Error => Object.assign(new Error(message), { code });

describe('isDaemonUnavailable', () => {
	it.each(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE'])('treats %s as no daemon serving', code => {
		expect(isDaemonUnavailable(errno(code, 'x'))).toBe(true);
	});

	it('treats DaemonNotRunningError as no daemon serving', () => {
		expect(isDaemonUnavailable(new DaemonNotRunningError('Daemon is not running'))).toBe(true);
	});

	it('does not treat an error the daemon itself returned as unavailable', () => {
		expect(isDaemonUnavailable(new Error('No such execution'))).toBe(false);
		expect(isDaemonUnavailable(errno('ENOENT', 'x'))).toBe(false);
	});
});

describe('describeDaemonContactFailure', () => {
	it('says the daemon is not running, with the command to start it, when none serves', () => {
		const text = describeDaemonContactFailure(errno('EPIPE', 'write EPIPE'), {});
		expect(text.notRunning).toBe(true);
		expect(text.message).toContain('The daemon is not running');
		expect(text.message).toContain('flow start');
	});

	it('prints the real cause and where to look for any other failure', () => {
		const text = describeDaemonContactFailure(new Error('Unknown command: resume'), {});
		expect(text.notRunning).toBe(false);
		expect(text.message).toContain('Unknown command: resume');
		expect(text.message).toContain('flow logs');
		expect(text.message).not.toContain('Failed to contact the daemon.\n');
	});

	it('adds the stack only under FLOW_DEBUG=1', () => {
		const err = new Error('relayed');
		expect(describeDaemonContactFailure(err, {}).message).not.toMatch(/\bat .*:\d+:\d+/);
		expect(describeDaemonContactFailure(err, { FLOW_DEBUG: '1' }).message).toMatch(/\bat .*:\d+:\d+/);
	});
});
