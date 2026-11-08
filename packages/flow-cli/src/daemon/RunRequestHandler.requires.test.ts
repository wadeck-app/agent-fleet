/**
 * `requires:` is resolved ONCE, when the daemon accepts the run: the flow set merged into each step's, recorded in the
 * execution record (outside the definition snapshot and its hash), checked against what the declared sources may provide,
 * and used for every placement of the run. A run that starts again after a restart uses the record, never the definition.
 *
 * REAL CommandHandler, execution store, validator and pool provider (temp folders); only the worker pool is a stub.
 */
import { DefinitionSnapshotStore, FlowDefinitionResolver, definitionsDirOf, executionsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ExecutionState } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import { DEFAULT_BOUND_STEP_WAIT_MS, type WorkerTypeRouting } from './BoundStepWait';
import type { CommandHandler } from './CommandHandler';
import {
	TrackedCommandHandler,
	createMockWorkerPool,
	emptyWorkerRouting,
	registerFolderAsProject,
} from './CommandHandlerTestHarness';
import { DeclaredGuarantees } from './DeclaredGuarantees';
import { SourceContactErrors } from './SourceContactErrors';
import type { WorkerSourceEntry } from './WorkerSourceRegistry';
import { WorkerTypeCatalog } from './WorkerTypeCatalog';

interface Assign {
	type: string;
	stepId: string;
	executionContext: { executionId: string };
}

/** Index of `workerRouting`, the last constructor parameter (see CommandHandlerTestHarness). */
const ROUTING_INDEX = 19;

