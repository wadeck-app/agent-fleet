// Integration test: real daemon, real forked workers (`npm run build` first), real bash.
// `flow cancel` ends ONE running execution while another run on the same daemon continues untouched.
import { createTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExecutionStore } from '../storage/ExecutionStore';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

armLeakGuardBeforeAll();

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

function flowYaml(id: string, script: string): string {
	return `id: ${id}
version: "1.0.0"
name: ${id}
description: Flow cancel end to end
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: only
    name: Only step
    type: script
    shell: bash
    script: ${script}
`;
}

describe('flow cancel (end to end)', () => {
	let workDir: string;
	let registry: RegisteredProjectFixture;

	beforeAll(() => {
		if (!fs.existsSync(workerBinary)) {
			throw new Error(
				`Worker binary not found at ${workerBinary}: run 'npm run build' in packages/flow-cli first.`
			);
		}
	});

	beforeEach(async () => {
		registry = new RegisteredProjectFixture().useAsProcessEnv();
		workDir = fs.realpathSync(createTempDirectory('cancel-e2e-'));
		await registry.register('cancel-e2e', { folder: workDir });
	});

	afterEach(() => {
		registry.dispose();
	});

	it('cancels a running execution while another run of the same daemon keeps going and completes', async () => {
		if (!requireBashOrSkip('FlowCancel')) return;
		await using ctx = await startTestDaemon({ concurrency: 2 });
		const store = new ExecutionStore(path.join(ctx.daemonDir, 'executions'));

		const start = async (id: string, script: string): Promise<string> => {
			const flowFile = path.join(workDir, `${id}.yml`);
			fs.writeFileSync(flowFile, flowYaml(id, script));
			const response = await ctx.client.send('run', { type: 'run', flowFile, cwd: workDir });
			if (response.type !== 'execution_started') {
				throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
			}
			return response.executionId;
		};
		const waitUntilStepRuns = (executionId: string): Promise<void> =>
			vi.waitFor(() => expect(store.read(executionId).steps['only']?.status).toBe('running'), {
				timeout: 30_000,
				interval: 100,
			});

		const stuck = await start('stuck-flow', 'sleep 120');
		const survivor = await start('survivor-flow', 'sleep 4; echo survivor-done');
		await waitUntilStepRuns(stuck);
		await waitUntilStepRuns(survivor);

		const response = await ctx.client.send('cancel', { type: 'cancel', executionId: stuck });

		expect(response).toEqual({ type: 'execution_cancelled', executionId: stuck, alreadyCancelled: false });
		const cancelled = store.read(stuck);
		expect(cancelled).toMatchObject({ status: 'failed', endReason: 'cancelled', lastError: 'cancelled by user' });
		expect(cancelled.steps['only']).toMatchObject({ status: 'failed', error: 'cancelled by user' });

		// The other run is untouched and ends normally, on the same daemon
		const finished = await waitForExecution(ctx.daemonDir, survivor, 60_000);
		expect(finished.status).toBe('completed');
		expect(JSON.stringify(finished.steps)).toContain('survivor-done');

		// The daemon still answers, and cancelling again is a no-op success
		expect(await ctx.client.send('cancel', { type: 'cancel', executionId: stuck })).toEqual({
			type: 'execution_cancelled',
			executionId: stuck,
			alreadyCancelled: true,
		});
	}, 120_000);
});
