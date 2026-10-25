import { describe, expect, it } from 'vitest';

import type { OsProcess } from '../../utils/OsProcessTable';
import { type ProcessesDeps, runProcessesCommand } from './ProcessesCommand';

const NOW = new Date('2026-10-25T12:00:00Z');
const NODE = 'C:\\App\\nodejs\\node.exe';

function deps(overrides: Partial<ProcessesDeps> = {}): { deps: ProcessesDeps; output: () => string } {
	let text = '';
	const processes: OsProcess[] = [
		{
			pid: 100,
			ppid: 1,
			commandLine: `${NODE} C:\\i\\flow.cjs`,
			startedAt: new Date(NOW.getTime() - 5 * 86_400_000),
		},
		{ pid: 200, ppid: 1, commandLine: `${NODE} C:\\i\\flow.cjs`, startedAt: new Date(NOW.getTime() - 60_000) },
	];
	return {
		deps: {
			listProcesses: () => processes,
			listPorts: () => new Map([[100, [47825]]]),
			liveDaemonPid: () => Promise.resolve(200),
			now: () => NOW,
			selfPid: 9_999,
			platform: 'win32',
			write: chunk => {
				text += chunk;
			},
			...overrides,
		},
		output: () => text,
	};
}

describe('runProcessesCommand', () => {
	it('prints the table with the leaked daemon marked, and never stops anything', async () => {
		const { deps: d, output } = deps();

		await runProcessesCommand(d, {});

		expect(output()).toContain('100');
		expect(output()).toContain('5d 0h');
		expect(output()).toContain('! not the daemon the port file names (pid 200)');
		expect(output()).toContain('nothing was stopped');
	});

	it('prints machine-readable output with --json', async () => {
		const { deps: d, output } = deps();

		await runProcessesCommand(d, { json: true });

		const parsed = JSON.parse(output()) as {
			portsKnown: boolean;
			processes: { pid: number; ports: number[]; notes: string[] }[];
		};
		expect(parsed.portsKnown).toBe(true);
		expect(parsed.processes.map(p => p.pid)).toEqual([100, 200]);
		expect(parsed.processes[0]!.ports).toEqual([47825]);
		expect(parsed.processes[0]!.notes).toHaveLength(1);
	});

	it('lets a failure to read the process table surface, naming the tool', async () => {
		const { deps: d } = deps({
			listProcesses: () => {
				throw new Error("Could not list the machine's processes with PowerShell (status 1): denied");
			},
		});

		await expect(runProcessesCommand(d, {})).rejects.toThrow(/PowerShell/);
	});
});
