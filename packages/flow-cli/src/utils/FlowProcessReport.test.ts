import { describe, expect, it } from 'vitest';

import { buildProcessReport, formatAge, formatProcessReport, isFlowProcess } from './FlowProcessReport';
import type { OsProcess } from './OsProcessTable';

const NOW = new Date('2026-10-25T12:00:00Z');
const ago = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000);
const proc = (pid: number, ppid: number, commandLine: string, startedAt?: Date): OsProcess => ({
	pid,
	ppid,
	commandLine,
	...(startedAt === undefined ? {} : { startedAt }),
});

const NODE = 'C:\\App\\nodejs\\node.exe';

describe('isFlowProcess', () => {
	it('recognises the bundle, the worker bundle and the dev entries, not other node programs', () => {
		expect(isFlowProcess(`${NODE} C:\\x\\flow.cjs`)).toBe(true);
		expect(isFlowProcess(`${NODE} C:\\x\\worker.cjs`)).toBe(true);
		expect(isFlowProcess(`${NODE} --import file:///l.mjs C:\\r\\dist\\worker\\Worker.js`)).toBe(true);
		expect(isFlowProcess(`${NODE} C:\\r\\bin\\flow.js run x`)).toBe(true);
		expect(isFlowProcess(`${NODE} C:\\r\\node_modules\\vitest\\vitest.mjs run`)).toBe(false);
	});
});

describe('formatAge', () => {
	it.each([
		[42, '42s'],
		[130, '2m 10s'],
		[2 * 3600 + 600, '2h 10m'],
		[5 * 86400 + 13 * 3600, '5d 13h'],
	])('%i s -> %s', (seconds, text) => {
		expect(formatAge(ago(seconds), NOW)).toBe(text);
	});

	it('says ? when the start time is unknown', () => {
		expect(formatAge(undefined, NOW)).toBe('?');
	});
});

describe('buildProcessReport', () => {
	function report(processes: OsProcess[], extra: { liveDaemonPid?: number; selfPid?: number } = {}) {
		return buildProcessReport({
			processes,
			ports: new Map([[200, [47825]]]),
			liveDaemonPid: extra.liveDaemonPid,
			selfPid: extra.selfPid ?? 9_999,
			now: NOW,
		});
	}

	it('flags a daemon that is not the one the port file names, with its age and port', () => {
		const rows = report(
			[proc(100, 1, `${NODE} C:\\i\\flow.cjs`, ago(60)), proc(200, 5, `${NODE} C:\\i\\flow.cjs`, ago(5 * 86400))],
			{ liveDaemonPid: 100 }
		);

		expect(rows.map(r => [r.pid, r.role])).toEqual([
			[200, 'daemon'],
			[100, 'daemon'],
		]);
		expect(rows[0]!.notes[0]).toContain('not the daemon the port file names (pid 100)');
		expect(rows[0]!.ports).toEqual([47825]);
		expect(rows[1]!.notes).toEqual([]);
	});

	it('flags every daemon when none answers', () => {
		const rows = report([proc(100, 1, `${NODE} C:\\i\\flow.cjs`)]);

		expect(rows[0]!.notes[0]).toContain('no daemon answers');
	});

	it('flags a forked worker whose parent is gone, not one with a live parent', () => {
		const rows = report(
			[
				proc(100, 1, `${NODE} C:\\i\\flow.cjs`),
				proc(101, 100, `${NODE} C:\\i\\worker.cjs`),
				proc(102, 4_444, `${NODE} C:\\i\\worker.cjs`),
			],
			{ liveDaemonPid: 100 }
		);

		const byPid = new Map(rows.map(r => [r.pid, r]));
		expect(byPid.get(101)!.notes).toEqual([]);
		expect(byPid.get(102)!.notes).toEqual(['its daemon is gone but it is still running']);
	});

	it('tells terminal workers and cli clients apart, and keeps their arguments', () => {
		const rows = report([
			proc(100, 1, `"${NODE}" "C:\\i\\flow.cjs" worker start --labels x`),
			proc(101, 1, `"${NODE}" "C:\\i\\flow.cjs" run my-flow --wait`),
		]);

		const byPid = new Map(rows.map(r => [r.pid, r]));
		expect(byPid.get(100)).toMatchObject({ role: 'terminal-worker', arguments: 'worker start --labels x' });
		expect(byPid.get(101)).toMatchObject({ role: 'cli', arguments: 'run my-flow --wait' });
		expect(byPid.get(101)!.notes[0]).toContain('parent is gone');
	});

	it('never lists the command producing the report, nor its ancestors', () => {
		const rows = report(
			[
				proc(10, 1, `${NODE} C:\\r\\bin\\flow.js cli processes`),
				proc(11, 10, `${NODE} tsx cli.mjs C:\\r\\src\\cli\\FlowIndex.ts cli processes`),
				proc(12, 1, `${NODE} C:\\i\\flow.cjs run other`),
			],
			{ selfPid: 11 }
		);

		expect(rows.map(r => r.pid)).toEqual([12]);
	});
});

describe('formatProcessReport', () => {
	it('says there is nothing to report in one line', () => {
		expect(formatProcessReport([], { now: NOW, portsKnown: true, platform: 'win32' })).toBe(
			'[flow] no flow processes are running\n'
		);
	});

	it('prints a table, marks suspects, and states that nothing was stopped, with how to stop one', () => {
		const rows = buildProcessReport({
			processes: [proc(200, 5, `${NODE} C:\\i\\flow.cjs`, ago(5 * 86400 + 13 * 3600))],
			ports: new Map([[200, [47825, 47826]]]),
			liveDaemonPid: undefined,
			selfPid: 1,
			now: NOW,
		});

		const text = formatProcessReport(rows, { now: NOW, portsKnown: true, platform: 'win32' });

		expect(text).toContain('PID');
		expect(text).toContain('200');
		expect(text).toContain('5d 13h');
		expect(text).toContain('5 GONE');
		expect(text).toContain('47825,47826');
		expect(text).toContain('! no daemon answers');
		expect(text).toContain('nothing was stopped');
		expect(text).toContain('taskkill /PID <pid> /T /F');
	});

	it('says ports are unknown instead of printing a dash that reads as "none"', () => {
		const rows = buildProcessReport({
			processes: [proc(200, 1, `${NODE} C:\\i\\flow.cjs`)],
			ports: undefined,
			liveDaemonPid: 200,
			selfPid: 1,
			now: NOW,
		});

		const text = formatProcessReport(rows, { now: NOW, portsKnown: false, platform: 'linux' });

		expect(text).toContain('Listening ports could not be read');
		expect(text).toContain('Nothing looks leaked');
	});
});
