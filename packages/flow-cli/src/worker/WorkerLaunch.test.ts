import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildRegistration, reconnectDelayMs, resolveDaemonWsUrl, resolveWorkerToken } from './WorkerLaunch.js';

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
	it('derives the ws port from the daemon http port', () => {
		writeFileSync(join(dir, 'config.port'), JSON.stringify({ port: 4100 }), 'utf8');

		expect(resolveDaemonWsUrl(dir, null)).toBe('ws://127.0.0.1:4101');
	});

	it('prefers an explicitly configured ws port', () => {
		writeFileSync(join(dir, 'config.port'), JSON.stringify({ port: 4100 }), 'utf8');

		expect(resolveDaemonWsUrl(dir, 9999)).toBe('ws://127.0.0.1:9999');
	});

	// A worker cannot invent the port: without the daemon there is nothing to join.
	it('fails with an actionable message when the daemon is not running', () => {
		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/daemon/i);
		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/flow start/);
	});

	it('fails loudly when the port file is unreadable rather than guessing', () => {
		writeFileSync(join(dir, 'config.port'), 'not json', 'utf8');

		expect(() => resolveDaemonWsUrl(dir, null)).toThrow(/config\.port/);
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
		const reg = buildRegistration({ projectRoot: 'C:/proj', isTty: false, pid: 7 });

		expect(reg.attachedProjects).toEqual(['C:/proj']);
	});

	it('adds explicitly requested projects without dropping the launch one', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/proj',
			extraProjects: ['C:/other'],
			isTty: false,
			pid: 7,
		});

		expect(reg.attachedProjects).toEqual(['C:/proj', 'C:/other']);
	});

	it('does not duplicate the launch project if it is also passed explicitly', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/proj',
			extraProjects: ['C:/proj'],
			isTty: false,
			pid: 7,
		});

		expect(reg.attachedProjects).toEqual(['C:/proj']);
	});

	// D#33/D#36: only the worker can know whether a human is attached.
	it('reports a user interface exactly when stdout is a TTY', () => {
		expect(buildRegistration({ projectRoot: 'C:/p', isTty: true, pid: 1 }).hasUserInterface).toBe(true);
		expect(buildRegistration({ projectRoot: 'C:/p', isTty: false, pid: 1 }).hasUserInterface).toBe(false);
	});

	it('passes labels and source through', () => {
		const reg = buildRegistration({
			projectRoot: 'C:/p',
			isTty: false,
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
		expect(() => buildRegistration({ projectRoot: 'C:/p', isTty: false, pid: 1, labels: ['  '] })).toThrow(
			/empty/i
		);
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
