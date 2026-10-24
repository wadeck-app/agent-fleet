import { FlowConfigFixture, OWN_PROCESS_GROUP, killProcessTree, removeTempDirectory } from 'flow-core/testing';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Builds the module with `app-core-cli package` and serves the result through a REAL app-core server
 * (`app-core-cli dev` boots app-core's own buildServer) on a free port, then calls the routes over HTTP.
 * backend tests call the handlers directly, so they cannot see how the router fills `req.params`, nor
 * whether the packaged CJS bundle (flow-core, plugin manifests, ConfigDir) loads and runs.
 *
 * flow-core is bundled from its sources (the module tsconfig maps it), so no prior flow-core build is needed.
 * Uses the app-core-cli installed as a devDependency, never a global binary or the developer's app-core.
 */

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER_START_TIMEOUT_MS = 30_000;
const PACKAGE_TIMEOUT_MS = 90_000;

const cliPackageJson = createRequire(import.meta.url).resolve('@wadeck-app/app-core-cli/package.json');
const cliEntry = join(dirname(cliPackageJson), 'dist/cli.bundle.js');

let child: ChildProcess;
let workDir: string;
let baseUrl: string;

function writeFlowConfig(flowConfigDir: string): void {
	const fixture = new FlowConfigFixture('app-module-flow-real-server', flowConfigDir);
	const addRun = (executionId: string, status: 'completed' | 'failed', startedAt: string): void => {
		fixture.addExecution({
			executionId,
			status,
			startedAt,
			completedAt: '2026-01-01T00:00:05.000Z',
			steps: { build: { status, ...(status === 'failed' ? { error: 'exit 1' } : {}) } },
			...(status === 'failed' ? { lastError: 'exit 1' } : {}),
		});
	};
	addRun('aaa111', 'completed', '2026-01-01T00:00:00.000Z');
	addRun('bbb222', 'failed', '2026-01-02T00:00:00.000Z');
	fixture.addLog('2026-01-01', [
		JSON.stringify({ ts: '2026-01-01T10:00:00.000Z', level: 'info', msg: 'Daemon started' }),
	]);
	fixture.addLog('2026-01-02', [
		JSON.stringify({
			prefix: '[bbb222|build]',
			timestamp: '2026-01-02T00:00:01.000Z',
			level: 'error',
			message: 'build exploded',
		}),
	]);
	// A declared source with credential hashes that must never reach the API.
	writeFileSync(
		join(flowConfigDir, 'worker-sources.json'),
		JSON.stringify({
			sources: [
				{
					sourceId: 'laptop',
					provider: 'built-in:command',
					labels: [],
					maxWorkers: 1,
					tokenHash: 'SECRET-HASH',
					sourceTokenHash: 'SECRET-SOURCE-HASH',
					createdAt: '2026-01-01T00:00:00.000Z',
				},
			],
		})
	);
}

/** `app-core-cli package` into a folder outside the module (check refuses any other folder at the module root). */
function packageModule(out: string): void {
	try {
		execFileSync(
			process.execPath,
			[cliEntry, 'package', packageDir, '--out', out, '--version', '0.0.0-test-real-server'],
			{
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: PACKAGE_TIMEOUT_MS,
				windowsHide: true,
			}
		);
	} catch (err) {
		const failure = err as { stdout?: string; stderr?: string };
		throw new Error(`app-core-cli package failed:\n${failure.stdout ?? ''}${failure.stderr ?? ''}`);
	}
}

/**
 * The app-core-cli in node_modules lags the server build the manifest ranges name (dsl-ui >=2026.10.23-136): its shell
 * refuses a dslLib built for a newer one. This test calls the routes, not the components, and manifest.test.ts pins the
 * ranges, so the packaged copy asks for any shell. Fails loudly when the packaged manifest has no dslLib ranges to relax.
 */
function acceptAnyShellVersion(builtModule: string): void {
	const manifestPath = join(builtModule, 'manifest.json');
	const packaged = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dslLib?: { shared?: Record<string, string> } };
	const shared = packaged.dslLib?.shared;
	if (shared === undefined) {
		throw new Error(`${manifestPath} has no dslLib.shared: the module no longer declares its component ranges.`);
	}
	for (const name of ['@wadeck-app/dsl-ui', '@wadeck-app/dsl-renderer']) {
		shared[name] = '>=0.0.0';
	}
	writeFileSync(manifestPath, JSON.stringify(packaged, null, 2));
}

