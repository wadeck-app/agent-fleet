/**
 * A worker source can declare the workspace kinds it accepts (`workspaces`). At run start, BEFORE any workspace is
 * allocated, the daemon refuses a run whose requirements only sources that do not accept the flow's kind can serve.
 * A waiting run that starts again is checked the same way, from the kind of its stored definition.
 *
 * REAL CommandHandler, execution store and validator (temp folders); the worker pool is a stub and the workspace
 * provider a spy, so "nothing was allocated" is asserted on the provider itself.
 */
import { DefinitionSnapshotStore, FlowDefinitionResolver, definitionsDirOf, executionsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionState } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
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

/** Index of `workerRouting`, the last constructor parameter (see CommandHandlerTestHarness). */
const ROUTING_INDEX = 19;
/** Index of `workspaceProviders`. */
const PROVIDERS_INDEX = 9;

interface Declared {
	guarantees: string[];
	/** undefined: no restriction */
	workspaces?: string[];
}

describe('RunRequestHandler -- workspace kinds accepted by the sources', () => {
	let tmpDir: string;
	let daemonDir: string;
	let flowFile: string;
	let disposeProject: () => void;
	let handlers: CommandHandler[];
	let pool: ReturnType<typeof createMockWorkerPool>;
	let store: ExecutionStore;
	let declaredBySource: Record<string, Declared>;
	let allocate: ReturnType<typeof vi.fn>;

	function writeFlow(workspace: string, requires: string | null = '["sandbox"]'): string {
		const text = [
			'id: kind-flow',
			'version: "1.0.0"',
			'name: Kind Flow',
			'description: x',
			'inputs: {}',
			...(requires === null ? [] : [`requires: ${requires}`]),
			`workspace: ${workspace}`,
			'steps:',
			'  - id: only',
			'    name: Only',
			'    type: script',
			'    script: echo hi',
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
				declaredGuarantees: async entry => declaredBySource[entry.sourceId]?.guarantees ?? [],
				declaredWorkspaces: async entry => declaredBySource[entry.sourceId]?.workspaces,
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
		args[PROVIDERS_INDEX] = new FixedWorkspaceProviders({
			allocate,
			release: vi.fn(async () => undefined),
		} as never);
		args[ROUTING_INDEX] = routing;
		const handler = new TrackedCommandHandler(...args);
		handlers.push(handler);
		return handler;
	}

	const record = (executionId: string): ExecutionState =>
		JSON.parse(
			fs.readFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), 'utf8')
		) as ExecutionState;

	beforeEach(async () => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'run-kinds-')));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(path.join(daemonDir, 'logs'), { recursive: true });
		flowFile = path.join(tmpDir, 'kind-flow.yml');
		handlers = [];
		declaredBySource = { sbx: { guarantees: ['sandbox'], workspaces: ['pool'] } };
		store = new ExecutionStore(executionsDirOf(daemonDir));
		pool = createMockWorkerPool();
		pool.send.mockReturnValue(true);
		pool.getIdle.mockReturnValue({});
		allocate = vi.fn(async () => ({ path: tmpDir, id: 'ws-1' }));
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

	it('refuses at run start, with the kind, the requirement, the sources and the fix, before any allocation or record', async () => {
		writeFlow('in-place');

		const response = await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response).toMatchObject({ type: 'error', code: 'WORKSPACE_KIND_NOT_ACCEPTED' });
		const message = (response as { message: string }).message;
		expect(message).toMatch(/Flow "kind-flow" requires sandbox/);
		expect(message).toMatch(/sbx \(pool\)/);
		expect(message).toMatch(/workspace: in-place/);
		expect(message).toMatch(/change "workspace:" to one of pool/);
		expect(allocate).not.toHaveBeenCalled();
		expect(fs.readdirSync(executionsDirOf(daemonDir))).toEqual([]);
	});

	it('refuses the object form of workspace by its provider name', async () => {
		writeFlow('{ provider: worktree, baseDir: ../wt }');

		const response = await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response).toMatchObject({ type: 'error', code: 'WORKSPACE_KIND_NOT_ACCEPTED' });
		expect((response as { message: string }).message).toMatch(/workspace: worktree/);
		expect(allocate).not.toHaveBeenCalled();
	});

	it('accepts a run whose kind the source lists', async () => {
		writeFlow('pool');

		const response = await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
		expect(allocate).toHaveBeenCalledTimes(1);
	});

	it('accepts when another source providing the requirement accepts the kind (mixed sources)', async () => {
		declaredBySource['open'] = { guarantees: ['sandbox'], workspaces: ['in-place'] };
		writeFlow('in-place');

		const response = await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(response.type).toBe('execution_started');
	});

	it('accepts when the source declares no restriction', async () => {
		declaredBySource = { sbx: { guarantees: ['sandbox'] } };
		writeFlow('in-place');

		expect((await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never)).type).toBe(
			'execution_started'
		);
	});

	it('checks nothing for a run that requires nothing', async () => {
		writeFlow('in-place', null);

		expect((await newHandler().handleRun({ type: 'run', flowFile, cwd: tmpDir } as never)).type).toBe(
			'execution_started'
		);
	});

	describe('a waiting run that starts again after a restart', () => {
		/** The stored definition is what decides the kind: the file on disk may have changed since. */
		function leaveWaitingRecord(executionId: string, workspace: string): void {
			const text = writeFlow(workspace, null);
			const resolver = new FlowDefinitionResolver(new DefinitionSnapshotStore(definitionsDirOf(daemonDir)));
			const flow = {
				id: 'kind-flow',
				version: '1.0.0',
				name: 'Kind Flow',
				description: 'x',
				inputs: {},
				workspace,
				steps: [{ id: 'only', name: 'Only', type: 'script', script: 'echo hi' }],
			};
			const resolved = resolver.forFile({ flowId: 'kind-flow', flow: flow as never, text, label: flowFile });
			resolved.commit();
			const startedAt = '2026-01-01T00:00:01.000Z';
			const state: ExecutionState = {
				executionId,
				flowFile,
				flowId: 'kind-flow',
				status: 'queued',
				currentSteps: [],
				startedAt,
				completedAt: null,
				steps: { only: { status: 'pending' } },
				flowVersion: resolved.version,
				definitionHash: resolved.hash,
				definitionSnapshot: resolved.definitionSnapshot,
				versionChoice: 'file',
				requirements: { run: ['sandbox'], steps: { only: ['sandbox'] } },
				workspaceWait: {
					since: startedAt,
					message: 'was waiting',
					run: { type: 'run', flowFile, cwd: tmpDir },
				},
			};
			fs.writeFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), JSON.stringify(state));
		}

		it('fails the record, with the reason and how to run it again, and allocates nothing, when the stored kind is not accepted', async () => {
			leaveWaitingRecord('aaaa1111', 'in-place');
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);

			await vi.waitFor(() => expect(record('aaaa1111').status).toBe('failed'));
			expect(record('aaaa1111').lastError).toMatch(
				/requires sandbox.*sbx \(pool\).*workspace: in-place.*flow run/s
			);
			expect(allocate).not.toHaveBeenCalled();
		});

		it('starts when the stored kind is accepted, even if the file on disk now says another kind', async () => {
			leaveWaitingRecord('aaaa1111', 'pool');
			writeFlow('in-place');
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);
			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());

			expect(allocate).toHaveBeenCalledTimes(1);
			expect(record('aaaa1111').status).not.toBe('failed');
		});
	});
});
