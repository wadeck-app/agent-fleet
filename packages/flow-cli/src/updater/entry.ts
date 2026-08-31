// flow-updater entry point — bundled separately as flow-updater.cjs.
// Must NOT import any flow runtime modules.
import { runUpdater, execNpm } from '@wadeck-app/shared-updater';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import * as http from 'node:http';

declare const __FLOW_CLI_VERSION__: string;

const PKG_NAME = '@wadeck-app/flow-cli';
const configDir = process.env['FLOW_CONFIG_DIR'] ?? ConfigDir.get('flow');
const currentVersion = typeof __FLOW_CLI_VERSION__ !== 'undefined' ? __FLOW_CLI_VERSION__ : '0.0.0-dev';

try {
	const npmRoot = execNpm(['root', '-g'], { timeout: 10_000 }).trim();
	const selfCheckCmd = `${process.execPath} ${join(npmRoot, PKG_NAME, 'flow.cjs')} cli self-check`;
	process.env['UPDATER_SELF_CHECK_CMD'] = selfCheckCmd;
} catch {
	// Skip self-check if npm root unavailable.
}

/**
 * Query GET /health on the flow daemon. Returns the parsed JSON body, or null if
 * the daemon is unreachable, the request times out, or the response is not valid JSON.
 */
function queryDaemonHealth(port: number, token: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
	return new Promise((resolve) => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path: '/health',
				headers: { Authorization: `Bearer ${token}` },
				timeout: timeoutMs,
			},
			(res) => {
				let body = '';
				res.on('data', (chunk: Buffer) => {
					body += chunk.toString();
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(body) as Record<string, unknown>);
					} catch {
						resolve(null);
					}
				});
			},
		);
		req.on('error', () => resolve(null));
		req.on('timeout', () => {
			req.destroy();
			resolve(null);
		});
	});
}

runUpdater({
	pkgName: PKG_NAME,
	configDir,
	currentVersion,
	strategy: 'without-daemon',
	onUpdateAvailable: async (_newVersion: string) => {
		try {
			const portJson = readFileSync(join(configDir, 'config.port'), 'utf8');
			const { port } = JSON.parse(portJson) as { port: number };
			const token = readFileSync(join(configDir, 'health_token'), 'utf8').trim();
			const health = await queryDaemonHealth(port, token, 3_000);
			if (
				health !== null &&
				typeof health['running_executions'] === 'number' &&
				health['running_executions'] > 0
			) {
				// A flow execution is in progress — defer the update to avoid disruption.
				return { defer: true, retryIn: 2 * 60_000 };
			}
		} catch {
			// Daemon unreachable, config files missing, or JSON parse error → apply now.
		}
		return 'apply-now';
	},
}).catch(err => {
	process.stderr.write(`[flow-updater] fatal: ${err}\n`);
	process.exit(1);
});
