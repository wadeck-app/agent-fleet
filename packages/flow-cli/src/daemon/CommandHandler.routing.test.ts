import * as fs from 'node:fs';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';
import {
	TrackedCommandHandler,
	createMockWorkerPool,
	daemonDir,
	forkedWorker,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';
import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy';

const { mockAllocate, mockRelease, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' }),
	mockRelease: vi.fn().mockResolvedValue(undefined),
	hoistedState: { actualHomedir: '' as string },
}));

vi.mock('node:os', async importOriginal => {
	const actual = (await importOriginal()) as typeof import('node:os');
	hoistedState.actualHomedir = actual.homedir();
	return {
		...actual,
		homedir: vi.fn().mockImplementation(() => actual.homedir()),
	};
});

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = mockAllocate;
			release = mockRelease;
		},
	};
});

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

describe('CommandHandler — routing steps to workers (D#22, D#24)', () => {
	const LABELLED_FLOW_YAML = `\
id: labelled-flow
version: "1.0.0"
name: Labelled Flow
description: label routing
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: needs-gpu
    name: Needs GPU
    type: script
    script: echo gpu
    labels: [gpu]
  - id: plain
    name: Plain
    type: script
    script: echo plain
`;

	function handlerFor(yamlText: string, idle: unknown[]) {
		const flowFile = path.join(tmpDir, 'routing.yml');
		fs.writeFileSync(flowFile, yamlText);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.listIdle.mockReturnValue(idle);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		return { handler, dispatched, flowFile, workerPool };
	}

	it('does not dispatch a labelled step to a worker without the label', async () => {
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(LABELLED_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('needs-gpu');
	});

	it('dispatches a labelled step to a worker carrying the label', async () => {
		const worker = forkedWorker({});
		worker.worker.labels = ['gpu'];
		const { handler, dispatched, flowFile } = handlerFor(LABELLED_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('needs-gpu');
	});

	// The two steps have no dependency between them, so a step nothing can run must not
	// hold up one that can -- otherwise one unsatisfiable label stalls the whole flow.
	it('still dispatches a placeable step queued behind an unplaceable one', async () => {
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(LABELLED_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('plain');
	});

	// A malformed `labels:` can never be matched, so it must not present as "still waiting
	// for capacity". Schema validation catches it before the run starts (D#7), which is the
	// earliest and clearest place -- the run is refused rather than hanging.
	it('refuses to start a flow whose labels are not a list', async () => {
		const malformed = LABELLED_FLOW_YAML.replace('labels: [gpu]', 'labels: gpu');
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(malformed, [worker]);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect((result as { type: string }).type).toBe('error');
		expect(JSON.stringify(result)).toMatch(/labels/i);
		expect(dispatched).toEqual([]);
	});
});

describe('CommandHandler — flow-level labels: inheritance (Proposal 4)', () => {
	const FLOW_LEVEL_LABELS_YAML = `\
id: flow-level-labels
version: "1.0.0"
name: Flow Level Labels
description: flow-level label inheritance
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
labels: [npm]
inputs: {}
steps:
  - id: no-own-labels
    name: No Own Labels
    type: script
    script: echo plain
  - id: with-gpu
    name: With GPU
    type: script
    script: echo gpu
    labels: [gpu]
  - id: with-npm-dup
    name: With NPM Duplicate
    type: script
    script: echo dup
    labels: [npm]
`;

	function handlerFor(yamlText: string, idle: unknown[]) {
		const flowFile = path.join(tmpDir, 'flow-level-labels.yml');
		fs.writeFileSync(flowFile, yamlText);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.listIdle.mockReturnValue(idle);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		return { handler, dispatched, flowFile, workerPool };
	}

	// Union merge, not override (plan-level decision): a step with no own `labels:` must
	// still inherit the flow-wide pin, or a forgotten per-step `labels:` would silently
	// fall back to "any worker" -- the exact failure mode Proposal 4 exists to close.
	it('dispatches a step with no own labels only to a worker carrying the flow-level label', async () => {
		const worker = forkedWorker({});
		worker.worker.labels = ['npm'];
		const { handler, dispatched, flowFile } = handlerFor(FLOW_LEVEL_LABELS_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('no-own-labels');
	});

	it('does not dispatch a step with no own labels to a worker missing the flow-level label', async () => {
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(FLOW_LEVEL_LABELS_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('no-own-labels');
	});

	// The critical case the plan explicitly calls out: override would let `gpu` silently
	// lose the flow-wide `npm` pin, reproducing the bug this proposal fixes.
	it('requires both the flow-level and the step-level label (union, not override)', async () => {
		const worker = forkedWorker({});
		worker.worker.labels = ['gpu']; // has the step label but not the flow-level one
		const { handler, dispatched, flowFile } = handlerFor(FLOW_LEVEL_LABELS_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('with-gpu');
	});

	it('dispatches the union-labelled step to a worker carrying both labels', async () => {
		const worker = forkedWorker({});
		worker.worker.labels = ['npm', 'gpu'];
		const { handler, dispatched, flowFile } = handlerFor(FLOW_LEVEL_LABELS_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('with-gpu');
	});

	// Dedup: a step re-listing an already flow-level label must produce a single entry,
	// not a duplicate -- observed directly on the StepPlacement handed to the router.
	it('dedupes a step label already present at the flow level', async () => {
		const { StepRouter } = await import('./StepRouter');
		const selectSpy = vi.spyOn(StepRouter.prototype, 'select');
		const worker = forkedWorker({});
		worker.worker.labels = ['npm'];
		const { handler, flowFile } = handlerFor(FLOW_LEVEL_LABELS_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		const dupCall = selectSpy.mock.calls.find(call => (call[0] as { stepId: string }).stepId === 'with-npm-dup');
		expect(dupCall).toBeDefined();
		expect((dupCall![0] as { labels: string[] }).labels).toEqual(['npm']);

		selectSpy.mockRestore();
	});
});

describe('CommandHandler — routing script steps by shell: field (Proposal 2)', () => {
	const SHELL_FLOW_YAML = `\
id: shell-flow
version: "1.0.0"
name: Shell Flow
description: shell routing
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: needs-bash
    name: Needs Bash
    type: script
    script: echo bash
    shell: bash
  - id: plain
    name: Plain
    type: script
    script: echo plain
`;

	function handlerFor(yamlText: string, idle: unknown[]) {
		const flowFile = path.join(tmpDir, 'shell-routing.yml');
		fs.writeFileSync(flowFile, yamlText);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.listIdle.mockReturnValue(idle);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		return { handler, dispatched, flowFile, workerPool };
	}

	// No-silent-fallback: a step requiring a shell the worker never declared must not be
	// dispatched to it.
	it('does not dispatch a shell-scoped step to a worker without that shell', async () => {
		const worker = forkedWorker({});
		worker.worker.shellCapabilities = ['cmd'];
		const { handler, dispatched, flowFile } = handlerFor(SHELL_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('needs-bash');
	});

	it('dispatches a shell-scoped step to a worker declaring that shell', async () => {
		const worker = forkedWorker({});
		worker.worker.shellCapabilities = ['bash'];
		const { handler, dispatched, flowFile } = handlerFor(SHELL_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('needs-bash');
	});

	it('dispatches a step with no shell: field regardless of worker shell capabilities', async () => {
		const worker = forkedWorker({});
		worker.worker.shellCapabilities = [];
		const { handler, dispatched, flowFile } = handlerFor(SHELL_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('plain');
	});
});

describe('CommandHandler — interactive steps (D#37, D#39, D#61)', () => {
	const INTERVENTION_FLOW_YAML = `\
id: intervention-flow
version: "1.0.0"
name: Intervention Flow
description: needs a human
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: confirm
    name: Confirm
    type: user_intervention
    interventionType: approval
    approval:
      title: Ship it?
`;

	/**
	 * @param waitMs S9 bound. Zero makes the "nothing can answer" decision immediate, so the
	 *   failure path is asserted without waiting out a real timeout -- the default bound exists to
	 *   give a reconnecting worker time, which no test should spend.
	 */
	function handlerWith(idle: unknown[], waitMs?: number) {
		const flowFile = path.join(tmpDir, 'intervention.yml');
		fs.writeFileSync(flowFile, INTERVENTION_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.listIdle.mockReturnValue(idle);
		workerPool.summarize.mockReturnValue(
			idle.map(candidate => (candidate as { worker: { hasUserInterface: boolean } }).worker)
		);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			waitMs === undefined ? undefined : new DefaultInteractivityPolicy(waitMs)
		);
		return { handler, dispatched, flowFile };
	}

	// The v1 block is lifted (D#37): the capability exists now, so refusing the flow would
	// ship a declaration nothing consumes.
	it('accepts a flow containing a user_intervention step', async () => {
		const interactive = forkedWorker({});
		interactive.worker.hasUserInterface = true;
		const { handler, flowFile } = handlerWith([interactive]);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect((result as { type: string }).type).toBe('execution_started');
	});

	it('dispatches it to a worker that declared a user interface', async () => {
		const interactive = forkedWorker({});
		interactive.worker.hasUserInterface = true;
		const { handler, dispatched, flowFile } = handlerWith([interactive]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('confirm');
	});

	// A forked worker cannot serve this step, so once the S9 bound is spent there is nothing left
	// to wait for and leaving it queued would stall the flow with nothing to act on (D#39).
	it('fails the step when only headless workers are connected and the wait is spent', async () => {
		const headless = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerWith([headless], 0);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('confirm');
		expect(mockExecStore.markStepFailed).toHaveBeenCalled();
	});

	// The bound is what makes an interactive step winnable at all: an idle daemon disconnects
	// external workers, so one is always briefly absent right after a run starts a fresh daemon.
	it('keeps the step queued while an interactive worker still has time to appear', async () => {
		const headless = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerWith([headless]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('confirm');
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('says how to make the step runnable rather than just refusing it', async () => {
		const { handler, flowFile } = handlerWith([], 0);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
		expect(reason).toContain('flow worker');
		expect(reason).toContain('confirm');
	});

	// A separate v1 scope line, not the same limitation -- lifting one must not lift both.
	it('still refuses a subflow step', async () => {
		const flowFile = path.join(tmpDir, 'subflow.yml');
		fs.writeFileSync(
			flowFile,
			INTERVENTION_FLOW_YAML.replace(
				/ {2}- id: confirm[\s\S]*$/,
				'  - id: nested\n    name: Nested\n    type: subflow\n    flowId: other-flow\n    inputs: {}\n'
			)
		);
		const { handler } = handlerWith([]);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(JSON.stringify(result)).toMatch(/subflow/);
	});
});
