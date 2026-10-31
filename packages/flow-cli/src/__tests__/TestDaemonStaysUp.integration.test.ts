// Integration test: real daemon, real forked worker (`npm run build` first), real bash.
// Why it exists: a daemon stops SHUTDOWN_GRACE_MS after its last execution ends. A real `flow run` starts a new one;
// a test client does not, so any test that sends a second run after the first finished raced that timer (it passed
// alone and failed under load with `Daemon is not running (connection failed: connect ECONNREFUSED ...)`).
// The test daemon therefore stays up until the test disposes it, and DaemonShutdownRace opts back in to idle stops.
import { createTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHUTDOWN_GRACE_MS } from '../daemon/DaemonIdleShutdown';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';
import { observeFor } from '../test-utils/WaitHelpers';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';

armLeakGuardBeforeAll();

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

const FLOW_YAML = `id: stay-up
version: 1.0.0
name: Stay up
description: one script step
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
steps:
  - id: only
    name: Only step
    type: script
    shell: bash
    script: echo hello
`;

describe('a test daemon between two runs', () => {
	let workDir: string;
	let flowFile: string;
	let registry: RegisteredProjectFixture;

	beforeAll(() => {
		if (!fs.existsSync(workerBinary)) {
			throw new Error(
				`Worker binary not found at ${workerBinary}: run 'npm run build' in packages/flow-cli first.`
			);
		}
	});

	beforeEach(async () => {
		// The in-process daemon resolves the project of each run from this process's registry.
		registry = new RegisteredProjectFixture().useAsProcessEnv();
		workDir = fs.realpathSync(createTempDirectory('daemon-stays-up-'));
		flowFile = path.join(workDir, 'flow.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		await registry.register('stay-up', { folder: workDir });
	});

	afterEach(() => {
		registry.dispose();
	});

	it('still accepts a run sent after the idle grace period elapsed since the previous one ended', async () => {
		if (!requireBashOrSkip('TestDaemonStaysUp')) return;
		await using ctx = await startTestDaemon();

		const run = async (): Promise<void> => {
			const response = await ctx.client.send('run', { type: 'run', flowFile, cwd: workDir });
			if (response.type !== 'execution_started') {
				throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
			}
			const state = await waitForExecution(ctx.daemonDir, response.executionId, 30000);
			expect(state.status).toBe('completed');
		};

		await run();
		// What a loaded machine does to the polling in waitForExecution: the second run comes late.
		await observeFor(SHUTDOWN_GRACE_MS * 2);
		await run();
	}, 90000);
});
