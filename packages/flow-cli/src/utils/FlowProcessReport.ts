import type { OsProcess } from './OsProcessTable';

/** Command lines that belong to flow: the daemon/CLI bundle, the worker bundle, and the dev entries (tsx, bin wrapper). */
const FLOW_PROCESS_PATTERN =
	/(flow\.cjs|worker\.cjs|[\\/]dist[\\/]worker[\\/]Worker\.js|[\\/]FlowIndex\.[jt]s|[\\/]bin[\\/]flow\.js)/;

export function isFlowProcess(commandLine: string): boolean {
	return FLOW_PROCESS_PATTERN.test(commandLine);
}

export type FlowProcessRole = 'daemon' | 'forked-worker' | 'terminal-worker' | 'dev-wrapper' | 'cli';

export interface FlowProcessRow {
	pid: number;
	parentPid: number;
	/** Whether the parent still exists. A daemon is detached on purpose, so a dead parent alone proves nothing for it. */
	parentAlive: boolean;
	role: FlowProcessRole;
	/** What the command line says after the script (`run my-flow --wait`), empty for a daemon. */
	arguments: string;
	startedAt: Date | undefined;
	ports: number[];
	/** Why this process deserves a look; empty when nothing is odd. */
	notes: string[];
}

export interface ProcessReportInput {
	processes: readonly OsProcess[];
	/** Listening ports by pid; undefined when the OS could not tell. */
	ports: ReadonlyMap<number, number[]> | undefined;
	/** The pid the daemon port file names, when a daemon answers. */
	liveDaemonPid: number | undefined;
	/** Excluded together with its ancestors: the command that is producing this report. */
	selfPid: number;
	now: Date;
}

const SCRIPT = /(?:flow\.cjs|[\\/]FlowIndex\.[jt]s|[\\/]bin[\\/]flow\.js)"?(.*)$/;

function classify(commandLine: string): { role: FlowProcessRole; arguments: string } {
	if (/worker\.cjs|[\\/]dist[\\/]worker[\\/]Worker\.js/.test(commandLine)) {
		return { role: 'forked-worker', arguments: '' };
	}
	const args = (SCRIPT.exec(commandLine)?.[1] ?? '').trim();
	if (/[\\/]bin[\\/]flow\.js/.test(commandLine)) {
		return { role: 'dev-wrapper', arguments: args };
	}
	if (args === '') {
		return { role: 'daemon', arguments: '' };
	}
	return { role: /^worker\b/.test(args) ? 'terminal-worker' : 'cli', arguments: args };
}

/** Age as the largest two units: `5d 13h`, `2h 10m`, `42s`. */
export function formatAge(startedAt: Date | undefined, now: Date): string {
	if (startedAt === undefined) {
		return '?';
	}
	const seconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) {
		return `${String(days)}d ${String(hours)}h`;
	}
	if (hours > 0) {
		return `${String(hours)}h ${String(minutes)}m`;
	}
	return minutes > 0 ? `${String(minutes)}m ${String(seconds % 60)}s` : `${String(seconds)}s`;
}

/**
 * The flow processes of the machine with what is needed to spot a leaked one. Pure: nothing here reads or kills anything.
 *
 * "Suspect" is a hint, never a verdict: a daemon is suspect when a different daemon is the one the port file names (it
 * serves nobody), a forked worker when its parent is gone (it should have exited with it), a client when its parent is
 * gone (nobody reads its output).
 */
export function buildProcessReport(input: ProcessReportInput): FlowProcessRow[] {
	const byPid = new Map(input.processes.map(p => [p.pid, p]));
	const ancestors = new Set<number>();
	for (
		let pid: number | undefined = input.selfPid;
		pid !== undefined && !ancestors.has(pid);
		pid = byPid.get(pid)?.ppid
	) {
		ancestors.add(pid);
	}
	const rows: FlowProcessRow[] = [];
	for (const p of input.processes) {
		if (!isFlowProcess(p.commandLine) || ancestors.has(p.pid)) {
			continue;
		}
		const { role, arguments: args } = classify(p.commandLine);
		const parentAlive = byPid.has(p.ppid);
		const notes: string[] = [];
		if (role === 'daemon') {
			if (input.liveDaemonPid === undefined) {
				notes.push('no daemon answers on the published port: this one serves nobody');
			} else if (p.pid !== input.liveDaemonPid) {
				notes.push(`not the daemon the port file names (pid ${String(input.liveDaemonPid)}): serves nobody`);
			}
		}
		if (role === 'forked-worker' && !parentAlive) {
			notes.push('its daemon is gone but it is still running');
		}
		if ((role === 'cli' || role === 'dev-wrapper') && !parentAlive) {
			notes.push('its parent is gone: nobody reads its output');
		}
		rows.push({
			pid: p.pid,
			parentPid: p.ppid,
			parentAlive,
			role,
			arguments: args,
			startedAt: p.startedAt,
			ports: input.ports?.get(p.pid) ?? [],
			notes,
		});
	}
	return rows.sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
}

/** Human-readable table plus how to act, or a single line when there is nothing to show. */
export function formatProcessReport(
	rows: readonly FlowProcessRow[],
	options: { now: Date; portsKnown: boolean; platform: NodeJS.Platform }
): string {
	if (rows.length === 0) {
		return '[flow] no flow processes are running\n';
	}
	const header = ['PID', 'ROLE', 'AGE', 'PARENT', 'PORTS', 'DETAILS'];
	const table = rows.map(row => [
		String(row.pid),
		row.role,
		formatAge(row.startedAt, options.now),
		`${String(row.parentPid)} ${row.parentAlive ? 'alive' : 'GONE'}`,
		options.portsKnown ? (row.ports.length > 0 ? row.ports.join(',') : '-') : '?',
		[row.arguments, ...row.notes.map(note => `! ${note}`)].filter(text => text !== '').join('  '),
	]);
	const widths = header.map((title, column) => Math.max(title.length, ...table.map(line => line[column]!.length)));
	const render = (cells: string[]): string =>
		cells
			.map((cell, column) => cell.padEnd(widths[column]!))
			.join('  ')
			.trimEnd();
	const suspects = rows.filter(row => row.notes.length > 0);
	const kill = options.platform === 'win32' ? 'taskkill /PID <pid> /T /F' : 'kill <pid>';
	return (
		[
			render(header),
			...table.map(render),
			'',
			suspects.length > 0
				? `${String(suspects.length)} process(es) marked "!" look leaked. This command only lists; nothing was stopped. To end one yourself: ${kill}`
				: 'Nothing looks leaked. This command only lists; nothing was stopped.',
			...(options.portsKnown ? [] : ['Listening ports could not be read on this machine (PORTS shows ?).']),
		].join('\n') + '\n'
	);
}
