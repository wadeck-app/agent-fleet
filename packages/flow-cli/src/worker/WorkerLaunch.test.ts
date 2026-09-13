import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	buildRegistration,
	reconnectDelayMs,
	resolveDaemonWsUrl,
	resolveExtraProjects,
	resolveSourceId,
	resolveWorkerToken,
	scheduleReconnectTimer,
	withFreshToken,
} from './WorkerLaunch.js';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'worker-launch-'));
	delete process.env['FLOW_WORKER_TOKEN'];
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env['FLOW_WORKER_TOKEN'];
});

describe('resolveDaemonWsUrl', () => {
	// The daemon's listener retries upward on EADDRINUSE, so the bound port is not
	// reliably httpPort+1. Only the port the daemon published is trustworthy.
	it('uses the port the daemon published', () => {
		writeFileSync(join(dir, 'config.port'), JSON.stringify({ port: 4100 }), 'utf8');
		writeFileSync(join(dir, 'worker.port'), JSON.stringify({ port: 4107 }), 'utf8');

		expect(resolveDaemonWsUrl(dir, null)).toBe('ws://127.0.0.1:4107');
	});

	it('prefers an explicitly configured ws port', () => {
		writeFileSync(join(dir, 'worker.port'), JSON.stringify({ port: 4101 }), 'utf8');

		expect(resolveDaemonWsUrl(dir, 9999)).toBe('ws://127.0.0.1:9999');
	});

	// A worker cannot invent the port: without the daemon there is nothing to join.
	it('fails with an actionable message when the daemon is not running', () => {
		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/daemon/i);
		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/flow start/);
	});

	// Never guessed from the http port: dialling a port nothing published means dialling
	// whatever else happens to hold it.
	it('fails while the daemon is up but its listener is not bound yet', () => {
		writeFileSync(join(dir, 'config.port'), JSON.stringify({ port: 4100 }), 'utf8');

		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/not accepting workers yet/i);
	});

	it('fails loudly when the port file is unreadable rather than guessing', () => {
		writeFileSync(join(dir, 'worker.port'), 'not json', 'utf8');

		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/worker\.port/);
	});
});

describe('resolveWorkerToken', () => {
	it('prefers an explicit token', () => {
		expect(resolveWorkerToken({ token: 'explicit' }, dir)).toBe('explicit');
	});

	it('falls back to the environment', () => {
		process.env['FLOW_WORKER_TOKEN'] = 'from-env';
		expect(resolveWorkerToken({}, dir)).toBe('from-env');
	});

	// A loopback worker with no source uses the daemon's own credential.
	it('falls back to the daemon health token', () => {
		writeFileSync(join(dir, 'health_token'), 'daemon-token\n', 'utf8');
		expect(resolveWorkerToken({}, dir)).toBe('daemon-token');
	});

	it('explains what to pass when no credential can be found', () => {
		expect(() => resolveWorkerToken({}, dir)).toThrow(/--token|FLOW_WORKER_TOKEN/);
	});

	it('requires an explicit token when a source is named', () => {
		writeFileSync(join(dir, 'health_token'), 'daemon-token\n', 'utf8');

		// The daemon token is not a source credential, so falling back to it would be wrong.
		expect(() => resolveWorkerToken({ sourceId: 'laptop' }, dir)).toThrow(/laptop/);
	});
});

