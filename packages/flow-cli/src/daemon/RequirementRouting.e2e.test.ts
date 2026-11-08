/**
 * End to end, in one process: a REAL source registry, REAL worker-type instances built from a plugin that declares
 * guarantees (the fixture), the REAL source contact and the REAL command handler; only the worker sockets are stubs.
 *
 * A flow with `requires` waits until the source that declares the guarantee is asked for a worker, is handed only to a
 * worker of that source once it is built, and a flow requiring something no source declares is refused before anything runs.
 */
import { executionsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PluginLoader } from '../config/PluginLoader';
import { ExecutionStore } from '../storage/ExecutionStore';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture';
import type { CommandHandler } from './CommandHandler';
import {
	TrackedCommandHandler,
	createMockWorkerPool,
	emptyWorkerRouting,
	registerFolderAsProject,
} from './CommandHandlerTestHarness';
import { DaemonSourceContact } from './DaemonSourceContact';
import { DeclaredGuarantees } from './DeclaredGuarantees';
import { LaunchTokenIssuer } from './LaunchTokenIssuer';
import { RelayRegistry } from './RelayRegistry';
import { WorkerSourceRegistry } from './WorkerSourceRegistry';
import { WorkerTypeCatalog } from './WorkerTypeCatalog';
import { WorkerTypeInstances } from './WorkerTypeInstances';

/** Positions in the CommandHandler constructor (see CommandHandlerTestHarness). */
const REQUEST_SOURCES_INDEX = 12;
const ROUTING_INDEX = 19;

function idleWorker(name: string, sourceId?: string) {
	return {
		ws: { name },
		worker: {
			state: 'idle',
			workerId: name,
			pid: 1,
			labels: [] as string[],
			attachedProjectIds: [] as string[],
			attachedProjects: [] as string[],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [] as string[],
			features: [] as string[],
			...(sourceId === undefined ? {} : { sourceId }),
		},
	};
}

