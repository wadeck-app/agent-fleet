import * as fs from 'node:fs';
import * as path from 'node:path';

/** Marks a file as an unfinished write of a record; must never end in `.json`. */
export const TEMP_FILE_INFIX = '.json.tmp-';
/** Rename errors that mean "locked right now" rather than "cannot work". */
const TRANSIENT_RENAME_CODES = ['EPERM', 'EBUSY', 'EACCES'];
const RENAME_ATTEMPTS = 6;
const RENAME_RETRY_DELAY_MS = 20;
let temporaryFileCounter = 0;

function blockingPause(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Replaces a record file atomically: a concurrent reader (`flow show`, `flow history`, the daemon) sees the
 * old record or the new one, never half. Synchronous on purpose: the store's callers are.
 */
export class AtomicRecordWriter {
	/** @param pause - blocks for the given milliseconds between two rename attempts (injected so tests do not wait) */
	constructor(private readonly pause: (milliseconds: number) => void = blockingPause) {}

	/**
	 * Writes `content` to a sibling temporary file and renames it over `target`.
	 * The temporary name does not end in `.json`, so no `*.json` listing mistakes it for an execution.
	 */
	replaceFile(target: string, content: string): void {
		const temporary = `${target}${TEMP_FILE_INFIX}${String(process.pid)}-${String(temporaryFileCounter++)}`;
		try {
			fs.writeFileSync(temporary, content, 'utf8');
			this.renameWithRetry(temporary, target);
		} catch (err) {
			try {
				fs.rmSync(temporary, { force: true });
			} catch {
				// Best effort: ExecutionPruner removes leftovers later
			}
			throw err;
		}
	}

	/**
	 * Windows refuses to rename over a file another process has open (EPERM/EBUSY/EACCES), usually for
	 * a few milliseconds only (a reader, an antivirus scan). Retried a bounded number of times, then
	 * failed with what to do about it. Any other error is not transient and is thrown at once.
	 */
	private renameWithRetry(from: string, to: string): void {
		for (let attempt = 1; ; attempt++) {
			try {
				fs.renameSync(from, to);
				return;
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				if (code === undefined || !TRANSIENT_RENAME_CODES.includes(code)) {
					throw err;
				}
				if (attempt >= RENAME_ATTEMPTS) {
					throw new Error(
						`Cannot save execution ${path.basename(to, '.json')}: ${to} stayed locked (${code}) for ${String(RENAME_ATTEMPTS)} attempts. ` +
							'Another program (editor, antivirus, backup, a second flow process) is holding it open: close it, then re-run. ' +
							'The previous record is untouched.',
						{ cause: err }
					);
				}
				this.pause(RENAME_RETRY_DELAY_MS * attempt);
			}
		}
	}
}
