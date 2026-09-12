// flow-updater entry point -- bundled separately as flow-updater.cjs.
// Must NOT import any flow runtime modules.
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { execNpm, readUpdateConfig, runUpdater } from '@wadeck-app/shared-updater';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { join } from 'node:path';

declare const __FLOW_CLI_VERSION__: string;

const PKG_NAME = '@wadeck-app/flow-cli';
const baseConfigDir = process.env['FLOW_CONFIG_DIR'] ?? ConfigDir.get('flow');

// When UPDATER_MANUAL=1 (explicit `flow cli update`), bypass autoUpdate:false by
// running the updater against a temp config copy with the flag removed.
const configDir = (() => {
	if (!process.env['UPDATER_MANUAL']) return baseConfigDir;
	try {
		const configFile = join(baseConfigDir, 'config.yml');
		const content = readFileSync(configFile, 'utf8');
		if (!/^autoUpdate:\s*false/m.test(content)) return baseConfigDir;
		const tempDir = join(os.tmpdir(), `flow-update-manual-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		cpSync(baseConfigDir, tempDir, { recursive: true });
		writeFileSync(join(tempDir, 'config.yml'), content.replace(/^autoUpdate:\s*false/m, 'autoUpdate: true'));
		return tempDir;
	} catch {
		return baseConfigDir;
	}
})();

const currentVersion = typeof __FLOW_CLI_VERSION__ !== 'undefined' ? __FLOW_CLI_VERSION__ : '0.0.0-dev';

try {
	const npmRoot = execNpm(['root', '-g'], { timeout: 10_000 }).trim();
	const selfCheckCmd = `${process.execPath} ${join(npmRoot, PKG_NAME, 'flow.cjs')} cli self-check`;
	if (!process.env['UPDATER_SELF_CHECK_CMD']) {
		process.env['UPDATER_SELF_CHECK_CMD'] = selfCheckCmd;
	}
} catch {
	// Skip self-check if npm root unavailable.
}

/**
 * Query GET /health on the flow daemon. Returns the parsed JSON body, or null if
 * the daemon is unreachable, the request times out, or the response is not valid JSON.
 */
function queryDaemonHealth(port: number, token: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
	return new Promise(resolve => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path: '/health',
				headers: { Authorization: `Bearer ${token}` },
				timeout: timeoutMs,
			},
			res => {
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
			}
		);
		req.on('error', () => resolve(null));
		req.on('timeout', () => {
			req.destroy();
			resolve(null);
		});
	});
}

// UPDATER_FORCE=1 means the user asked for this explicitly (`flow cli update`), so the run
// must never be silent. shared-updater reports every outcome to its NDJSON log file only, so
// we mirror the entries this run produced onto stdout/stderr instead of duplicating its
// decision logic here. New updater messages surface automatically.
const force = process.env['UPDATER_FORCE'] === '1';

/** Path of the shared-updater NDJSON log for today (mirrors shared-updater's appendLog). */
function updaterLogPath(): string {
	return join(configDir, 'logs', `${new Date().toISOString().slice(0, 10)}.ndjson`);
}

function logSize(file: string): number {
	return existsSync(file) ? statSync(file).size : 0;
}

/**
 * Echo every log entry appended during this run. Returns the number of entries echoed so the
 * caller can report an explicit reason when the updater produced nothing at all.
 */
function echoUpdaterLog(startPath: string, startSize: number): number {
	const endPath = updaterLogPath();
	// A run straddling midnight rolls over to a new file, which must be read from the start.
	const offset = endPath === startPath ? startSize : 0;
	if (!existsSync(endPath)) return 0;
	const appended = readFileSync(endPath, 'utf8').slice(offset);
	let count = 0;
	for (const line of appended.split('\n')) {
		if (line.trim() === '') continue;
		let level = 'info';
		let msg = line;
		try {
			const entry = JSON.parse(line) as { level?: string; msg?: string };
			if (typeof entry.msg === 'string') msg = entry.msg;
			if (typeof entry.level === 'string') level = entry.level;
		} catch {
			// Not valid NDJSON: still surface the raw line rather than hiding it.
		}
		const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
		stream.write(`[flow-updater] ${msg}\n`);
		count += 1;
	}
	return count;
}

/**
 * Explains the one outcome shared-updater exits on without logging anything: autoUpdate is
 * disabled in config.yml and UPDATER_MANUAL was not set to bypass it.
 */
function reportSilentOutcome(): void {
	if (readUpdateConfig(configDir).disabled) {
		process.stderr.write(
			`[flow-updater] Update skipped: autoUpdate is disabled in ${join(configDir, 'config.yml')}.\n` +
				`[flow-updater] Run \`flow cli update\` to update anyway, or set \`autoUpdate: true\` in that file.\n`
		);
		return;
	}
	process.stderr.write(
		`[flow-updater] Update check produced no result and no log entry. This is unexpected.\n` +
			`[flow-updater] Inspect ${updaterLogPath()} and report it.\n`
	);
}

const logPathBeforeRun = updaterLogPath();
const logSizeBeforeRun = logSize(logPathBeforeRun);

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
				// A flow execution is in progress -- defer the update to avoid disruption.
				return { defer: true, retryIn: 2 * 60_000 };
			}
		} catch {
			// Daemon unreachable, config files missing, or JSON parse error -> apply now.
		}
		return 'apply-now';
	},
})
	.then(() => {
		if (!force) return;
		if (echoUpdaterLog(logPathBeforeRun, logSizeBeforeRun) === 0) reportSilentOutcome();
	})
	.catch(err => {
		// Surface whatever the updater managed to log before failing, then the failure itself.
		if (force) echoUpdaterLog(logPathBeforeRun, logSizeBeforeRun);
		process.stderr.write(`[flow-updater] fatal: ${err}\n`);
		process.exit(1);
	});
