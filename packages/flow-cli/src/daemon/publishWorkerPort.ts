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
