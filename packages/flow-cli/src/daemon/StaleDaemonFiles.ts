import * as fs from 'node:fs';
import * as path from 'node:path';

import { findLiveDaemon } from './LiveDaemonProbe.js';
import { WORKER_PORT_FILE } from './publishWorkerPort.js';

/**
 * Files only a running daemon may leave in its config directory. `config.port` itself is not listed: the singleton kit
 * already discards a port file whose owner is gone or has stopped answering.
 */
const DAEMON_OWNED_FILES: readonly string[] = [WORKER_PORT_FILE, 'config.port.tmp'];

/**
 * Deletes the files a previous daemon left when it died without cleaning up, unless a daemon is answering now.
 *
 * A stale `worker.port` sends every worker that reads it to a port nobody serves, or to whatever unrelated program
 * took the number since. Run by a daemon that has decided to start, before it publishes its own.
 *
 * @returns the names removed, so the caller can log them. Never throws on a missing file; a file that exists but cannot
 *   be removed throws, naming it, because starting on top of it would leave workers misdirected without a trace.
 */
export async function removeStaleDaemonFiles(daemonDir: string): Promise<string[]> {
	if ((await findLiveDaemon(daemonDir)) !== null) {
		return [];
	}
	const removed: string[] = [];
	for (const name of DAEMON_OWNED_FILES) {
		const filePath = path.join(daemonDir, name);
		if (!fs.existsSync(filePath)) {
			continue;
		}
		try {
			fs.rmSync(filePath, { force: true });
		} catch (err) {
			throw new Error(
				`Could not remove "${filePath}", left by a previous flow daemon: ${(err as Error).message}. Delete it manually and retry.`,
				{ cause: err }
			);
		}
		removed.push(name);
	}
	return removed;
}