describe('RunRequestHandler -- requires', () => {
	let tmpDir: string;
	let daemonDir: string;
	let poolDir: string;
	let flowFile: string;
	let disposeProject: () => void;
	let handlers: CommandHandler[];
	let pool: ReturnType<typeof createMockWorkerPool>;
	let store: ExecutionStore;
	let declaredBySource: Record<string, string[]>;
	let order: string[];

	function writeFlow(lines: { flowRequires?: string; stepRequires?: string } = {}): string {
		const poolPath = poolDir.replace(/\\/g, '/');
		const text = [
			'id: needs-flow',
			'version: "1.0.0"',
			'name: Needs Flow',
			'description: x',
			'inputs: {}',
			...(lines.flowRequires === undefined ? [] : [`requires: ${lines.flowRequires}`]),
			`workspace: { provider: pool, dir: "${poolPath}", prefix: ws-, count: 2 }`,
			'steps:',
			'  - id: only',
			'    name: Only',
			'    type: script',
			'    script: echo hi',
			...(lines.stepRequires === undefined ? [] : [`    requires: ${lines.stepRequires}`]),
			'',
		].join('\n');
		fs.writeFileSync(flowFile, text);
		return text;
	}

	function newHandler(): CommandHandler {
		const sources = Object.keys(declaredBySource).map(
			sourceId =>
				({
					sourceId,
					provider: 'x',
					plugin: `${sourceId}.impl`,
					pluginsDir: '/p',
					labels: [],
					maxWorkers: 1,
					tokenHash: 'h',
					createdAt: 'x',
				}) as WorkerSourceEntry
		);
		const declared = new DeclaredGuarantees(
			{ list: () => sources },
			{
				declaredGuarantees: async entry => {
					order.push('read-declaration');
					return declaredBySource[entry.sourceId] ?? [];
				},
			},
			() => {}
		);
		const routing: WorkerTypeRouting = {
			...emptyWorkerRouting(),
			workerTypes: new WorkerTypeCatalog({ list: () => sources }, { isExclusive: () => false }),
			boundStepWaitMs: DEFAULT_BOUND_STEP_WAIT_MS,
			contactErrors: new SourceContactErrors(),
			declaredGuarantees: declared,
		};
		const args: ConstructorParameters<typeof TrackedCommandHandler> = [];
		args[0] = daemonDir;
		args[1] = pool as never;
		args[2] = pool as never;
		args[4] = store;
		args[ROUTING_INDEX] = routing;
		const handler = new TrackedCommandHandler(...args);
		handlers.push(handler);
		return handler;
	}

	const record = (executionId: string): ExecutionState =>
		JSON.parse(
			fs.readFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), 'utf8')
		) as ExecutionState;

	const assigns = (): Assign[] =>
		pool.send.mock.calls.map(call => call[1] as Assign).filter(message => message.type === 'assign');

	async function run(handler: CommandHandler): Promise<string> {
		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		if (response.type !== 'execution_started') {
			throw new Error(`expected execution_started, got ${JSON.stringify(response)}`);
		}
		return response.executionId;
	}

	beforeEach(async () => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'run-requires-')));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(path.join(daemonDir, 'logs'), { recursive: true });
		poolDir = path.join(tmpDir, 'pool');
		for (const slot of ['ws-1', 'ws-2']) {
			fs.mkdirSync(path.join(poolDir, slot), { recursive: true });
		}
		flowFile = path.join(tmpDir, 'needs-flow.yml');
		handlers = [];
		declaredBySource = { sbx: ['env=clean', 'fs=confined'] };
		order = [];
		store = new ExecutionStore(executionsDirOf(daemonDir));
		pool = createMockWorkerPool();
		pool.send.mockReturnValue(true);
		pool.getIdle.mockReturnValue({});
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		for (const handler of handlers) {
			handler.stopBackgroundWork();
		}
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('records the flow set merged into the step set when the run is accepted', async () => {
		writeFlow({ flowRequires: '["fs=confined"]', stepRequires: '["env=clean"]' });

		const executionId = await run(newHandler());

		expect(record(executionId).requirements).toEqual({
			run: ['fs=confined'],
			steps: { only: ['env=clean', 'fs=confined'] },
		});
	});

	it('keeps the resolved set out of the definition snapshot: the snapshot is the flow as written', async () => {
		const text = writeFlow({ flowRequires: '["fs=confined"]' });

		const state = record(await run(newHandler()));

		const snapshot = fs.readFileSync(
			path.join(definitionsDirOf(daemonDir), state.definitionSnapshot as string),
			'utf8'
		);
		expect(snapshot).toBe(text);
	});

	it('records no requirements for a run that requires nothing (record shape of older daemons)', async () => {
		writeFlow();

		expect(record(await run(newHandler()))).not.toHaveProperty('requirements');
	});

	it('refuses a requirement no declared source provides, before anything is recorded', async () => {
		writeFlow({ flowRequires: '["fs=confind"]' });

		const response = await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(response)).toMatch(/Did you mean .*fs=confined/);
		expect(fs.readdirSync(executionsDirOf(daemonDir))).toEqual([]);
	});

	it('reads the declarations of the sources before it checks the flow (the daemon may have just started)', async () => {
		writeFlow({ flowRequires: '["fs=confined"]' });

		const response = await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		expect(order).toContain('read-declaration');
	});

	it('hands a step with requirements to no worker whose source guarantees nothing', async () => {
		writeFlow({ flowRequires: '["fs=confined"]' });
		const handler = newHandler();

		await run(handler);
		handler.tryDispatch();

		expect(assigns()).toEqual([]);
	});

	describe('a waiting run that starts again after a restart', () => {
		/** What a daemon that stopped while the run waited leaves behind; the definition says nothing about requirements. */
		function leaveWaitingRecord(executionId: string, requirements: ExecutionState['requirements']): void {
			const text = writeFlow();
			const resolver = new FlowDefinitionResolver(new DefinitionSnapshotStore(definitionsDirOf(daemonDir)));
			const flow = {
				id: 'needs-flow',
				version: '1.0.0',
				name: 'Needs Flow',
				description: 'x',
				inputs: {},
				workspace: { provider: 'pool', dir: poolDir.replace(/\\/g, '/'), prefix: 'ws-', count: 2 },
				steps: [{ id: 'only', name: 'Only', type: 'script', script: 'echo hi' }],
			};
			const resolved = resolver.forFile({ flowId: 'needs-flow', flow: flow as never, text, label: flowFile });
			resolved.commit();
			const startedAt = '2026-01-01T00:00:01.000Z';
			const state: ExecutionState = {
				executionId,
				flowFile,
				flowId: 'needs-flow',
				status: 'queued',
				currentSteps: [],
				startedAt,
				completedAt: null,
				steps: { only: { status: 'pending' } },
				flowVersion: resolved.version,
				definitionHash: resolved.hash,
				definitionSnapshot: resolved.definitionSnapshot,
				versionChoice: 'file',
				...(requirements === undefined ? {} : { requirements }),
				workspaceWait: {
					since: startedAt,
					message: 'was waiting',
					run: { type: 'run', flowFile, cwd: tmpDir },
				},
			};
			fs.writeFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), JSON.stringify(state));
		}

		it('enforces the recorded requirements even though its definition names none (it never resolves again)', async () => {
			leaveWaitingRecord('aaaa1111', { run: ['fs=confined'], steps: { only: ['fs=confined'] } });
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);
			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());
			handler.tryDispatch();

			expect(assigns()).toEqual([]);
		});

		it('keeps the recorded requirements in the record after it started', async () => {
			const recorded = { run: ['fs=confined'], steps: { only: ['fs=confined'] } };
			leaveWaitingRecord('aaaa1111', recorded);
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);
			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());

			expect(record('aaaa1111').requirements).toEqual(recorded);
		});

		it('reads the declarations of the sources first, so a step that waits knows which source to ask', async () => {
			leaveWaitingRecord('aaaa1111', { run: ['fs=confined'], steps: { only: ['fs=confined'] } });
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);
			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());

			expect(order).toContain('read-declaration');
		});

		it('runs a record without requirements as before: any worker takes the step', async () => {
			leaveWaitingRecord('aaaa1111', undefined);
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);
			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());
			handler.tryDispatch();

			expect(assigns().map(assign => assign.stepId)).toEqual(['only']);
		});
	});
});
