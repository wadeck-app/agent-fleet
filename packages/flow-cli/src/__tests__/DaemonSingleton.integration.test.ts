/**
 * Concurrent cold starts of the REAL bundle: exactly one daemon survives and it is the only one that did start-up work.
 *
 * Every `flow run` auto-starts a daemon when none answers, so three parallel runs on a cold machine start three. Each
 * of them used to take over the previous one and reconcile ("interrupted by a previous daemon stop") the executions
 * the live one had just accepted. The in-process counterpart is Daemon.singleton.test.ts; this one proves the
 * entry point (FlowIndex daemon mode) asks for the right behaviour, with separate OS processes.
 */
import { readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { OWN_PROCESS_GROUP, killProcessTree, removeTempDirectory } from 'flow-core/testing';
import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';
import { processLeakGuard } from '../test-utils/ProcessLeakGuard';
import { observeFor, pollUntil } from '../test-utils/WaitHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(__dirname, '..', '..', 'dist-bundle', 'flow.cjs');
const PROCESS_COUNT = 4;

interface Spawned {
	child: ChildProcess;
	output: () => string;
	exit: () => { code: number | null } | undefined;
}

function spawnDaemonMode(installedFlow: string, cwd: string, configHome: string, env: NodeJS.ProcessEnv): Spawned {
	const child = spawn(process.execPath, [installedFlow], {
		cwd,
		env: { ...env, FLOW_DAEMON_MODE: '1', XDG_CONFIG_HOME: configHome, FLOW_DAEMON_PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: OWN_PROCESS_GROUP,
	});
	let output = '';
	child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
	child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
	let exit: { code: number | null } | undefined;
	child.on('exit', code => (exit = { code }));
	return { child, output: () => output, exit: () => exit };
}

function daemonLog(configHome: string): string[] {
	const logsDir = join(configHome, 'flow', 'logs');
	if (!existsSync(logsDir)) return [];
	return readdirSync(logsDir)
		.filter(name => name.endsWith('.ndjson'))
		.flatMap(name => readFileSync(join(logsDir, name), 'utf8').trim().split('\n'))
		.map(line => (JSON.parse(line) as { msg: string }).msg);
}

describe('concurrent cold starts of the standalone bundle', () => {
	it('leaves exactly one live daemon, and only that one did start-up work', async () => {
		// Fails loudly rather than skipping: a missing bundle means this test proves nothing.
		if (!existsSync(bundlePath)) {
			throw new Error(
				`The standalone bundle is missing at "${bundlePath}". It is built once by the bundling project global setup; run the test through vitest.`
			);
		}
		const isolation = createIsolatedCliEnv();
		// isolation.env has FLOW_QUEUE_EVENTS=0: the daemons must not declare events to the developer's real queue.
		const env: NodeJS.ProcessEnv = { ...isolation.env };
		for (const name of [
			'NODE_OPTIONS',
			'VITEST',
			'VITEST_WORKER_ID',
			'FLOW_CONFIG',
			'FLOW_CONFIG_DIR',
			'NODE_PATH',
		]) {
			delete env[name];
		}
		const installDir = mkdtempSync(join(tmpdir(), 'flow-singleton-install-'));
		// A daemon or worker of this directory that outlives the test fails the file (and is killed).
		processLeakGuard.watch(installDir);
		const projectDir = mkdtempSync(join(tmpdir(), 'flow-singleton-project-'));
		const configHome = mkdtempSync(join(tmpdir(), 'flow-singleton-config-'));
		mkdirSync(join(projectDir, '.flow'), { recursive: true });
		const installedFlow = join(installDir, 'flow.cjs');
		copyFileSync(bundlePath, installedFlow);
		const workerBundle = resolve(bundlePath, '..', 'worker.cjs');
		if (existsSync(workerBundle)) copyFileSync(workerBundle, join(installDir, 'worker.cjs'));

		const processes = Array.from({ length: PROCESS_COUNT }, () =>
			spawnDaemonMode(installedFlow, projectDir, configHome, env)
		);
		const report = () =>
			processes.map((p, i) => `#${String(i)} exit=${JSON.stringify(p.exit())}\n${p.output()}`).join('\n---\n');
		try {
			const settled = await pollUntil(() => processes.filter(p => p.exit() === undefined).length === 1, {
				timeoutMs: 60_000,
				intervalMs: 100,
			});
			expect(settled, `expected exactly one daemon process left alive.\n${report()}`).toBe(true);
			// Let a late duplicate (still starting) finish deciding before counting.
			await observeFor(1500);
			expect(
				processes.filter(p => p.exit() === undefined),
				report()
			).toHaveLength(1);
			for (const loser of processes.filter(p => p.exit() !== undefined)) {
				expect(loser.exit()?.code, `a daemon that yields must exit cleanly.\n${report()}`).toBe(0);
			}

			const survivor = processes.find(p => p.exit() === undefined)!;
			const published = await readPortFile(join(configHome, 'flow'));
			expect(published?.pid, 'the port file must name the surviving process').toBe(survivor.child.pid);

			const messages = daemonLog(configHome);
			expect(
				messages.filter(m => m.startsWith('Daemon started')),
				messages.join('\n')
			).toHaveLength(1);
			expect(
				messages.filter(m => m.startsWith('Reconciled')),
				messages.join('\n')
			).toHaveLength(1);
			expect(
				messages.filter(m => m.includes('already owns')),
				messages.join('\n')
			).toHaveLength(PROCESS_COUNT - 1);
		} finally {
			for (const p of processes) await killProcessTree(p.child);
			for (const dir of [isolation.root, installDir, projectDir, configHome]) removeTempDirectory(dir);
		}
	}, 120_000);
});
