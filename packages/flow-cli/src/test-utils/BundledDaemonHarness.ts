// Test helper: runs the REAL standalone bundle (dist-bundle/flow.cjs + worker.cjs, copied out of the repository the way
// `npm i -g` lays it out) as a private daemon in a throwaway config directory, with its forked workers.
//
// Everything is private: temp XDG_CONFIG_HOME, FLOW_DAEMON_PORT=0, no queue events, no app-core, unreachable npm registry.
// The install directory is registered with the ProcessLeakGuard, so a daemon or worker that outlives the test fails the
// file and is killed.
import { addProject, defaultRegistryDir } from '@wadeck-app/project-sdk';
import { readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { OWN_PROCESS_GROUP, killProcessTree, removeTempDirectory } from 'flow-core/testing';
import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createIsolatedCliEnv } from './IsolatedCliEnv';
import { processLeakGuard } from './ProcessLeakGuard';
import { pollUntil } from './WaitHelpers';

const here = dirname(fileURLToPath(import.meta.url));
/**
 * FLOW_TEST_BUNDLE_DIR points the harness at another directory holding flow.cjs and worker.cjs (a private build, or an
 * older one to watch a regression test fail). Unset means the bundle the bundling project's global setup builds.
 */
const bundleDir = process.env['FLOW_TEST_BUNDLE_DIR'] ?? resolve(here, '..', '..', 'dist-bundle');

export interface BundledDaemon {
	child: ChildProcess;
	/** The daemon's config directory (port file, logs, executions). */
	flowDir: string;
	projectDir: string;
	installDir: string;
	/** Everything the daemon process wrote to stdout/stderr. */
	output(): string;
	/** Set once the process has exited. */
	exit(): { code: number | null; signal: NodeJS.Signals | null } | undefined;
	/** The daemon's published command port and pid, once it has written them. */
	published(): Promise<{ port: number; pid: number } | null>;
	/** Port workers dial (`worker.port`), once published. */
	workerPort(): number | null;
	/** Authenticated POST to the daemon's command server. */
	post(route: string, body?: unknown): Promise<{ status: number; body: string }>;
	/** Starts a one-step bash flow and returns its execution id. */
	runScript(id: string, script: string): Promise<string>;
	/** Removes every directory and kills anything left. Call from finally. */
	dispose(): Promise<void>;
}

export interface BundledDaemonOptions {
	env?: NodeJS.ProcessEnv;
}

/**
 * @throws when the bundle is missing: a missing bundle means the test proves nothing (it is built once by the bundling
 *   project's global setup; run the test through vitest).
 */
