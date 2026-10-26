import type {
	FlowExecutionDetail,
	FlowExecutionLogsResponse,
	FlowExecutionSummary,
} from '@shared/api/flow-daemon.contract';

/**
 * Test and Storybook fixtures for the flow daemon pages (not used by production code).
 */

export function buildExecutionSummary(overrides: Partial<FlowExecutionSummary> = {}): FlowExecutionSummary {
	return {
		executionId: 'exec-0001',
		flowId: 'nightly-build',
		flowFile: '/projects/app/.flows/nightly-build.yaml',
		status: 'completed',
		startedAt: '2026-05-06T10:00:00.000Z',
		completedAt: '2026-05-06T10:05:00.000Z',
		duration: '5m 0s',
		lastErrorRecovered: false,
		stepCount: 3,
		failedStepCount: 0,
		...overrides,
	};
}

export function buildExecutionLogs(overrides: Partial<FlowExecutionLogsResponse> = {}): FlowExecutionLogsResponse {
	return {
		executionId: 'exec-0001',
		flowId: 'nightly-build',
		entries: [],
		total: 0,
		stepIds: [],
		daysRead: ['2026-05-06'],
		unreadableLines: 0,
		logsDir: '/home/user/.config/flow/logs',
		recordedOutput: '',
		limit: 100,
		offset: 0,
		...overrides,
	};
}

type FlowStep = FlowExecutionDetail['steps'][number];

export function buildStep(overrides: Partial<FlowStep> = {}): FlowStep {
	return {
		stepId: 'build',
		status: 'completed',
		injected: false,
		duration: '1m 2s',
		relaunches: [],
		...overrides,
	};
}

/** Step retried once (numbers captured from a real claude run: the second attempt resumed the session). */
export function buildTwoAttemptStep(overrides: Partial<FlowStep> = {}): FlowStep {
	return buildStep({
		stepId: 'implement',
		attempts: 2,
		model: 'sonnet',
		costUsd: 0.00749017,
		lastAttemptCostUsd: 0.00111022,
		costComplete: true,
		costLabel: '$0.0075',
		attemptHistory: [
			{
				n: 1,
				origin: 'initial',
				outcome: 'failed',
				endReason: 'error',
				duration: '12s',
				durationMs: 12000,
				costUsd: 0.00637995,
				turns: 3,
				toolCalls: 4,
			},
			{
				n: 2,
				origin: 'retry',
				outcome: 'completed',
				endReason: 'completed',
				duration: '5s',
				durationMs: 5000,
				costUsd: 0.00111022,
				turns: 1,
				toolCalls: 2,
			},
		],
		...overrides,
	});
}

/** Step whose first two attempts have no recorded cost: the total is only a lower bound. */
export function buildIncompleteCostStep(overrides: Partial<FlowStep> = {}): FlowStep {
	return buildStep({
		stepId: 'refactor',
		attempts: 3,
		model: 'opus',
		costUsd: 2.79,
		lastAttemptCostUsd: 2.79,
		costComplete: false,
		costLabel: '$2.7900+ (2 attempts unknown)',
		attemptHistory: [
			{
				n: 1,
				origin: 'initial',
				outcome: 'failed',
				endReason: 'crash',
				duration: '1m 0s',
				durationMs: 60000,
				costUnknownReason: 'process crashed before reporting its cost',
			},
			{
				n: 2,
				origin: 'retry',
				outcome: 'failed',
				endReason: 'timeout',
				duration: '2m 0s',
				durationMs: 120000,
				costUnknownReason: 'timed out before reporting its cost',
			},
			{
				n: 3,
				origin: 'retry',
				outcome: 'completed',
				endReason: 'completed',
				duration: '3m 0s',
				durationMs: 180000,
				costUsd: 2.79,
				turns: 12,
				toolCalls: 30,
			},
		],
		...overrides,
	});
}

export function buildExecutionDetail(overrides: Partial<FlowExecutionDetail> = {}): FlowExecutionDetail {
	return {
		...buildExecutionSummary(),
		filePath: '/home/user/.config/flow/executions/exec-0001.json',
		currentSteps: [],
		steps: [buildStep()],
		text: 'Flow: nightly-build\nStatus: completed',
		...overrides,
	};
}