function startServer(builtModule: string, xdgConfigHome: string): Promise<string> {
	return new Promise((resolve, reject) => {
		let output = '';
		const timer = setTimeout(
			() =>
				reject(
					new Error(
						`app-core-cli dev did not print its URL within ${SERVER_START_TIMEOUT_MS} ms. Output so far:\n${output}`
					)
				),
			SERVER_START_TIMEOUT_MS
		);
		// node + the CLI file, no shell: the child is the real server process
		child = spawn(process.execPath, [cliEntry, 'dev', builtModule], {
			windowsHide: true,
			// Own process group on POSIX so the whole tree can be killed (see killProcessTree).
			detached: OWN_PROCESS_GROUP,
			// Port 0: a free port, never the developer's real app-core. XDG_CONFIG_HOME: the module's ConfigDir.get('flow') is the fixture.
			env: { ...process.env, APP_CORE_PORT: '0', XDG_CONFIG_HOME: xdgConfigHome },
		});
		const onData = (chunk: Buffer): void => {
			output += chunk.toString();
			const match = /app-core-cli dev: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
			if (match) {
				clearTimeout(timer);
				resolve(match[1]!);
			}
		};
		child.stdout?.on('data', onData);
		child.stderr?.on('data', onData);
		child.on('error', err => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('exit', code => {
			clearTimeout(timer);
			reject(new Error(`app-core-cli dev exited early (code ${code}). Output:\n${output}`));
		});
	});
}

describe('the packaged module through a real app-core server', () => {
	beforeAll(
		async () => {
			workDir = mkdtempSync(join(tmpdir(), 'app-module-flow-real-server-'));
			writeFlowConfig(join(workDir, 'xdg', 'flow'));
			const builtModule = join(workDir, 'module');
			packageModule(builtModule);
			acceptAnyShellVersion(builtModule);
			baseUrl = await startServer(builtModule, join(workDir, 'xdg'));
		},
		SERVER_START_TIMEOUT_MS + PACKAGE_TIMEOUT_MS + 5_000
	);

	// The server (and anything it started) holds the work dir as cwd or open files: on Windows removing it before the
	// process tree is gone fails with EPERM. Kill the tree, wait for exit, then remove.
	afterAll(async () => {
		if (child) {
			await killProcessTree(child);
		}
		removeTempDirectory(workDir);
	});

	async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
		const response = await fetch(`${baseUrl}/api/modules/flow${path}`);
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	}

	it('GET /executions lists the executions of the XDG_CONFIG_HOME flow directory, newest first, and filters', async () => {
		const all = await get('/executions');
		expect(all.status).toBe(200);
		expect((all.body['items'] as { executionId: string }[]).map(i => i.executionId)).toEqual(['bbb222', 'aaa111']);

		const failed = await get('/executions?status=failed');
		expect(failed.body['total']).toBe(1);
	});

	it('GET /executions/:id hands the real id to the handler (router fills req.params) and answers the lookup errors', async () => {
		const found = await get('/executions/bbb222');
		expect(found.status).toBe(200);
		expect(found.body['executionId']).toBe('bbb222');
		expect(String(found.body['text'])).toContain('Execution: bbb222');

		const missing = await get('/executions/zzz999');
		expect(missing.status).toBe(404);
		expect(String(missing.body['error'])).toContain('zzz999');
	});

	it('GET /executions/:id/logs reads the lines of that run from the daily log and filters them by step', async () => {
		const all = await get('/executions/bbb222/logs');
		expect(all.status).toBe(200);
		expect((all.body['entries'] as { message: string }[]).map(e => e.message)).toEqual(['build exploded']);
		expect(all.body['stepOptions']).toEqual([{ value: 'build', label: 'build' }]);
		expect(((await get('/executions/bbb222/logs?step=other')).body['entries'] as unknown[]).length).toBe(0);
	});

	it('GET /executions rejects a bad query with 400', async () => {
		const { status, body } = await get('/executions?limit=0');
		expect(status).toBe(400);
		expect(body['error']).toBe("'limit' must be an integer between 1 and 500, got '0'.");
	});

	it('GET /workers answers 200 without a daemon, with the declared source and no credential hash', async () => {
		const response = await fetch(`${baseUrl}/api/modules/flow/workers`);
		const text = await response.text();
		expect(response.status).toBe(200);
		const body = JSON.parse(text) as {
			workers: unknown[];
			daemon: { running: boolean };
			declaredSources: unknown[];
		};
		expect(body.workers).toEqual([]);
		expect(body.daemon.running).toBe(false);
		expect(body.declaredSources).toEqual([
			{ sourceId: 'laptop', provider: 'built-in:command', labels: [], maxWorkers: 1 },
		]);
		expect(text).not.toContain('SECRET');
	});

	it('GET /logs?date= reads that day of the daemon log', async () => {
		const { status, body } = await get('/logs?date=2026-01-01');
		expect(status).toBe(200);
		expect(String(body['text'])).toContain('Daemon started');
	});

	it('GET /plugins and /plugins/:id serve the built-in catalog from the bundle', async () => {
		const list = await get('/plugins');
		expect(list.status).toBe(200);
		expect((list.body['plugins'] as unknown[]).length).toBeGreaterThanOrEqual(4);
		const one = await get('/plugins/worktree');
		expect(one.status).toBe(200);
		expect(one.body['typeString']).toBe('plugins.worktree.default');
		expect((await get('/plugins/nope')).status).toBe(404);
		// The option rows are what the plugin detail page renders (a DSL table takes arrays, not objects).
		expect((one.body['optionRows'] as { name: string }[]).map(row => row.name)).toContain('baseDir');
	});

	// The bundle must hold the plugin catalog (ids), not the plugins: their code drags in execa and its tree, which
	// was ~60% of the backend bundle for nothing the catalog reads.
	it('packaged backend bundle stays free of the plugin implementations', () => {
		const backendBundle = join(workDir, 'module', 'api-backend', 'backend.cjs');
		expect(readFileSync(backendBundle, 'utf8')).not.toContain('execa');
		// execa and its tree were ~60% of the bundle (a regression doubles it); 300 KB leaves room for the served-text code in flow-core.
		expect(statSync(backendBundle).size).toBeLessThan(300_000);
	});
});