export async function startBundledDaemon(options: BundledDaemonOptions = {}): Promise<BundledDaemon> {
	// Checked first, before any directory or process exists. Arming lists every OS process (up to 25 s on a busy machine):
	// it must already be done by a hook, never inside a test body under the 5 s default timeout.
	if (!processLeakGuard.isArmed()) {
		throw new Error(
			'startBundledDaemon() needs the process leak guard armed beforehand: arming lists all OS processes (up to 25 s on a busy machine) ' +
				'and would be charged to the calling test timeout. Call armLeakGuardBeforeAll() (src/test-utils/LeakGuardHooks.ts) at the top level of this test file.'
		);
	}
	const flowBundle = join(bundleDir, 'flow.cjs');
	const workerBundle = join(bundleDir, 'worker.cjs');
	for (const bundle of [flowBundle, workerBundle]) {
		if (!existsSync(bundle)) {
			throw new Error(
				`The standalone bundle is missing at "${bundle}". It is built once by the bundling project global setup (src/test-utils/BundleGlobalSetup.ts); run the test through vitest.`
			);
		}
	}
	const isolation = createIsolatedCliEnv();
	const installDir = mkdtempSync(join(tmpdir(), 'flow-leak-install-'));
	const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'flow-leak-project-')));
	const configHome = mkdtempSync(join(tmpdir(), 'flow-leak-config-'));
	mkdirSync(join(projectDir, '.flow'), { recursive: true });
	copyFileSync(flowBundle, join(installDir, 'flow.cjs'));
	copyFileSync(workerBundle, join(installDir, 'worker.cjs'));
	// A run is refused unless its folder is a registered project; the registry is the private one of this config home.
	await addProject(defaultRegistryDir({ XDG_CONFIG_HOME: configHome }), { name: 'leak-probe', path: projectDir });
	// A flow or worker process of this directory that outlives the test is a leak, whoever its parent is.
	processLeakGuard.watch(installDir);

	const env: NodeJS.ProcessEnv = { ...isolation.env, ...options.env };
	for (const name of ['NODE_OPTIONS', 'VITEST', 'VITEST_WORKER_ID', 'FLOW_CONFIG', 'FLOW_CONFIG_DIR', 'NODE_PATH']) {
		delete env[name];
	}
	Object.assign(env, {
		FLOW_DAEMON_MODE: '1',
		XDG_CONFIG_HOME: configHome,
		FLOW_DAEMON_PORT: '0',
		// FLOW_QUEUE_EVENTS=0 comes from createIsolatedCliEnv (opt in per test with options.env).
		...options.env,
	});
	const flowDir = join(configHome, 'flow');

	const child = spawn(process.execPath, [join(installDir, 'flow.cjs')], {
		cwd: projectDir,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: OWN_PROCESS_GROUP,
		windowsHide: true,
	});
	let output = '';
	child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
	child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
	let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
	child.on('exit', (code, signal) => (exit = { code, signal }));

	const published = async () => {
		const data = await readPortFile(flowDir);
		return data === null ? null : { port: data.port, pid: data.pid };
	};
	const post = (route: string, body?: unknown) =>
		new Promise<{ status: number; body: string }>((resolvePost, reject) => {
			void published().then(data => {
				if (data === null) {
					reject(new Error(`No daemon port file in ${flowDir}; the daemon is not running.\n${output}`));
					return;
				}
				const token = readFileSync(join(flowDir, 'health_token'), 'utf8').trim();
				const payload = body === undefined ? '' : JSON.stringify(body);
				const req = http.request(
					{
						host: '127.0.0.1',
						port: data.port,
						method: 'POST',
						path: route,
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
							'Content-Length': Buffer.byteLength(payload),
						},
					},
					res => {
						let text = '';
						res.on('data', (chunk: Buffer) => (text += chunk.toString()));
						res.on('end', () => resolvePost({ status: res.statusCode ?? 0, body: text }));
					}
				);
				req.on('error', reject);
				req.end(payload);
			}, reject);
		});

	const daemon: BundledDaemon = {
		child,
		flowDir,
		projectDir,
		installDir,
		output: () => output,
		exit: () => exit,
		published,
		workerPort: () => {
			try {
				return (JSON.parse(readFileSync(join(flowDir, 'worker.port'), 'utf8')) as { port: number }).port;
			} catch {
				return null;
			}
		},
		post,
		runScript: async (id, script) => {
			const flowFile = join(projectDir, `${id}.yml`);
			writeFileSync(
				flowFile,
				[
					`id: ${id}`,
					'version: "1.0.0"',
					`name: ${id}`,
					'description: process leak probe',
					'workspace:',
					'  mode: manual',
					'  gitStrategy: any',
					'  reusePolicy: if-available',
					'steps:',
					'  - id: only',
					'    name: Only',
					'    type: script',
					'    shell: bash',
					'    script: |',
					`      ${script}`,
					'',
				].join('\n')
			);
			const reply = await post('/run', { type: 'run', flowFile, cwd: projectDir, inputs: {} });
			const parsed = JSON.parse(reply.body) as {
				result?: { type: string; executionId?: string; message?: string };
			};
			if (parsed.result?.type !== 'execution_started' || parsed.result.executionId === undefined) {
				throw new Error(`The daemon did not start the run: ${reply.status} ${reply.body}\n${output}`);
			}
			return parsed.result.executionId;
		},
		dispose: async () => {
			await killProcessTree(child);
			for (const dir of [isolation.root, installDir, projectDir, configHome]) {
				removeTempDirectory(dir);
			}
		},
	};

	const up = await pollUntil(async () => (await published()) !== null || exit !== undefined, {
		timeoutMs: 60_000,
		intervalMs: 100,
	});
	if (!up || exit !== undefined) {
		const failure = `The bundled daemon did not come up (exit=${JSON.stringify(exit)}).\n${output}`;
		await daemon.dispose();
		throw new Error(failure);
	}
	return daemon;
}
