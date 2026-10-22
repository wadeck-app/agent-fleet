import type { FlowDefinition } from 'flow-engine/types';

import type { ExecutionState } from '../execution/ExecutionState.js';

// Realistic fixtures shared by the tests of the run path and the step inputs/outputs. The shapes mirror what
// flow-cli's ExecutionStore writes (markStepRunning / markStepCompleted / markStepFailed): no step output,
// stdout/stderr only on failed steps, a step the scheduler skipped is 'completed' without a startedAt.

/** plan -> implement -> test (loops back to implement) -> ship (only when tests passed) / notify (only when they failed) -> deploy. */
export const BUILD_FLOW = {
	id: 'build_task',
	version: '1.0.0',
	name: 'Build a task',
	steps: [
		{
			id: 'plan',
			name: 'Plan',
			type: 'model',
			provider: 'claude',
			model: 'opus',
			prompt: 'Plan ${{ inputs.task }}',
		},
		{
			id: 'implement',
			name: 'Implement',
			type: 'model',
			depends: ['plan'],
			prompt: 'Implement ${{ steps.plan.outputs.plan }}',
			retry: { maxAttempts: 3, backoff: 'fixed' },
		},
		{
			id: 'test',
			name: 'Run tests',
			type: 'script',
			depends: ['implement'],
			script: 'npm test -- ${{ steps.implement.outputs.files }}',
			env: { GITHUB_TOKEN: '${{ secrets.GH }}', REGION: 'eu' },
			captureOutput: 'stdout',
			output: { passed: { type: 'boolean', pattern: 'PASS' } },
			onFailure: { goto: 'implement', maxIterations: 3 },
		},
		{
			id: 'ship',
			name: 'Ship',
			type: 'script',
			depends: ['test'],
			when: '${{ steps.test.outputs.passed }} == true',
			script: 'echo shipping',
		},
		{
			id: 'notify',
			name: 'Notify',
			type: 'script',
			depends: ['test'],
			when: '${{ steps.test.outputs.passed }} == false',
			script: 'echo failed',
		},
		{
			id: 'deploy',
			name: 'Deploy',
			type: 'subflow',
			flowId: 'deploy_flow',
			depends: ['ship'],
			inputs: { version: '${{ steps.ship.outputs.version }}', api_key: 'abc123' },
		},
	],
} as unknown as FlowDefinition;

const BASE: Omit<ExecutionState, 'steps' | 'status' | 'completedAt'> = {
	executionId: 'a1b2c3d4',
	flowFile: '/work/flows/build.yml',
	flowId: 'build_task',
	currentSteps: [],
	startedAt: '2026-08-16T12:00:00.000Z',
};

/** The tests failed once, implement was run again (loop), then everything passed; `notify` was skipped by its `when`. */
export const COMPLETED_WITH_LOOP: ExecutionState = {
	...BASE,
	status: 'completed',
	completedAt: '2026-08-16T12:09:00.000Z',
	steps: {
		plan: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:00:01.000Z',
			completedAt: '2026-08-16T12:01:00.000Z',
			sourceId: 'local',
			workerId: 'w-1',
			meta: {
				duration_ms: 59000,
				model: 'opus',
				session_id: 'sess-123',
				session_file: '/home/u/.claude/projects/x/sess-123.jsonl',
				ttft_ms: 900,
				cost: {
					input_tokens: 1200,
					output_tokens: 800,
					cache_read_tokens: 10,
					cache_write_tokens: 20,
					usd: 0.42,
				},
			},
		},
		implement: {
			status: 'completed',
			attempts: 2,
			startedAt: '2026-08-16T12:05:00.000Z',
			completedAt: '2026-08-16T12:06:00.000Z',
		},
		test: {
			status: 'completed',
			attempts: 2,
			startedAt: '2026-08-16T12:06:10.000Z',
			completedAt: '2026-08-16T12:07:00.000Z',
			meta: { duration_ms: 50000, exit_code: 0 },
		},
		ship: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:07:05.000Z',
			completedAt: '2026-08-16T12:07:10.000Z',
		},
		// Skipped by the scheduler: pending steps are marked completed, without ever starting, when the run ends.
		notify: { status: 'completed', completedAt: '2026-08-16T12:09:00.000Z' },
		deploy: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:07:15.000Z',
			completedAt: '2026-08-16T12:09:00.000Z',
		},
	},
};

/** The tests failed for good: the steps after them never ran and are still `pending` in the record. */
export const FAILED_AT_TEST: ExecutionState = {
	...BASE,
	status: 'failed',
	completedAt: '2026-08-16T12:04:00.000Z',
	lastError: 'exit 1: 3 tests failed',
	steps: {
		plan: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:00:01.000Z',
			completedAt: '2026-08-16T12:01:00.000Z',
		},
		implement: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:01:05.000Z',
			completedAt: '2026-08-16T12:03:00.000Z',
		},
		test: {
			status: 'failed',
			attempts: 3,
			startedAt: '2026-08-16T12:03:10.000Z',
			completedAt: '2026-08-16T12:04:00.000Z',
			error: 'exit 1: 3 tests failed',
			stdout: 'running tests\nGITHUB_TOKEN=ghp_abcdefghijklmnop1234\nFAIL a.test.ts',
			stderr: 'Error: 3 tests failed',
			meta: { duration_ms: 50000, exit_code: 1 },
		},
		ship: { status: 'pending' },
		notify: { status: 'pending' },
		deploy: { status: 'pending' },
	},
};

/** Still running: implement is running, the rest has not started. */
export const RUNNING_AT_IMPLEMENT: ExecutionState = {
	...BASE,
	status: 'running',
	completedAt: null,
	currentSteps: ['implement'],
	steps: {
		plan: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:00:01.000Z',
			completedAt: '2026-08-16T12:01:00.000Z',
		},
		implement: { status: 'running', attempts: 1, startedAt: '2026-08-16T12:01:05.000Z' },
		test: { status: 'pending' },
		ship: { status: 'pending' },
		notify: { status: 'pending' },
		deploy: { status: 'pending' },
	},
};
