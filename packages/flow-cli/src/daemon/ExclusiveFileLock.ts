import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

interface LockContent {
	pid: number;
	token: string;
	acquiredAt: string;
}

export interface ExclusiveFileLockOptions {
	/** How long to wait for the current holder before giving up. */
	timeoutMs: number;
	/** What the lock protects, for the error message ("start the daemon"). */
	purpose: string;
}

/** A lock file whose content never became readable this long after creation is a crashed writer's leftover. */
const UNREADABLE_LOCK_STALE_MS = 10_000;
const RETRY_INTERVAL_MS = 50;

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// EPERM: the process exists but belongs to someone else.
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

function readHolder(lockPath: string): LockContent | undefined {
	try {
		const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<LockContent>;
		return typeof parsed.pid === 'number' ? (parsed as LockContent) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Cross-process mutual exclusion on one file (created with O_EXCL, atomic on POSIX and Windows).
 *
 * Used to serialise the "is a daemon already up, if not start one" decision, which is a check-then-act that two
 * concurrent `flow run` would otherwise both win. A lock whose owner process is dead is taken over, so a crash
 * never blocks the next start.
 */
export class ExclusiveFileLock {
	/** @returns the release function; it only removes the lock if it is still the one this call created. */
	static async acquire(lockPath: string, options: ExclusiveFileLockOptions): Promise<() => void> {
		const deadline = Date.now() + options.timeoutMs;
		const token = randomUUID();
		for (;;) {
			try {
				const content: LockContent = { pid: process.pid, token, acquiredAt: new Date().toISOString() };
				fs.writeFileSync(lockPath, JSON.stringify(content), { flag: 'wx' });
				return () => ExclusiveFileLock.release(lockPath, token);
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
					throw err;
				}
			}
			const holder = readHolder(lockPath);
			if (ExclusiveFileLock.isStale(lockPath, holder)) {
				fs.rmSync(lockPath, { force: true });
				continue;
			}
			if (Date.now() >= deadline) {
				const who = holder === undefined ? 'an unknown process' : `pid ${String(holder.pid)}`;
				throw new Error(
					`Could not ${options.purpose}: ${lockPath} is held by ${who} and did not free up within ${String(options.timeoutMs)} ms. ` +
						'If that process is stuck, stop it; if it no longer exists, delete the lock file and retry.'
				);
			}
			await delay(RETRY_INTERVAL_MS);
		}
	}

	private static isStale(lockPath: string, holder: LockContent | undefined): boolean {
		if (holder !== undefined) {
			return !isProcessAlive(holder.pid);
		}
		try {
			return Date.now() - fs.statSync(lockPath).mtimeMs > UNREADABLE_LOCK_STALE_MS;
		} catch {
			// Gone between the failed create and now: the next loop turn creates it.
			return false;
		}
	}

	private static release(lockPath: string, token: string): void {
		if (readHolder(lockPath)?.token === token) {
			fs.rmSync(lockPath, { force: true });
		}
	}
}
