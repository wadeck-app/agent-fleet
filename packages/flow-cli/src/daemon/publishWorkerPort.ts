import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

/** Name of the file the daemon publishes its bound WebSocket port in. */
export const WORKER_PORT_FILE = 'worker.port';

/**
 * Records the port workers must dial.
 *
 * Necessary because the WebSocket server retries upward on EADDRINUSE, so the bound port
 * is not reliably `httpPort + 1`. A client computing the offset itself would dial whatever
 * else holds that port -- failing obscurely, or joining something unrelated.
 */
export function publishWorkerPort(daemonDir: string, port: number): void {
	const filePath = path.join(daemonDir, WORKER_PORT_FILE);
	try {
		fs.writeFileSync(filePath, JSON.stringify({ port }), { encoding: 'utf8', mode: 0o600 });
	} catch (err) {
		// Not fatal for forked workers, which read the port in-process, but every externally
		// launched worker now has nothing to dial -- so say so rather than continue quietly.
		process.stderr.write(
			`[daemon] Failed to publish the worker port to "${filePath}": ${getErrorMessage(err)}. Externally launched workers will not be able to connect.\n`
		);
	}
}

/**
 * Removes the published worker port, but only if it still names `port`.
 *
 * Called when the daemon stops: a file left behind sends every worker that reads it to a port nobody serves. The port is
 * compared because a daemon that replaced this one may have published its own already, and removing that would strand
 * its workers.
 *
 * Never throws: a failure to clean up must not turn a stop into a crash. An unreadable file is reported and left, since
 * it is not provably this daemon's.
 */
export function removeWorkerPort(daemonDir: string, port: number): void {
	const filePath = path.join(daemonDir, WORKER_PORT_FILE);
	let content: string;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return;
		}
		process.stderr.write(`[daemon] Could not read "${filePath}" to clean it up: ${getErrorMessage(err)}\n`);
		return;
	}
	let published: unknown;
	try {
		published = (JSON.parse(content) as { port?: unknown }).port;
	} catch {
		process.stderr.write(
			`[daemon] "${filePath}" is not a worker port file (not JSON), so it was left in place. Delete it if no daemon is running.\n`
		);
		return;
	}
	if (published !== port) {
		return;
	}
	try {
		fs.rmSync(filePath, { force: true });
	} catch (err) {
		process.stderr.write(`[daemon] Could not remove "${filePath}": ${getErrorMessage(err)}. Delete it manually.\n`);
	}
}
