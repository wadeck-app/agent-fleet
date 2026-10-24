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