describe('requires: routed to the source that declares the guarantee', () => {
	let tmpDir: string;
	let daemonDir: string;
	let poolDir: string;
	let disposeProject: () => void;
	let fixture: WorkerTypeFixtureState;
	let handler: CommandHandler;
	let sources: WorkerSourceRegistry;
	let idle: ReturnType<typeof idleWorker>[];
	let sent: string[];

	function writeFlow(requires: string, profile?: string): string {
		const file = path.join(tmpDir, 'needs.yml');
		fs.writeFileSync(
			file,
			[
				'id: needs-flow',
				'version: "1.0.0"',
				'name: Needs Flow',
				'description: x',
				'inputs: {}',
				...(profile === undefined ? [] : [`profile: ${profile}`]),
				...(requires === '' ? [] : [`requires: ${requires}`]),
				`workspace: { provider: pool, dir: "${poolDir.replace(/\\/g, '/')}", prefix: ws-, count: 2 }`,
				'steps:',
				'  - id: only',
				'    name: Only',
				'    type: script',
				'    script: echo hi',
				'',
			].join('\n')
		);
		return file;
	}

	beforeEach(async () => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'requires-e2e-')));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		daemonDir = path.join(tmpDir, 'daemon');
		const logsDir = path.join(daemonDir, 'logs');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(logsDir, { recursive: true });
		poolDir = path.join(tmpDir, 'pool');
		for (const slot of ['ws-1', 'ws-2']) {
			fs.mkdirSync(path.join(poolDir, slot), { recursive: true });
		}
		fixture = resetWorkerTypeFixture();
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		// Two declared plugin sources: `sbx` declares and enforces fs=confined, `plain` declares nothing.
		sources = new WorkerSourceRegistry(path.join(tmpDir, 'config'));
		for (const [sourceId, implementation] of [
			['sbx', 'confined'],
			['plain', 'sandbox'],
		] as const) {
			sources.declare({
				sourceId,
				provider: 'fixture',
				plugin: `fixture-sandbox.${implementation}`,
				pluginsDir: FIXTURE_PLUGINS_DIR,
				labels: [],
				maxWorkers: 1,
			});
		}
		const instances = new WorkerTypeInstances(new PluginLoader(), () => {});
		const contact = new DaemonSourceContact(
			logsDir,
			sources,
			new RelayRegistry(sources),
			new LaunchTokenIssuer(),
			instances
		);
		const routing = {
			...emptyWorkerRouting(),
			workerTypes: new WorkerTypeCatalog(sources, instances, instances),
			declaredGuarantees: new DeclaredGuarantees(sources, instances, () => {}),
		};

		idle = [idleWorker('w-host'), idleWorker('w-plain', 'plain')];
		sent = [];
		const pool = createMockWorkerPool();
		pool.listIdle.mockImplementation(() => idle);
		pool.summarize.mockImplementation(() => idle.map(candidate => candidate.worker));
		pool.send.mockImplementation((ws: unknown) => {
			sent.push((ws as { name: string }).name);
			return true;
		});
		const args: ConstructorParameters<typeof TrackedCommandHandler> = [];
		args[0] = daemonDir;
		args[1] = pool as never;
		args[2] = pool as never;
		args[4] = new ExecutionStore(executionsDirOf(daemonDir));
		args[REQUEST_SOURCES_INDEX] = (types, ids) => {
			contact.contactSources(4101, types, ids);
		};
		args[ROUTING_INDEX] = routing;
		handler = new TrackedCommandHandler(...args);
	});

	afterEach(() => {
		handler.stopBackgroundWork();
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('asks only the source that declares the guarantee, then hands the step to a worker of that source only', async () => {
		const flowFile = writeFlow('["fs=confined"]');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		// The host worker and the worker of the source that guarantees nothing are idle, and neither took the step.
		expect(sent).toEqual([]);
		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toEqual(['sbx']));

		// The worker the source obtained connects: it takes the step, the others still do not.
		idle.push(idleWorker('w-sbx', 'sbx'));
		handler.tryDispatch();

		expect(sent).toEqual(['w-sbx']);
	});

	it('refuses at run start a flow requiring something no declared source declares, naming the near match', async () => {
		const flowFile = writeFlow('["fs=confind"]');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(response)).toMatch(/unknown requirement.*Did you mean .*fs=confined/s);
		expect(fixture.obtained).toEqual([]);
		expect(fs.readdirSync(executionsDirOf(daemonDir))).toEqual([]);
	});

	it('refuses a guarantee the source manifest allows but whose instance does not enforce: the step is never handed to it', async () => {
		// `confined` declares `sandbox` in its manifest but its instance enforces only fs=confined and env=clean.
		const flowFile = writeFlow('["sandbox"]');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(response.type).toBe('execution_started');
		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toEqual(['sbx']));
		idle.push(idleWorker('w-sbx', 'sbx'));
		handler.tryDispatch();

		expect(sent).toEqual([]);
	});

	// Asking for a guarantee is an explicit opt-in, like binding by workerType: an exclusive source serves it.
	it('serves a step with requirements from an exclusive source that guarantees them, asked by id', async () => {
		sources.declare({
			sourceId: 'xsbx',
			provider: 'fixture',
			plugin: 'fixture-sandbox.exclusiveconfined',
			pluginsDir: FIXTURE_PLUGINS_DIR,
			labels: [],
			maxWorkers: 1,
		});
		const flowFile = writeFlow('["exclusive-only"]');

		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(response.type).toBe('execution_started');
		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toEqual(['xsbx']));
		idle.push(idleWorker('w-x', 'xsbx'));
		handler.tryDispatch();

		expect(sent).toEqual(['w-x']);
	});

	// A profile is a named set of requirements: it routes exactly like the same list written in requires.
	describe('profile: expanded to the guarantees the sources declare', () => {
		it('serves profile agent (fs=confined, env=clean) from the sbx-like source only, never from a source that declares nothing', async () => {
			const flowFile = writeFlow('', 'agent');

			const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

			expect(response.type).toBe('execution_started');
			// The host worker and the worker of the source that guarantees nothing are idle, and neither took the step.
			expect(sent).toEqual([]);
			await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toEqual(['sbx']));
			idle.push(idleWorker('w-sbx', 'sbx'));
			handler.tryDispatch();

			expect(sent).toEqual(['w-sbx']);
			const executionId = (response as { executionId: string }).executionId;
			const record = JSON.parse(
				fs.readFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), 'utf8')
			) as { requirements: unknown };
			expect(record.requirements).toEqual({
				run: ['env=clean', 'fs=confined'],
				steps: { only: ['env=clean', 'fs=confined'] },
				profiles: { run: 'agent', steps: {} },
			});
		});

		it('refuses profile inspect at run start: no declared source guarantees fs=readonly-enforced, and the message says which', async () => {
			const flowFile = writeFlow('', 'inspect');

			const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

			expect(response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
			expect(JSON.stringify(response)).toMatch(/profile .{1,6}inspect.{1,6} requires .{1,6}fs=readonly-enforced/);
			expect(fixture.obtained).toEqual([]);
			expect(fs.readdirSync(executionsDirOf(daemonDir))).toEqual([]);
		});
	});
});
