import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
 * Needs flow-core built (`npm run build` in packages/flow-core; `npm test` of this package does it).
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
	const executions = join(flowConfigDir, 'executions');
	mkdirSync(executions, { recursive: true });
	const record = (executionId: string, status: string, startedAt: string): string =>
		JSON.stringify({
			executionId,
			flowId: 'deploy',
			flowFile: '/flows/deploy.yml',
			status,
			currentSteps: [],
			startedAt,
			completedAt: '2026-01-01T00:00:05.000Z',
			steps: {
				build: {
					status: status === 'failed' ? 'failed' : 'completed',
					error: status === 'failed' ? 'exit 1' : undefined,
				},
			},
			...(status === 'failed' ? { lastError: 'exit 1' } : {}),
		});
	writeFileSync(join(executions, 'aaa111.json'), record('aaa111', 'completed', '2026-01-01T00:00:00.000Z'));
	writeFileSync(join(executions, 'bbb222.json'), record('bbb222', 'failed', '2026-01-02T00:00:00.000Z'));
	mkdirSync(join(flowConfigDir, 'logs'), { recursive: true });
	writeFileSync(
		join(flowConfigDir, 'logs', '2026-01-01.ndjson'),
		JSON.stringify({ ts: '2026-01-01T10:00:00.000Z', level: 'info', msg: 'Daemon started' }) + '\n'
	);
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
		// node + the CLI file, no shell: child.kill() reaches the real server process
		child = spawn(process.execPath, [cliEntry, 'dev', builtModule], {
			windowsHide: true,
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
			baseUrl = await startServer(builtModule, join(workDir, 'xdg'));
		},
		SERVER_START_TIMEOUT_MS + PACKAGE_TIMEOUT_MS + 5_000
	);

	afterAll(() => {
		child?.kill();
		rmSync(workDir, { recursive: true, force: true });
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
		expect(statSync(backendBundle).size).toBeLessThan(250_000);
	});
});
