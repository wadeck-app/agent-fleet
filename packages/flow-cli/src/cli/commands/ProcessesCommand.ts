import { Command } from 'commander';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { findLiveDaemon } from '../../daemon/LiveDaemonProbe.js';
import { type FlowProcessRow, buildProcessReport, formatProcessReport } from '../../utils/FlowProcessReport.js';
import { type OsProcess, listListeningPorts, listOsProcesses } from '../../utils/OsProcessTable.js';

// violations-suppress-end: ts/no-deep-relative

/** What the command reads from the machine; replaced in tests. */
export interface ProcessesDeps {
	listProcesses: () => OsProcess[];
	listPorts: () => Map<number, number[]> | undefined;
	liveDaemonPid: () => Promise<number | undefined>;
	now: () => Date;
	selfPid: number;
	platform: NodeJS.Platform;
	write: (text: string) => void;
}

export function realProcessesDeps(): ProcessesDeps {
	return {
		listProcesses: () => listOsProcesses(),
		listPorts: () => listListeningPorts(),
		liveDaemonPid: async () => (await findLiveDaemon(flowConfigDir()))?.pid,
		now: () => new Date(),
		selfPid: process.pid,
		platform: process.platform,
		write: text => {
			process.stdout.write(text);
		},
	};
}

function jsonRow(row: FlowProcessRow): Record<string, unknown> {
	return {
		pid: row.pid,
		parentPid: row.parentPid,
		parentAlive: row.parentAlive,
		role: row.role,
		arguments: row.arguments,
		startedAt: row.startedAt?.toISOString() ?? null,
		ports: row.ports,
		notes: row.notes,
	};
}

/**
 * Lists the flow processes on this machine so a leaked one is visible. Read-only: it never stops anything.
 *
 * @throws when the process list cannot be read; the message names the tool that failed.
 */
export async function runProcessesCommand(deps: ProcessesDeps, options: { json?: boolean }): Promise<void> {
	const processes = deps.listProcesses();
	const ports = deps.listPorts();
	const rows = buildProcessReport({
		processes,
		ports,
		liveDaemonPid: await deps.liveDaemonPid(),
		selfPid: deps.selfPid,
		now: deps.now(),
	});
	if (options.json === true) {
		deps.write(JSON.stringify({ portsKnown: ports !== undefined, processes: rows.map(jsonRow) }, null, 2) + '\n');
		return;
	}
	deps.write(
		formatProcessReport(rows, { now: deps.now(), portsKnown: ports !== undefined, platform: deps.platform })
	);
}

export function buildProcessesCommand(deps: ProcessesDeps = realProcessesDeps()): Command {
	return new Command('processes')
		.description(
			'List the flow daemons, workers and clients running on this machine (age, ports, parent alive?). Read-only: stops nothing'
		)
		.option('--json', 'Machine-readable output')
		.action(async (options: { json?: boolean }) => {
			try {
				await runProcessesCommand(deps, options);
			} catch (err) {
				// violations-suppress: security/no-raw-err-in-cli the process-listing errors are written for users: they name the OS tool that failed and say nothing was changed
				process.stderr.write(`[fail] ${normalizeError(err).message}\n`);
				process.exit(1);
			}
		});
}
