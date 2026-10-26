/**
 * A daemon that dies while starting must tell the command that spawned it WHY.
 *
 * Real bundle, private daemon. A daemon started from a folder that still holds a repository-local `.flow/config.yml`
 * refuses to start; its only trace used to be the stderr of a detached process, so `flow run` and `flow start` waited
 * for the port file and printed "Daemon did not start within 10000ms" without any cause.
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
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';
import { processLeakGuard } from '../test-utils/ProcessLeakGuard';

// Every CLI/daemon process this file starts must be gone when it ends (see ProcessLeakGuard).
processLeakGuard.arm();

const __dirname = dirname(fileURLToPath(import.meta.url));
// FLOW_TEST_BUNDLE_DIR: another build (an older one, to watch this test fail), as the BundledDaemonHarness does.
const bundleDir = process.env['FLOW_TEST_BUNDLE_DIR'] ?? resolve(__dirname, '..', '..', 'dist-bundle');

interface FlowResult {
	status: number | null;
	output: string;
	elapsedMs: number;
}

function runFlow(installedFlow: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<FlowResult> {
	const startedAt = Date.now();
	return new Promise((resolveRun, reject) => {
		const child = spawn(process.execPath, [installedFlow, ...args], {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
			timeout: 120_000,
		});
		let output = '';
		child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		child.on('error', reject);
		child.on('exit', status => {
			resolveRun({ status, output, elapsedMs: Date.now() - startedAt });
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

describe('a daemon that cannot start (standalone bundle, private daemon)', () => {
	it(
		'names the cause and the fix in flow run and flow start, logs it, and clears it on the next good start',
		{
			timeout: 180_000,
		},
		async () => {
			for (const name of ['flow.cjs', 'worker.cjs']) {
				if (!existsSync(join(bundleDir, name))) {
					throw new Error(`The standalone bundle is missing at "${join(bundleDir, name)}".`);
				}
			}
			const isolation = createIsolatedCliEnv();
			const installDir = mkdtempSync(join(tmpdir(), 'flow-startfail-install-'));
			processLeakGuard.watch(installDir);
			const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'flow-startfail-project-')));
			const configHome = mkdtempSync(join(tmpdir(), 'flow-startfail-config-'));
			copyFileSync(join(bundleDir, 'flow.cjs'), join(installDir, 'flow.cjs'));
			copyFileSync(join(bundleDir, 'worker.cjs'), join(installDir, 'worker.cjs'));
			await addProject(defaultRegistryDir({ XDG_CONFIG_HOME: configHome }), {
				name: 'startfail-probe',
				path: projectDir,
			});
			const env: NodeJS.ProcessEnv = { ...isolation.env, XDG_CONFIG_HOME: configHome, FLOW_DAEMON_PORT: '0' };
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
			const flowDir = join(configHome, 'flow');
			const installedFlow = join(installDir, 'flow.cjs');
			const flowFile = join(projectDir, 'probe.yml');
			writeFileSync(
				flowFile,
				[
					'id: probe',
					'version: "1.0.0"',
					'name: probe',
					'description: start failure probe',
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
			const legacy = join(projectDir, '.flow', 'config.yml');
			mkdirSync(join(projectDir, '.flow'), { recursive: true });
			writeFileSync(legacy, 'plugins: {}\n');
			const flow = (args: string[], cwd: string, extra: NodeJS.ProcessEnv = {}) =>
				runFlow(installedFlow, args, cwd, { ...env, ...extra });
			try {
				const run = await flow(['run', flowFile], projectDir);
				expect(run.output, 'flow run must name the real cause').toContain('is no longer read');
				expect(run.output, 'flow run must give the fix').toContain('Move it');
				expect(run.output).not.toContain('did not start within');
				expect(run.output, 'no stack trace without FLOW_DEBUG').not.toMatch(/\n\s+at [^\n]+:\d+:\d+/);
				expect(run.status, run.output).toBe(3);
				expect(
					run.elapsedMs,
					'the failure should be reported as soon as the daemon died, not after the timeout'
				).toBeLessThan(9_000);

				const start = await flow(['start'], projectDir);
				expect(start.output, 'flow start must name the real cause').toContain('is no longer read');
				expect(start.output).toContain('Move it');
				expect(start.output).not.toContain('did not start within');
				expect(start.status, start.output).toBe(3);

				const log = daemonLog(flowDir);
				expect(log, 'the daemon log must hold the fatal start-up error').toContain('is no longer read');
				expect(existsSync(join(flowDir, 'daemon-start-error.json'))).toBe(true);

				// The fix, then a start from the same folder: the recorded error must not outlive the failure it describes.
				rmSync(legacy);
				const good = await flow(['start'], projectDir);
				expect(good.status, good.output).toBe(0);
				expect(existsSync(join(flowDir, 'daemon-start-error.json'))).toBe(false);
			} finally {
				await flow(['stop'], tmpdir()).catch(() => undefined);
				for (const dir of [isolation.root, installDir, projectDir, configHome]) {
					removeTempDirectory(dir);
				}
			}
		}
	);
});
