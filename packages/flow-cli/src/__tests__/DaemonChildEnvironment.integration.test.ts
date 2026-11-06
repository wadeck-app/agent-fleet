/**
 * What the REAL bundle in daemon mode hands to the programs it starts on its own.
 *
 * Incident 2026-11-06: the daemon publishes its events through the queue SDK, which runs `queue start` with the
 * daemon's whole environment when the queue is down. The queue daemon (and, in turn, every subscriber command it runs)
 * then carried FLOW_DAEMON_MODE=1, and FlowIndex turns any process with that variable into a daemon *whatever its
 * arguments*: a subscriber's `flow run ...` became a daemon that yielded to the live one and exited 0 with no output
 * and no execution.
 */
import { OWN_PROCESS_GROUP, killProcessTree, removeTempDirectory } from 'flow-core/testing';
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';
import { processLeakGuard } from '../test-utils/ProcessLeakGuard';
import { waitUntil } from '../test-utils/WaitHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(__dirname, '..', '..', 'dist-bundle', 'flow.cjs');

armLeakGuardBeforeAll();

/** A `queue` program that records the FLOW_DAEMON_MODE it was started with, and does nothing else. */
function writeRecordingQueue(binDir: string, recordFile: string): void {
	if (process.platform === 'win32') {
		writeFileSync(join(binDir, 'queue.cmd'), `@echo mode=[%FLOW_DAEMON_MODE%]> "${recordFile}"\r\n`);
		return;
	}
	const script = join(binDir, 'queue');
	writeFileSync(script, `#!/bin/sh\necho "mode=[$FLOW_DAEMON_MODE]" > "${recordFile}"\n`);
	chmodSync(script, 0o755);
}

describe('the standalone bundle in daemon mode', () => {
	it('does not pass FLOW_DAEMON_MODE to the queue it starts to publish its events', async () => {
		// Fails loudly rather than skipping: a missing bundle means this test proves nothing.
		if (!existsSync(bundlePath)) {
			throw new Error(
				`The standalone bundle is missing at "${bundlePath}". It is built once by the bundling project global setup; run the test through vitest.`
			);
		}
		const isolation = createIsolatedCliEnv({ queueEvents: true });
		const env: NodeJS.ProcessEnv = { ...isolation.env };
		for (const name of ['NODE_OPTIONS', 'VITEST', 'VITEST_WORKER_ID', 'FLOW_CONFIG', 'NODE_PATH']) {
			delete env[name];
		}
		const installDir = mkdtempSync(join(tmpdir(), 'flow-childenv-install-'));
		processLeakGuard.watch(installDir);
		const binDir = mkdtempSync(join(tmpdir(), 'flow-childenv-bin-'));
		const projectDir = mkdtempSync(join(tmpdir(), 'flow-childenv-project-'));
		mkdirSync(join(projectDir, '.flow'), { recursive: true });
		const installedFlow = join(installDir, 'flow.cjs');
		copyFileSync(bundlePath, installedFlow);
		const workerBundle = resolve(bundlePath, '..', 'worker.cjs');
		if (existsSync(workerBundle)) copyFileSync(workerBundle, join(installDir, 'worker.cjs'));

		const recordFile = join(binDir, 'seen.txt');
		writeRecordingQueue(binDir, recordFile);
		const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
		env[pathKey] = `${binDir}${delimiter}${env[pathKey] ?? ''}`;
		// Where the SDK looks for the queue daemon: nothing runs there, so it has to start one.
		env['QUEUE_CONFIG_DIR'] = join(isolation.root, 'queue-config');

		const daemon = spawn(process.execPath, [installedFlow], {
			cwd: projectDir,
			env: { ...env, FLOW_DAEMON_MODE: '1', FLOW_DAEMON_PORT: '0' },
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: OWN_PROCESS_GROUP,
		});
		let output = '';
		daemon.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		daemon.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		try {
			await waitUntil(() => existsSync(recordFile), {
				timeoutMs: 30_000,
				intervalMs: 100,
				failureMessage: `the daemon never ran "queue start" (daemon output: ${output})`,
			});
			expect(readFileSync(recordFile, 'utf8').trim()).toBe('mode=[]');
		} finally {
			await killProcessTree(daemon);
			for (const dir of [isolation.root, installDir, binDir, projectDir]) removeTempDirectory(dir);
		}
	}, 60_000);
});
