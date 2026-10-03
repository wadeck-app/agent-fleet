import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

/**
 * Writes a single NDJSON daemon lifecycle entry to logsDir.
 *
 * Kept in its own module (not Daemon.ts) so CommandHandler can log the `--mock-config`
 * warning banner without creating a Daemon.ts <-> CommandHandler.ts import cycle.
 */
export function writeDaemonLog(logsDir: string, level: 'info' | 'error', msg: string): void {
	const today = new Date().toISOString().slice(0, 10);
	const line = JSON.stringify({ ts: new Date().toISOString(), level, msg }) + '\n';
	const filePath = path.join(logsDir, `${today}.ndjson`);
	try {
		fs.mkdirSync(logsDir, { recursive: true });
		fs.appendFileSync(filePath, line, 'utf8');
	} catch (err) {
		process.stderr.write(`[daemon] Failed to write daemon log: ${getErrorMessage(err)}\n`);
	}
}
