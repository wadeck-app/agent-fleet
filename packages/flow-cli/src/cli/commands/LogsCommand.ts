import { FlowQueryService, readAppendedLog } from 'flow-core';

export interface LogsCommandOptions {
	/** Keep printing what is appended until SIGINT. */
	follow: boolean;
	/** Last N lines to print first; 0 or negative prints everything. */
	lines: number;
	/** `HH:mm:ss.SSS [LEVEL] message` instead of raw NDJSON. */
	human: boolean;
}

const FOLLOW_POLL_INTERVAL_MS = 250;

/** Timer and interrupt source of the follow loop, injectable so tests need no real timer nor real signal. */
export interface FollowRuntime {
	/** Calls `tick` every `ms` milliseconds; the returned function stops it. */
	every(ms: number, tick: () => void): () => void;
	/** Calls `handler` once, when the user interrupts the command. */
	onInterrupt(handler: () => void): void;
}

/** Real timer plus SIGINT from `signals` (the process by default; tests pass their own emitter). */
export function createSystemFollowRuntime(signals: Pick<NodeJS.EventEmitter, 'once'> = process): FollowRuntime {
	return {
		every: (ms, tick) => {
			const timer = setInterval(tick, ms);
			return () => clearInterval(timer);
		},
		onInterrupt: handler => {
			signals.once('SIGINT', handler);
		},
	};
}

/**
 * `flow cli logs`: prints the tail of today's daemon log, then optionally follows it.
 * A missing file is announced (the daemon may not have run today); with `follow` the command
 * keeps waiting and prints the file once it appears.
 *
 * Following polls the file size instead of using fs.watchFile: watchFile takes its baseline with an
 * asynchronous stat, so a file created right after the command started (the "no log yet" case) could be
 * the baseline itself and never fire a change event.
 */
export async function logsCommand(
	configDir: string,
	options: LogsCommandOptions,
	write: (text: string) => void = text => void process.stdout.write(text),
	runtime: FollowRuntime = createSystemFollowRuntime()
): Promise<void> {
	const initial = FlowQueryService.forConfigDir(configDir).readLogs({ lines: options.lines, human: options.human });
	if (!initial.exists) {
		write(`No log file for today: ${initial.filePath}
`);
		if (!options.follow) {
			return;
		}
	} else {
		write(initial.text);
	}
	if (!options.follow) {
		return;
	}

	let offset = initial.size;
	await new Promise<void>(resolve => {
		const stop = runtime.every(FOLLOW_POLL_INTERVAL_MS, () => {
			const appended = readAppendedLog(initial.filePath, offset, { human: options.human });
			if (!appended) {
				return;
			}
			offset = appended.offset;
			write(appended.text);
		});
		runtime.onInterrupt(() => {
			stop();
			resolve();
		});
	});
}