describe('buildRegistration', () => {
	it('attaches the launch project by default (D#9)', () => {
		const reg = buildRegistration({ projectRoot: 'C:/proj', isTty: false, canPrompt: false, pid: 7 });

		expect(reg.attachedProjects).toEqual(['C:/proj']);
	});

	it('adds explicitly requested projects without dropping the launch one', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/proj',
			extraProjects: ['C:/other'],
			isTty: false,
			canPrompt: false,
			pid: 7,
		});

		expect(reg.attachedProjects).toEqual(['C:/proj', 'C:/other']);
	});

	it('does not duplicate the launch project if it is also passed explicitly', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/proj',
			extraProjects: ['C:/proj'],
			isTty: false,
			canPrompt: false,
			pid: 7,
		});

		expect(reg.attachedProjects).toEqual(['C:/proj']);
	});

	// D#33/D#36: only the worker can know whether a human is attached.
	it('reports a user interface when there is a TTY and a way to prompt', () => {
		const reg = buildRegistration({ projectRoot: 'C:/p', isTty: true, canPrompt: true, pid: 1 });

		expect(reg.hasUserInterface).toBe(true);
	});

	it('reports none without a TTY when the way to prompt needs one', () => {
		const reg = buildRegistration({ projectRoot: 'C:/p', isTty: false, canPrompt: true, pid: 1 });

		expect(reg.hasUserInterface).toBe(false);
	});

	// A TTY is what cli-approval needs, not what "a human can answer" means. file-approval takes
	// its answer from a file, so a worker with no terminal can still honour an interactive step --
	// which is the only way an automated agent or a remote reviewer can answer one.
	it('reports a user interface without a TTY when prompting does not need one', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/p',
			isTty: false,
			canPrompt: true,
			promptNeedsTerminal: false,
			pid: 1,
		});

		expect(reg.hasUserInterface).toBe(true);
	});

	// Absent means "assume a terminal is required": a third-party provider written against v1 of
	// the contract cannot suddenly be treated as headless-capable.
	it('still requires a TTY when the provider says nothing about needing one', () => {
		const reg = buildRegistration({ projectRoot: 'C:/p', isTty: false, canPrompt: true, pid: 1 });

		expect(reg.hasUserInterface).toBe(false);
	});

	it('reports none when nothing can prompt, even if a terminal is not required', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/p',
			isTty: false,
			canPrompt: false,
			promptNeedsTerminal: false,
			pid: 1,
		});

		expect(reg.hasUserInterface).toBe(false);
	});

	// A TTY alone is not enough: without an approval provider the worker would attract an
	// interactive step and then fail it with "No ApprovalProvider configured". Declaring a
	// capability it cannot honour is worse than declaring none.
	it('reports none when there is nobody to ask, even at a terminal', () => {
		const reg = buildRegistration({ projectRoot: 'C:/p', isTty: true, canPrompt: false, pid: 1 });

		expect(reg.hasUserInterface).toBe(false);
	});

	it('passes labels and source through', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/p',
			isTty: false,
			canPrompt: false,
			pid: 1,
			sourceId: 'laptop',
			labels: ['gpu', 'linux'],
			token: 'tok',
		});

		expect(reg.sourceId).toBe('laptop');
		expect(reg.labels).toEqual(['gpu', 'linux']);
		expect(reg.authToken).toBe('tok');
	});

	it('rejects a blank label rather than sending something unmatchable', () => {
		expect(() =>
			buildRegistration({ projectRoot: 'C:/p', isTty: false, canPrompt: false, pid: 1, labels: ['  '] })
		).toThrow(/empty/i);
	});
});

describe('scheduleReconnectTimer', () => {
	// The bug this pins down: the timer used to be unref'd, so once the socket closed nothing kept
	// the event loop alive and `flow worker` exited with code 0 while printing "waiting to
	// re-register". A worker that quietly disappears takes every user_intervention step with it.
	it('keeps the process alive while waiting to re-register', () => {
		const timer = scheduleReconnectTimer(60_000, () => undefined);

		try {
			expect(timer.hasRef()).toBe(true);
		} finally {
			clearTimeout(timer);
		}
	});

	it('runs the reconnect callback it was given', async () => {
		let called = false;
		const timer = scheduleReconnectTimer(1, () => {
			called = true;
		});

		await vi.waitFor(() => expect(called).toBe(true), { interval: 1, timeout: 1000 });
		clearTimeout(timer);
	});
});

describe('reconnectDelayMs', () => {
	// The worker must outlive the daemon (D#51): it waits rather than exiting.
	it('backs off and then holds steady', () => {
		expect(reconnectDelayMs(0)).toBeLessThan(reconnectDelayMs(1));
		expect(reconnectDelayMs(1)).toBeLessThan(reconnectDelayMs(5));
		expect(reconnectDelayMs(100)).toBe(reconnectDelayMs(50));
	});

	it('never returns zero, so a dead daemon cannot spin the worker', () => {
		expect(reconnectDelayMs(0)).toBeGreaterThan(0);
	});

	it('caps the wait so a restarted daemon is picked up promptly', () => {
		expect(reconnectDelayMs(1000)).toBeLessThanOrEqual(30_000);
	});
});

