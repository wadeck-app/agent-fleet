import { FlowQueryService, readAppendedLog } from 'flow-core';
import * as fs from 'node:fs';

export interface LogsCommandOptions {
	/** Keep printing what is appended until SIGINT. */
	follow: boolean;
	/** Last N lines to print first; 0 or negative prints everything. */
	lines: number;
	/** `HH:mm:ss.SSS [LEVEL] message` instead of raw NDJSON. */
	human: boolean;
}

const FOLLOW_POLL_INTERVAL_MS = 250;

/**
 * `flow cli logs`: prints the tail of today's daemon log, then optionally follows it.
 * A missing file is announced (the daemon may not have run today); with `follow` the command
 * keeps waiting and prints the file once it appears.
 */
export async function logsCommand(
	configDir: string,
	options: LogsCommandOptions,
	write: (text: string) => void = text => void process.stdout.write(text)
): Promise<void> {
	const initial = FlowQueryService.forConfigDir(configDir).readLogs({ lines: options.lines, human: options.human });
	if (!initial.exists) {
		write(`No log file for today: ${initial.filePath}\n`);
		if (!options.follow) return;
	} else {
		write(initial.text);
	}
	if (!options.follow) return;

	let offset = initial.size;
	await new Promise<void>(resolve => {
		fs.watchFile(initial.filePath, { interval: FOLLOW_POLL_INTERVAL_MS }, () => {
			const appended = readAppendedLog(initial.filePath, offset, { human: options.human });
			if (!appended) return;
			offset = appended.offset;
			write(appended.text);
		});
		process.once('SIGINT', () => {
			fs.unwatchFile(initial.filePath);
			resolve();
		});
	});
}
