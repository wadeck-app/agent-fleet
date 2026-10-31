import * as fs from 'node:fs';
import * as path from 'node:path';

export const LAUNCHER_SCRIPT_PREFIX = 'flow-daemon-run-';
const LAUNCHER_SCRIPT_EXTENSION = '.vbs';
const MAX_AGE_MS = 24 * 3_600_000;
/** The file is gone or in use: nothing worth telling the user, the next start retries. */
const SILENT_CODES = new Set(['ENOENT', 'EBUSY', 'EPERM']);

export interface StaleLauncherScriptSweepDeps {
	directory: string;
	now: () => number;
	listDirectory: (directory: string) => string[];
	modifiedAtMs: (file: string) => number;
	unlink: (file: string) => void;
	warn: (message: string) => void;
}

export function realSweepDeps(directory: string): StaleLauncherScriptSweepDeps {
	return {
		directory,
		now: () => Date.now(),
		listDirectory: dir => fs.readdirSync(dir),
		modifiedAtMs: file => fs.statSync(file).mtimeMs,
		unlink: file => fs.unlinkSync(file),
		warn: message => process.stderr.write(`${message}\n`),
	};
}

/**
 * Best-effort removal of `flow-daemon-run-*.vbs` launcher scripts older than 24 h (left by versions whose script did not
 * delete itself, or by a launch that never ran). Touches no other name and never throws; a failure is reported on stderr
 * unless the file is gone or in use.
 */
export function sweepStaleLauncherScripts(deps: StaleLauncherScriptSweepDeps): void {
	const report = (action: string, target: string, error: unknown): void => {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== undefined && SILENT_CODES.has(code)) return;
		deps.warn(
			`[flow] could not ${action} "${target}" (${code ?? (error as Error).message}); stale launcher scripts are not cleaned up. ` +
				'Remove the flow-daemon-run-*.vbs files from the temp directory by hand if they pile up.'
		);
	};
	let names: string[];
	try {
		names = deps.listDirectory(deps.directory);
	} catch (error) {
		report('list the temp directory', deps.directory, error);
		return;
	}
	const threshold = deps.now() - MAX_AGE_MS;
	for (const name of names) {
		if (!name.startsWith(LAUNCHER_SCRIPT_PREFIX) || !name.endsWith(LAUNCHER_SCRIPT_EXTENSION)) continue;
		const file = path.join(deps.directory, name);
		try {
			if (deps.modifiedAtMs(file) < threshold) deps.unlink(file);
		} catch (error) {
			report('remove', file, error);
		}
	}
}
