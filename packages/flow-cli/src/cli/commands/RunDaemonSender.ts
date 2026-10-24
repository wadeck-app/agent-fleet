import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { createRemoteDaemonClient } from 'flow-core';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import type { ClientCommand, DaemonResponse } from '../../ipc/Protocol';
import { spawnDaemonBackground } from './DaemonBackgroundSpawner';

// violations-suppress-end: ts/no-deep-relative

type FlowCommands = { run?: (payload: unknown) => Promise<DaemonResponse> };

export async function sendToDaemon(
	cmd: Extract<ClientCommand, { type: 'run' }>,
	daemonDir: string
): Promise<DaemonResponse> {
	const makeClient = () => createRemoteDaemonClient<FlowCommands>(daemonDir);
	try {
		return (await makeClient().send('run', cmd)) as DaemonResponse;
	} catch (err) {
		if (!(err instanceof DaemonNotRunningError)) {
			throw err;
		}
		try {
			await spawnDaemonBackground(daemonDir);
			// On Windows the daemon writes the port file before the TCP server is ready.
			// Retry with backoff until the server accepts connections.
			let lastErr: unknown;
			for (let attempt = 0; attempt < 8; attempt++) {
				try {
					return (await makeClient().send('run', cmd)) as DaemonResponse;
				} catch (eRetry) {
					const code = (eRetry as NodeJS.ErrnoException).code;
					if (code !== 'ECONNRESET' && !(eRetry instanceof DaemonNotRunningError)) {
						throw eRetry;
					}
					lastErr = eRetry;
					await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
				}
			}
			throw lastErr;
		} catch (e2) {
			console.error('Daemon could not be started:', e2);
			process.exit(3); // D34: exit 3 = daemon start failed
		}
	}
}
