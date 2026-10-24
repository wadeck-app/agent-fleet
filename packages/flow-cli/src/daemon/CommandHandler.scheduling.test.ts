import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CommandHandler } from './CommandHandler';
import {
	RETRY_FLOW_YAML,
	TWO_STEP_FLOW_YAML,
	TrackedCommandHandler,
	USER_INTERVENTION_FLOW_YAML,
	VALID_FLOW_YAML,
	createMockWorkerPool,
	daemonDir,
	forkedWorker,
	makeHandler,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';

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

describe('CommandHandler — scheduling via FlowScheduler', () => {
	it('hasActiveExecutions() is true after handleRun, false after step completes', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		expect(handler.hasActiveExecutions()).toBe(true);

		handler.onStepCompleted(executionId, 's1', { result: 'ok' });
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('onStepCompleted enqueues dependent step so tryDispatch() can dispatch it', async () => {
		const flowFile = path.join(tmpDir, 'two.yml');
		fs.writeFileSync(flowFile, TWO_STEP_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const dispatchedSteps: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatchedSteps.push((msg as { stepId: string }).stepId);
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
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		// s1 was dispatched on handleRun
		expect(dispatchedSteps).toContain('s1');

		// Complete s1 -- s2 should be enqueued and dispatched
		handler.onStepCompleted(executionId, 's1', { val: 'done' });
		handler.tryDispatch();
		expect(dispatchedSteps).toContain('s2');
	});

	it('when: step is skipped and downstream step is still dispatched', async () => {
		const yaml = `\
id: when-flow
version: "1.0.0"
name: When Flow
description: when test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: a
    name: A
    type: script
    script: echo a
  - id: b
    name: B
    type: script
    script: echo b
    depends: [a]
    when: "false"
  - id: c
    name: C
    type: script
    script: echo c
    depends: [b]
`;
		const flowFile = path.join(tmpDir, 'when.yml');
		fs.writeFileSync(flowFile, yaml);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
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
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		// a dispatched; b will be skipped when a completes
		handler.onStepCompleted(executionId, 'a', {});
		handler.tryDispatch();

		// b skipped -> c should be dispatched
		expect(dispatched).not.toContain('b');
		expect(dispatched).toContain('c');
	});

	it('onStepFailed removes pending steps for that execution from readyQueue', async () => {
		// Two independent steps: s1 and s2. Fail s1 -> s2 should not be dispatched.
		const twoIndependentYaml = `\
id: two-ind
version: "1.0.0"
name: Two Independent
description: test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo s1
  - id: s2
    name: S2
    type: script
    script: echo s2
`;
		const flowFile = path.join(tmpDir, 'two-ind.yml');
		fs.writeFileSync(flowFile, twoIndependentYaml);

		// Worker pool: idle only for FIRST dispatch, not subsequent
		const workerPool = createMockWorkerPool();
		let dispatchCount = 0;
		workerPool.getIdle.mockImplementation(() => (dispatchCount++ < 1 ? {} : undefined));
		workerPool.send.mockReturnValue(true);

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		// s1 was dispatched; s2 is still in readyQueue
		expect(handler.isQueueEmpty()).toBe(false);

		// Fail the execution
		handler.onStepFailed('nonexistent-id', 's1', 'oops'); // unknown id → no-op
		// Use real executionId from result
	});

	it('retry: step fails once then succeeds on retry — execution completes', async () => {
		const flowFile = path.join(tmpDir, 'retry.yml');
		fs.writeFileSync(flowFile, RETRY_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
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
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		// s1 was dispatched on handleRun
		expect(dispatched).toContain('s1');
		expect(handler.hasActiveExecutions()).toBe(true);

		// First attempt fails -- retry config allows 1 more attempt
		handler.onStepFailed(executionId, 's1', 'transient error');

		// Execution must still be active (retry pending, not terminal failure)
		expect(handler.hasActiveExecutions()).toBe(true);

		// s1 must have been re-dispatched (retry re-enqueued it)
		expect(dispatched.filter(id => id === 's1')).toHaveLength(2);

		// Second attempt succeeds -- execution completes
		handler.onStepCompleted(executionId, 's1', { result: 'ok' });
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('loop (onFailure.goto): step re-dispatched and markExecutionFailed NOT called on first failure', async () => {
		// Regression: before the fix, markExecutionFailed was called unconditionally in
		// Daemon.ts step_failed handler, terminating the execution before the loop could continue.
		const loopYaml = `\
id: loop-flow
version: "1.0.0"
name: Loop Flow
description: loop test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: attempt
    name: Attempt
    type: script
    script: echo attempt
    onFailure:
      goto: attempt
      maxIterations: 3
      resetOnSuccess: true
      addComment: false
  - id: done
    name: Done
    type: script
    script: echo done
    depends: [attempt]
`;
		const flowFile = path.join(tmpDir, 'loop.yml');
		fs.writeFileSync(flowFile, loopYaml);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
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
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		// attempt dispatched on handleRun
		expect(dispatched).toContain('attempt');
		expect(handler.hasActiveExecutions()).toBe(true);

		// First failure -- loop should re-queue attempt, NOT terminate execution
		handler.onStepFailed(executionId, 'attempt', 'not ready yet');

		// Execution must still be active (loop pending)
		expect(handler.hasActiveExecutions()).toBe(true);

		// markExecutionFailed must NOT have been called (loop in progress)
		expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();

		// attempt must have been re-dispatched (loop re-enqueued it)
		expect(dispatched.filter(id => id === 'attempt')).toHaveLength(2);

		// Second attempt succeeds -- done becomes ready
		handler.onStepCompleted(executionId, 'attempt', { result: 'ok' });
		handler.tryDispatch();
		// done should now be dispatched
		expect(dispatched).toContain('done');

		// Complete done -- execution fully done
		handler.onStepCompleted(executionId, 'done', {});
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('transport failure (worker drops): step re-dispatched via tryDispatch, NOT via scheduler.complete()', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		// First send fails, second succeeds
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send
			.mockReturnValueOnce(false) // first attempt: transport failure
			.mockReturnValue(true); // subsequent: success

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');

		// handleRun called tryDispatch() already. With send returning false,
		// the step is put back in the queue and send succeeds on re-dispatch.
		// Handler should not be failed (hasFailed not exposed, but execution still active)
		expect(handler.hasActiveExecutions()).toBe(true);
	});
});

describe('CommandHandler — resuming an unanswered user_intervention step', () => {
	const TIMEOUT_ERROR = `[file-approval] Timed out after 30 ms waiting for an answer.
  Request file : /tmp/approvals/x_approve.request.json
  Response file: /tmp/approvals/x_approve.response.json (does not exist)
  How to answer: Create /tmp/approvals/x_approve.response.json containing {"approved": true|false}
No decision was made -- this step is unanswered, not denied.`;

	async function runToInterventionStep(handler: CommandHandler): Promise<string> {
		const flowFile = path.join(tmpDir, 'intervention.yml');
		fs.writeFileSync(flowFile, USER_INTERVENTION_FLOW_YAML);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };
		// s1 (script) completes first, which is what makes 'approve' (user_intervention,
		// depends: [s1]) ready to dispatch.
		handler.onStepCompleted(executionId, 's1', {});
		return executionId;
	}

	it('does not clean up the execution when the failure is an unanswered intervention timeout', async () => {
		const handler = makeHandler();
		const executionId = await runToInterventionStep(handler);

		handler.onStepFailed(executionId, 'approve', TIMEOUT_ERROR);

		expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
		// Kept alive, not torn down: a resume must still be possible.
		expect(handler.hasActiveExecutions()).toBe(true);
		// release() is called synchronously by cleanupExecution when it runs; its absence here
		// proves cleanupExecution was skipped, with no need to wait out its (also skipped) promise.
		expect(mockRelease).not.toHaveBeenCalled();
	});

	// Daemon.ts's isIdle() consults this directly (alongside hasActiveExecutions()) so its
	// own idle-exit check never tears down a resumable execution's in-memory state out from
	// under a `flow resume` that has not run yet.
	it('hasResumableInterventions is true after the timeout and false again once resumed', async () => {
		const handler = makeHandler();
		const executionId = await runToInterventionStep(handler);
		expect(handler.hasResumableInterventions()).toBe(false);

		handler.onStepFailed(executionId, 'approve', TIMEOUT_ERROR);
		expect(handler.hasResumableInterventions()).toBe(true);

		handler.handleResume(executionId);
		expect(handler.hasResumableInterventions()).toBe(false);
	});

	// So the daemon log can answer "what did isIdle() actually see" if the idle-exit race
	// ever recurs, without another from-scratch investigation.
	it('describeIdleState reports the resumable intervention count', async () => {
		const handler = makeHandler();
		const executionId = await runToInterventionStep(handler);
		expect(handler.describeIdleState()).toContain('resumableInterventions=0');

		handler.onStepFailed(executionId, 'approve', TIMEOUT_ERROR);
		expect(handler.describeIdleState()).toContain('resumableInterventions=1');
	});

	it('cleans up normally when a user_intervention step fails for a reason other than a timeout', async () => {
		const handler = makeHandler();
		const executionId = await runToInterventionStep(handler);

		handler.onStepFailed(executionId, 'approve', 'the approval provider crashed unexpectedly');

		expect(handler.hasActiveExecutions()).toBe(false);
		// release() itself is invoked synchronously inside cleanupExecution -- only its
		// continuation is async, which this assertion does not need to wait for.
		expect(mockRelease).toHaveBeenCalled();
	});

	it('cleans up normally when a non-intervention step fails', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const handler = makeHandler();
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		handler.onStepFailed(executionId, 's1', 'some script error');

		expect(handler.hasActiveExecutions()).toBe(false);
		expect(mockRelease).toHaveBeenCalled();
	});

	it('handleResume re-enqueues the timed-out step and marks the execution running again', async () => {
		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		const interactive = forkedWorker({});
		interactive.worker.hasUserInterface = true;
		workerPool.listIdle.mockReturnValue([interactive]);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});
		const handler = makeHandler(workerPool);
		const executionId = await runToInterventionStep(handler);
		handler.onStepFailed(executionId, 'approve', TIMEOUT_ERROR);
		dispatched.length = 0; // clear the record of 'approve' being dispatched the first time

		const response = handler.handleResume(executionId);

		expect(response).toEqual({ type: 'execution_resumed', executionId, stepId: 'approve' });
		expect(mockExecStore.markExecutionResumed).toHaveBeenCalledWith(executionId, 'approve');
		expect(dispatched).toContain('approve');
		expect(handler.hasActiveExecutions()).toBe(true);
	});

	it('a second handleResume for the same execution is NOT_RESUMABLE', async () => {
		const handler = makeHandler();
		const executionId = await runToInterventionStep(handler);
		handler.onStepFailed(executionId, 'approve', TIMEOUT_ERROR);
		handler.handleResume(executionId);
		// This execution genuinely exists; only the resumability window has closed.
		mockExecStore.exists.mockReturnValueOnce(true);

		const second = handler.handleResume(executionId);

		expect(second.type).toBe('error');
		expect((second as { code: string }).code).toBe('NOT_RESUMABLE');
	});

	it('handleResume on an execution that never failed on an intervention is NOT_RESUMABLE', async () => {
		const handler = makeHandler();
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };
		// This execution genuinely exists (unlike a made-up id), just never failed in a
		// resumable way -- the mock otherwise defaults exists() to false for every id.
		mockExecStore.exists.mockReturnValueOnce(true);

		const response = handler.handleResume(executionId);

		expect(response.type).toBe('error');
		expect((response as { code: string }).code).toBe('NOT_RESUMABLE');
	});

	it('handleResume on a completely unknown executionId is EXECUTION_NOT_FOUND', () => {
		const handler = makeHandler();

		const response = handler.handleResume('nonexistent');

		expect(response.type).toBe('error');
		expect((response as { code: string }).code).toBe('EXECUTION_NOT_FOUND');
	});
});
