/**
 * `flow run --wait` twice in quick succession, against the REAL bundle and a private daemon.
 *
 * The daemon `flow run` auto-starts stops itself about a second after its last execution. A second run issued inside
 * that window reached a closing listener and died with a bare "Failed to contact the daemon." roughly every other
 * time (observed on the installed CLI). Every pair below must succeed whatever the gap between its two runs, because
 * the client treats a closing or stopping daemon as "not running" and starts another one.
 *
 * Also here: a run the daemon refuses must print its message, no stack trace, and exit non-zero (real exit code).
 */
import { addProject, defaultRegistryDir } from '@wadeck-app/project-sdk';
import { logsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import { spawn } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';
import { processLeakGuard } from '../test-utils/ProcessLeakGuard';
import { observeFor, pollUntil } from '../test-utils/WaitHelpers';

// Every CLI/daemon process this file starts must be gone when it ends (see ProcessLeakGuard).
armLeakGuardBeforeAll();

const __dirname = dirname(fileURLToPath(import.meta.url));
// FLOW_TEST_BUNDLE_DIR: another build (an older one, to watch this test fail), as the BundledDaemonHarness does.
const bundleDir = process.env['FLOW_TEST_BUNDLE_DIR'] ?? resolve(__dirname, '..', '..', 'dist-bundle');

/**
 * Gaps (ms) between the end of the first run and the start of the second one. The daemon decides to stop 1 s after
 * its last execution and the client notices the end of a run a little later, so the interesting gaps sit in the upper
 * half; 0 is the back-to-back case.
 */
const GAPS_MS = [0, 100, 250, 400, 550, 650, 750, 800, 850, 900, 950, 1000, 300, 700, 975];

interface FlowResult {
	status: number | null;
	output: string;
}

function runFlow(installedFlow: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<FlowResult> {
	return new Promise((resolveRun, reject) => {
		const child = spawn(process.execPath, [installedFlow, ...args], {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
			// A run that hangs is killed; its status is then null and the pair is reported as failed with its output.
			timeout: 120_000,
		});
		let output = '';
		child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		child.on('error', reject);
		child.on('exit', status => {
			resolveRun({ status, output });
		});
	});
}

function daemonLog(flowDir: string): string {
	const dir = logsDirOf(flowDir);
	return existsSync(dir)
		? readdirSync(dir)
				.map(name => readFileSync(join(dir, name), 'utf8'))
				.join('\n')
		: '(no daemon log)';
}

/** A private install of the bundle, a registered project and a one-step flow: nothing of the real machine is reachable. */
interface Rig {
	installedFlow: string;
	projectDir: string;
	flowDir: string;
	portFile: string;
	flowFile: string;
	env: NodeJS.ProcessEnv;
	/** Runs the bundle; from the project folder unless `cwd` is given. */
	flow(args: string[], cwd?: string): Promise<FlowResult>;
	/** Stops the private daemon (if any) and removes everything. */
	dispose(): Promise<void>;
}

async function createRig(): Promise<Rig> {
	// Fails loudly rather than skipping: a missing bundle means this test proves nothing.
	for (const name of ['flow.cjs', 'worker.cjs']) {
		if (!existsSync(join(bundleDir, name))) {
			throw new Error(
				`The standalone bundle is missing at "${join(bundleDir, name)}". It is built once by the bundling project global setup; run the test through vitest.`
			);
		}
	}
	const isolation = createIsolatedCliEnv();
	const installDir = mkdtempSync(join(tmpdir(), 'flow-rerun-install-'));
	// A daemon or worker of this directory that outlives the test fails the file (and is killed).
	processLeakGuard.watch(installDir);
	const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'flow-rerun-project-')));
	const configHome = mkdtempSync(join(tmpdir(), 'flow-rerun-config-'));
	copyFileSync(join(bundleDir, 'flow.cjs'), join(installDir, 'flow.cjs'));
	copyFileSync(join(bundleDir, 'worker.cjs'), join(installDir, 'worker.cjs'));
	await addProject(defaultRegistryDir({ XDG_CONFIG_HOME: configHome }), { name: 'rerun-probe', path: projectDir });

	const env: NodeJS.ProcessEnv = { ...isolation.env, XDG_CONFIG_HOME: configHome, FLOW_DAEMON_PORT: '0' };
	for (const name of ['NODE_OPTIONS', 'VITEST', 'VITEST_WORKER_ID', 'FLOW_CONFIG', 'FLOW_CONFIG_DIR', 'NODE_PATH']) {
		delete env[name];
	}
	const flowDir = join(configHome, 'flow');
	const installedFlow = join(installDir, 'flow.cjs');
	const flowFile = join(projectDir, 'rerun.yml');
	writeFileSync(
		flowFile,
		[
			'id: rerun',
			'version: "1.0.0"',
			'name: rerun',
			'description: back-to-back runs probe',
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
			'      echo hello',
			'',
		].join('\n')
	);
	const flow = (args: string[], cwd: string = projectDir) => runFlow(installedFlow, args, cwd, env);
	return {
		installedFlow,
		projectDir,
		flowDir,
		portFile: join(flowDir, 'config.port'),
		flowFile,
		env,
		flow,
		dispose: async () => {
			await flow(['stop']).catch(() => undefined);
			for (const dir of [isolation.root, installDir, projectDir, configHome]) {
				removeTempDirectory(dir);
			}
		},
	};
}

