import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { describe, expect, it } from 'vitest';

import { classifyDaemonContactFailure, describeDaemonContactFailure, isDaemonUnavailable } from './DaemonContactFailure';

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

describe('classifyDaemonContactFailure', () => {
	it('classifies the kit "HTTP timeout" (mapped to DaemonNotRunningError) as a timeout, not as not-running', () => {
		const err = new DaemonNotRunningError('Daemon is not running (connection failed: HTTP timeout after 5s)');
		expect(classifyDaemonContactFailure(err)).toBe('timeout');
	});

	it('classifies a raw timeout error as a timeout', () => {
		expect(classifyDaemonContactFailure(new Error('Request Timeout'))).toBe('timeout');
	});

	it('classifies a refused or reset connection as not-running', () => {
		expect(classifyDaemonContactFailure(new DaemonNotRunningError('Daemon is not running (ECONNREFUSED)'))).toBe(
			'not-running'
		);
		expect(classifyDaemonContactFailure(errno('EPIPE', 'write EPIPE'))).toBe('not-running');
	});

	it('classifies an error the daemon returned as other', () => {
		expect(classifyDaemonContactFailure(new Error('Unknown command: resume'))).toBe('other');
	});
});

describe('describeDaemonContactFailure timeout', () => {
	it('says the daemon did not answer within 5 s, the request may have been received, and what to check', () => {
		const err = new DaemonNotRunningError('Daemon is not running (connection failed: HTTP timeout after 5s)');
		const text = describeDaemonContactFailure(err, {});
		expect(text.notRunning).toBe(false);
		expect(text.timedOut).toBe(true);
		expect(text.message).toContain('did not answer within 5 s');
		expect(text.message).toContain('may have been received');
		expect(text.message).toContain('flow status');
		expect(text.message).toContain('flow history');
		expect(text.message).not.toContain('not running');
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
