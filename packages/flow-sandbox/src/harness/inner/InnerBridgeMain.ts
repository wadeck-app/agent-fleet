import { spawn } from 'node:child_process';

import { InnerBridgeShim } from './InnerBridgeShim';

/**
 * Entry of /opt/flow/inner-bridge.cjs (runs in the VM). Environment:
 *   FLOW_BRIDGE_URL    ws://host.docker.internal:<port>/   (required)
 *   FLOW_BRIDGE_TOKEN  the token placeholder               (required)
 *   FLOW_INNER_WORKER  worker bundle, default /opt/flow/worker.cjs
 * Both FLOW_BRIDGE_* variables are removed from the environment of the worker and of every step it runs.
 */
function required(name: string): string {
	const value = process.env[name];
	if (value === undefined || value === '') {
		process.stderr.write(`[inner-bridge] ${name} is not set: the wrapper must pass it to the exec.\n`);
		process.exit(2);
	}
	return value;
}

const bridgeUrl = required('FLOW_BRIDGE_URL');
const token = required('FLOW_BRIDGE_TOKEN');
const workerPath = process.env['FLOW_INNER_WORKER'] ?? '/opt/flow/worker.cjs';

const shim = new InnerBridgeShim({
	bridgeUrl,
	token,
	log: line => process.stderr.write(`${line}\n`),
	spawnWorker: localPort => {
		const env: NodeJS.ProcessEnv = { ...process.env, FLOW_WS_PORT: String(localPort) };
		delete env['FLOW_BRIDGE_URL'];
		delete env['FLOW_BRIDGE_TOKEN'];
		delete env['FLOW_INNER_WORKER'];
		const child = spawn(process.execPath, [workerPath], { env, stdio: ['ignore', 'inherit', 'inherit'] });
		return {
			onExit: callback => {
				child.once('exit', code => callback(code));
				child.once('error', error => {
					process.stderr.write(`[inner-bridge] cannot start ${workerPath}: ${error.message}\n`);
					callback(1);
				});
			},
			kill: () => {
				child.kill('SIGTERM');
			},
		};
	},
});

shim.run().then(
	code => process.exit(code),
	(error: unknown) => {
		process.stderr.write(`[inner-bridge] failed: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
);
