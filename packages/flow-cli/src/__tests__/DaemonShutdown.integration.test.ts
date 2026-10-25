/**
 * Every way a flow daemon (and the workers it forked) can stop, against the REAL standalone bundle: after the trigger the
 * daemon process and ALL its flow descendants must be gone, within a bound.
 *
 * Orphaned `flow.cjs` daemons holding ports 47825-47834 and `worker.cjs` children piled up on a developer machine
 * (the oldest 5.5 days). In-process tests cannot see that class of bug: a vitest process never "fails to exit". Each case
 * here runs a private daemon (throwaway config dir, port 0) and looks at the operating system's process table.
 */
import * as net from 'node:net';
import { describe, expect, it } from 'vitest';

import { type BundledDaemon, startBundledDaemon } from '../test-utils/BundledDaemonHarness';
import { type OsProcess, isFlowProcess, listOsProcesses, processLeakGuard } from '../test-utils/ProcessLeakGuard';
import { requireBashOrSkip } from '../test-utils/TestHelpers';
import { pollUntil } from '../test-utils/WaitHelpers';

processLeakGuard.arm();

/** Flow processes of this daemon's private install directory, whatever their parent. */
function flowProcessesOf(daemon: BundledDaemon): OsProcess[] {
	return listOsProcesses().filter(p => isFlowProcess(p.commandLine) && p.commandLine.includes(daemon.installDir));
}

function describeProcesses(processes: OsProcess[]): string {
	return (
		processes.map(p => `pid ${String(p.pid)} (parent ${String(p.ppid)}): ${p.commandLine}`).join('\n') || '(none)'
	);
}

async function expectAllGone(daemon: BundledDaemon, within: number): Promise<void> {
	let last: OsProcess[] = [];
	const gone = await pollUntil(
		() => {
			last = flowProcessesOf(daemon);
			return last.length === 0;
		},
		{ timeoutMs: within, intervalMs: 500 }
	);
	expect(
		gone,
		`still alive ${String(within)} ms later:\n${describeProcesses(last)}\ndaemon output:\n${daemon.output()}`
	).toBe(true);
}

async function waitForWorker(daemon: BundledDaemon): Promise<OsProcess> {
	let worker: OsProcess | undefined;
	const found = await pollUntil(
		() => {
			worker = flowProcessesOf(daemon).find(p => p.commandLine.includes('worker.cjs'));
			return worker !== undefined;
		},
		{ timeoutMs: 60_000, intervalMs: 500 }
	);
	expect(found, `the daemon never forked a worker.\n${daemon.output()}`).toBe(true);
	return worker!;
}

async function withDaemon(body: (daemon: BundledDaemon) => Promise<void>, env: NodeJS.ProcessEnv = {}): Promise<void> {
	const daemon = await startBundledDaemon({ env });
	try {
		await body(daemon);
	} finally {
		await daemon.dispose();
	}
}

describe('daemon shutdown paths (real bundle, private daemon)', () => {
	it('a daemon that nothing ever used stops itself and its process exits', async () => {
		await withDaemon(
			async daemon => {
				const exited = await pollUntil(() => daemon.exit() !== undefined, {
					timeoutMs: 60_000,
					intervalMs: 200,
				});

				expect(exited, `the daemon stayed up with nothing to do.\n${daemon.output()}`).toBe(true);
				expect(daemon.exit()?.code).toBe(0);
				expect(await daemon.published(), 'the port file of a stopped daemon must be gone').toBeNull();
				await expectAllGone(daemon, 15_000);
			},
			{ FLOW_DAEMON_IDLE_CHECK_MS: '500' }
		);
	}, 120_000);

	it('`flow stop` ends the process even with a peer connected that never registered', async () => {
		await withDaemon(async daemon => {
			const wsPort = await pollUntil(() => daemon.workerPort() !== null, { timeoutMs: 30_000 });
			expect(wsPort, 'the worker port was never published').toBe(true);
			// Completes the WebSocket upgrade and then says nothing: in no registry, so nobody else would ever close it.
			const peer = net.connect(daemon.workerPort()!, '127.0.0.1');
			try {
				await new Promise<void>(resolve => peer.once('connect', () => resolve()));
				peer.write(
					'GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'
				);
				await new Promise<void>(resolve => peer.once('data', () => resolve()));

				expect((await daemon.post('/quit')).status).toBe(200);

				const exited = await pollUntil(() => daemon.exit() !== undefined, {
					timeoutMs: 30_000,
					intervalMs: 200,
				});
				expect(
					exited,
					`the daemon deleted its port file but its process is still alive (a connected socket keeps it up).\n${daemon.output()}`
				).toBe(true);
			} finally {
				peer.destroy();
			}
		});
	}, 120_000);

	it('a hard-killed daemon takes its busy forked worker with it (the worker notices the lost connection)', async () => {
		if (!requireBashOrSkip('DaemonShutdown')) return;
		await withDaemon(async daemon => {
			await daemon.runScript('hard-kill', 'sleep 120');
			await waitForWorker(daemon);
			const pid = (await daemon.published())!.pid;

			// Only the daemon, not its tree: the worker has to end by itself.
			process.kill(pid, 'SIGKILL');

			await expectAllGone(daemon, 30_000);
		});
	}, 180_000);

	it('an idle daemon with connected workers exits, and so do the workers', async () => {
		if (!requireBashOrSkip('DaemonShutdown')) return;
		await withDaemon(async daemon => {
			await daemon.runScript('idle-with-workers', 'echo hi');

			const exited = await pollUntil(() => daemon.exit() !== undefined, { timeoutMs: 90_000, intervalMs: 200 });

			expect(exited, `the daemon did not stop after its run finished.\n${daemon.output()}`).toBe(true);
			await expectAllGone(daemon, 30_000);
		});
	}, 180_000);

	it('`flow stop` while a worker is busy ends the daemon and the worker', async () => {
		if (!requireBashOrSkip('DaemonShutdown')) return;
		await withDaemon(async daemon => {
			await daemon.runScript('stop-busy', 'sleep 120');
			await waitForWorker(daemon);

			expect((await daemon.post('/quit')).status).toBe(200);

			await expectAllGone(daemon, 30_000);
		});
	}, 180_000);
});