describe('worker configuration from the environment', () => {
	afterEach(() => {
		delete process.env['FLOW_WORKER_SOURCE_ID'];
		delete process.env['FLOW_WORKER_PROJECTS'];
		delete process.env['FLOW_DAEMON_WS_URL'];
	});

	// A worker the daemon launched is configured entirely by its environment, so the declared
	// command can be just `flow worker`. Those three variables were being set by the daemon and
	// read by nobody, which is why built-in:command produced workers that knew nothing.
	it('takes the source id from the environment when no flag was given', () => {
		process.env['FLOW_WORKER_SOURCE_ID'] = 'laptop';

		expect(resolveSourceId(undefined)).toBe('laptop');
	});

	it('prefers an explicit --source over the environment', () => {
		process.env['FLOW_WORKER_SOURCE_ID'] = 'laptop';

		expect(resolveSourceId('builder')).toBe('builder');
	});

	it('has no source when neither says one', () => {
		expect(resolveSourceId(undefined)).toBeUndefined();
	});

	it('takes the projects to serve from the environment', () => {
		process.env['FLOW_WORKER_PROJECTS'] = 'C:/a,C:/b';

		expect(resolveExtraProjects(undefined)).toEqual(['C:/a', 'C:/b']);
	});

	it('ignores an empty projects list rather than serving a blank path', () => {
		process.env['FLOW_WORKER_PROJECTS'] = '';

		expect(resolveExtraProjects(undefined)).toEqual([]);
	});

	it('prefers explicit --project flags over the environment', () => {
		process.env['FLOW_WORKER_PROJECTS'] = 'C:/a';

		expect(resolveExtraProjects(['C:/explicit'])).toEqual(['C:/explicit']);
	});

	// A remote worker launched over ssh has no port file to read: the endpoint it must dial is
	// the one the daemon told it about.
	it('dials the endpoint the daemon named, without consulting any port file', () => {
		process.env['FLOW_DAEMON_WS_URL'] = 'ws://10.0.0.5:4101';

		expect(resolveDaemonWsUrl('C:/nonexistent-daemon-dir', null)).toBe('ws://10.0.0.5:4101');
	});

	it('still prefers a configured port over the environment', () => {
		process.env['FLOW_DAEMON_WS_URL'] = 'ws://10.0.0.5:4101';

		expect(resolveDaemonWsUrl('C:/nonexistent-daemon-dir', 4242)).toBe('ws://127.0.0.1:4242');
	});
});

describe('withFreshToken', () => {
	// The bug this pins down: the daemon rewrites health_token every time it starts, and the worker
	// resolved its credential once at launch. So after any daemon restart the worker connected,
	// was refused, and retried forever with the same dead token -- silently, since a refusal went to
	// the daemon's discarded stderr. D#51 wants the worker to outlive the daemon; its credential has
	// to as well.
	it('sends the credential as it is now, not as it was at launch', () => {
		const registration = buildRegistration({
			projectRoot: 'C:/p',
			isTty: false,
			canPrompt: false,
			pid: 1,
			token: 'stale',
		});

		const refreshed = withFreshToken(registration, () => 'rotated');

		expect(refreshed.authToken).toBe('rotated');
	});

	it('leaves the rest of the registration untouched', () => {
		const registration = buildRegistration({
			projectRoot: 'C:/p',
			extraProjects: ['C:/other'],
			isTty: false,
			canPrompt: false,
			pid: 7,
			labels: ['gpu'],
			sourceId: 'laptop',
			token: 'stale',
		});

		const refreshed = withFreshToken(registration, () => 'rotated');

		expect(refreshed.attachedProjects).toEqual(['C:/p', 'C:/other']);
		expect(refreshed.labels).toEqual(['gpu']);
		expect(refreshed.sourceId).toBe('laptop');
		expect(refreshed.pid).toBe(7);
	});

	// A credential that cannot be re-read must not silently downgrade to none: registering without
	// one is refused anyway, and the reason would be lost.
	it('propagates the failure when the credential can no longer be resolved', () => {
		const registration = buildRegistration({ projectRoot: 'C:/p', isTty: false, canPrompt: false, pid: 1 });

		expect(() =>
			withFreshToken(registration, () => {
				throw new Error('health_token is gone');
			})
		).toThrow(/health_token/);
	});
});