describe('flow run twice in quick succession (standalone bundle, private daemon)', () => {
	it('succeeds for every pair of runs, whatever the gap', { timeout: 900_000 }, async () => {
		const rig = await createRig();
		const failures: string[] = [];
		let log = '';
		try {
			for (const [pair, gapMs] of GAPS_MS.entries()) {
				const first = await rig.flow(['run', rig.flowFile, '--wait']);
				if (first.status !== 0) {
					failures.push(
						`pair ${String(pair)} (gap ${String(gapMs)} ms), FIRST run exit=${String(first.status)}:\n${first.output}`
					);
				}
				await observeFor(gapMs);
				const second = await rig.flow(['run', rig.flowFile, '--wait']);
				if (second.status !== 0) {
					failures.push(
						`pair ${String(pair)} (gap ${String(gapMs)} ms), SECOND run exit=${String(second.status)}:\n${second.output}`
					);
				}
				// Each pair starts from a cold machine: the daemon of this pair has stopped before the next one begins.
				const stopped = await pollUntil(() => !existsSync(rig.portFile), {
					timeoutMs: 40_000,
					intervalMs: 200,
				});
				if (!stopped) {
					failures.push(`pair ${String(pair)}: the daemon did not stop within 40 s after its last run`);
					await rig.flow(['stop']);
				}
			}
			log = failures.length > 0 ? `\nDaemon log:\n${daemonLog(rig.flowDir)}` : '';
		} finally {
			await rig.dispose();
		}
		expect(failures.join('\n---\n') + log).toBe('');
	});
});

describe('flow run refused by the daemon (standalone bundle, private daemon)', () => {
	it('prints the refusal without a stack trace and exits 1', { timeout: 180_000 }, async () => {
		const rig = await createRig();
		try {
			// The config of a project lives in the project registry; a leftover repository file is refused by the daemon.
			mkdirSync(join(rig.projectDir, '.flow'), { recursive: true });
			writeFileSync(join(rig.projectDir, '.flow', 'config.yml'), 'plugins: {}\n');

			// A daemon started from a folder outside any project (a shared daemon, started by another shell) serves the run; one
			// started from the project folder itself would refuse to start at all, which is another failure.
			const started = await rig.flow(['start'], tmpdir());
			expect(started.status, started.output).toBe(0);

			const refused = await rig.flow(['run', rig.flowFile]);

			expect(refused.output, 'the daemon should have refused the run with its own message').toContain(
				'is no longer read'
			);
			expect(refused.output, 'a stack trace was printed').not.toMatch(/\n\s+at [^\n]+\(?[^\n]*:\d+:\d+\)?/);
			expect(refused.output).not.toContain('Failed to contact the daemon');
			expect(refused.output).not.toContain('Daemon could not be started');
			expect(refused.status, refused.output).toBe(1);

			const debug = await runFlow(rig.installedFlow, ['run', rig.flowFile], rig.projectDir, {
				...rig.env,
				FLOW_DEBUG: '1',
			});
			expect(debug.output).toMatch(/\n\s+at [^\n]+:\d+:\d+/);
			expect(debug.status).toBe(1);
		} finally {
			await rig.dispose();
		}
	});
});
