// Integration test: real daemon, real forked worker (`npm run build` first), real bash.
// A flow registered at 1.0.0 runs, is edited to 1.1.0 and runs again: the second run follows the latest version,
// a third run pinned to 1.0.0 runs the snapshot of the first one, and nothing rewrites that snapshot.
import type { ExecutionState } from 'flow-core';
import { createTempDirectory } from 'flow-core/testing';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

function registryEntry(version: string, marker: string): Record<string, unknown> {
	return {
		version,
		name: 'Versioned',
		description: 'Flow versions end to end',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'if-available' },
		steps: [{ id: 'only', name: 'Only step', type: 'script', shell: 'bash', script: `echo ${marker}` }],
	};
}

describe('flow versions (end to end)', () => {
	let workDir: string;
	let registryFile: string;
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
		workDir = fs.realpathSync(createTempDirectory('versions-e2e-'));
		fs.mkdirSync(path.join(workDir, '.flow'));
		registryFile = path.join(workDir, '.flow', 'flows.yml');
		await registry.register('versions-e2e', { folder: workDir });
	});

	afterEach(() => {
		registry.dispose();
	});

	it('follows the latest version, runs a pinned one from its snapshot, and keeps snapshots unchanged', async () => {
		if (!requireBashOrSkip('FlowVersions')) return;
		await using ctx = await startTestDaemon();

		// Starts a run and returns its id. The refused request below is also sent while a run is still in flight.
		const start = async (flowVersion?: string): Promise<string> => {
			const response = await ctx.client.send('run', {
				type: 'run',
				flowFile: registryFile,
				flowId: 'versioned',
				registered: true,
				...(flowVersion === undefined ? {} : { flowVersion }),
				cwd: workDir,
			});
			if (response.type !== 'execution_started') {
				throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
			}
			return response.executionId;
		};
		const finish = async (executionId: string): Promise<ExecutionState> => {
			const state = await waitForExecution(ctx.daemonDir, executionId, 30000);
			expect(state.status).toBe('completed');
			return state;
		};
		const run = async (flowVersion?: string): Promise<ExecutionState> => finish(await start(flowVersion));
		const snapshotPath = (state: ExecutionState): string =>
			path.join(ctx.daemonDir, 'definitions', ...state.definitionSnapshot!.split('/'));

		fs.writeFileSync(registryFile, yaml.dump({ versioned: registryEntry('1.0.0', 'marker-v1') }));
		const first = await run();
		const firstSnapshotBytes = fs.readFileSync(snapshotPath(first));

		fs.writeFileSync(registryFile, yaml.dump({ versioned: registryEntry('1.1.0', 'marker-v2') }));
		const second = await run();
		const pinnedId = await start('1.0.0');

		// Editing the content without bumping the version is refused, and no record is added.
		fs.writeFileSync(registryFile, yaml.dump({ versioned: registryEntry('1.1.0', 'marker-edited') }));
		const refused = await ctx.client.send('run', {
			type: 'run',
			flowFile: registryFile,
			flowId: 'versioned',
			registered: true,
			cwd: workDir,
		});
		expect(refused).toMatchObject({ type: 'error', code: 'FLOW_VERSION_CONFLICT' });
		const pinned = await finish(pinnedId);

		expect([first, second, pinned].map(state => [state.flowVersion, state.versionChoice])).toEqual([
			['1.0.0', 'latest'],
			['1.1.0', 'latest'],
			['1.0.0', 'pinned'],
		]);
		expect(second.definitionHash).not.toBe(first.definitionHash);
		expect(pinned.definitionHash).toBe(first.definitionHash);
		expect(pinned.definitionSnapshot).toBe(first.definitionSnapshot);
		expect(second.definitionSnapshot).not.toBe(first.definitionSnapshot);
		// The first snapshot is byte for byte what ran first, and still holds the first script.
		expect(fs.readFileSync(snapshotPath(first)).equals(firstSnapshotBytes)).toBe(true);
		expect(firstSnapshotBytes.toString('utf8')).toContain('marker-v1');
		expect(fs.readFileSync(snapshotPath(second), 'utf8')).toContain('marker-v2');
		// The pinned run really ran the old script: its recorded step output holds the old marker.
		expect(JSON.stringify(pinned.steps)).toContain('marker-v1');
		expect(JSON.stringify(pinned.steps)).not.toContain('marker-v2');

		expect(fs.readdirSync(path.join(ctx.daemonDir, 'executions'))).toHaveLength(3);
	}, 90000);
});
