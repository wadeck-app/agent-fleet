import { writeDaemonLog } from './DaemonLog.js';
import type { ForkWorkerSource } from './ForkWorkerSource.js';
import { buildForkWorkerType } from './ForkWorkerTypePlugin.js';
import { pruneWorkerLogs } from './WorkerLogFile.js';

/** What the daemon has to say to build its fork fallback. */
export interface DaemonForkWorkersInputs {
	/** The daemon's HTTP port, handed to each forked worker. */
	port: number;
	/** The worker listener's bound port, read when a worker is spawned (it may move after startup). */
	wsPort: () => number;
	claudePath: string | undefined;
	/** A forked worker's exit and last stderr lines go to the daemon log of this directory: its own stderr is ignored when detached. */
	logsDir: string;
	/** Where each forked worker's stdout and stderr are captured (flow-core `workerLogsDirOf`); old files are pruned when this is built. */
	workerLogsDir: string;
	maskText: (text: string) => string;
}

/** The daemon's fork fallback and the way to end what it forked. */
export interface DaemonForkWorkers {
	source: ForkWorkerSource;
	/** For the stop sequence: workers still running after `graceMs` are killed. */
	terminate: (graceMs: number) => void;
}

/** Builds the fork fallback through the fork worker type, the way the daemon used to build it inline. */
export function createDaemonForkWorkers(inputs: DaemonForkWorkersInputs): DaemonForkWorkers {
	const log = (level: 'info' | 'error', message: string): void => {
		writeDaemonLog(inputs.logsDir, level, message);
	};
	pruneWorkerLogs(inputs.workerLogsDir, log);
	const { source } = buildForkWorkerType({
		workerLogsDir: inputs.workerLogsDir,
		httpPort: inputs.port,
		wsPort: inputs.wsPort,
		...(inputs.claudePath === undefined ? {} : { claudePath: inputs.claudePath }),
		log,
		maskText: inputs.maskText,
	});
	return { source, terminate: graceMs => source.terminateRemaining(graceMs) };
}
