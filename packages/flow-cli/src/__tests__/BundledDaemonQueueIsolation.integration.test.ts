// A daemon spawned by the test harness must never touch the developer's real queue: observed once, a test run logged
// "declared to the queue (6 events)" against the real one. The proof is the daemon's own log line: it can only say
// that events are switched off if FLOW_QUEUE_EVENTS=0 reached the daemon process.
import { logsDirOf } from 'flow-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { startBundledDaemon } from '../test-utils/BundledDaemonHarness';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';
import { pollUntil } from '../test-utils/WaitHelpers';

armLeakGuardBeforeAll();

function daemonLog(flowDir: string): string {
	const dir = logsDirOf(flowDir);
	return existsSync(dir)
		? readdirSync(dir)
				.map(name => readFileSync(join(dir, name), 'utf8'))
				.join('\n')
		: '';
}

describe('bundled daemon of the test harness and the real queue', () => {
	it('starts with the queue events switched off and never declares events', async () => {
		const daemon = await startBundledDaemon();
		try {
			const reported = await pollUntil(() => daemonLog(daemon.flowDir).includes('Queue events:'), {
				timeoutMs: 30_000,
				intervalMs: 200,
			});
			const log = daemonLog(daemon.flowDir);

			expect(reported, `the daemon never reported its queue events status.\n${log}\n${daemon.output()}`).toBe(
				true
			);
			expect(log).toContain('FLOW_QUEUE_EVENTS=0 is set');
			expect(log).not.toContain('declared to the queue');
		} finally {
			await daemon.dispose();
		}
	}, 90_000);
});
