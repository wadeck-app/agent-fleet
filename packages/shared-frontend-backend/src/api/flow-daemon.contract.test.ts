import { describe, expect, it } from 'vitest';

import { FlowExecutionDetailSchema, FlowStepSchema } from './flow-daemon.contract';

const OLD_STEP = {
	stepId: 'build',
	status: 'completed',
	injected: false,
	duration: '1.0s',
	costUsd: 0.5,
	relaunches: [],
};

const SUMMARY = {
	executionId: 'abc123',
	flowId: 'deploy',
	flowFile: '/flows/deploy.yml',
	status: 'completed',
	startedAt: '2026-08-16T12:00:00.000Z',
	completedAt: null,
	duration: '1.0s',
	lastErrorRecovered: false,
	stepCount: 1,
	failedStepCount: 0,
	filePath: '/x.json',
	currentSteps: [],
	text: '',
};

describe('flow-daemon contract: step cost', () => {
	it('accepts a step of an older daemon (no cost completeness, no attempts)', () => {
		expect(FlowStepSchema.parse(OLD_STEP)).toEqual(OLD_STEP);
	});

	it('keeps the total cost, the last attempt, the completeness, the label and the attempts of a step', () => {
		const step = {
			...OLD_STEP,
			costUsd: 0.00749017,
			lastAttemptCostUsd: 0.00111022,
			costComplete: true,
			costLabel: '$0.0075',
			attemptHistory: [
				{
					n: 1,
					origin: 'first',
					outcome: 'completed',
					endReason: 'completed',
					duration: '30.0s',
					durationMs: 30000,
					costUsd: 0.00637995,
					tokens: { input: 2, output: 4, cacheRead: 0, cacheWrite: 51022 },
					turns: 2,
					toolCalls: 3,
					filesWrittenCount: 1,
				},
				{
					n: 2,
					origin: 'relaunch',
					outcome: 'failed',
					endReason: 'timeout',
					duration: '10.0s',
					durationMs: 10000,
					costUnknownReason: 'the provider reported no cost for this attempt',
					error: 'timed out',
				},
			],
		};
		// zod strips unknown keys: a field missing from the schema would silently disappear from the API
		expect(FlowStepSchema.parse(step)).toEqual(step);
	});

	it('keeps the total label and completeness of the execution, and still accepts an older detail without them', () => {
		const detail = { ...SUMMARY, steps: [OLD_STEP], totalCostUsd: 0.5 };
		expect(FlowExecutionDetailSchema.parse(detail)).toEqual(detail);
		const newer = { ...detail, totalCostComplete: false, totalCostLabel: '$0.5000+ (1 attempt unknown)' };
		expect(FlowExecutionDetailSchema.parse(newer)).toEqual(newer);
	});

	it('rejects an attempt with an unknown shape for its numbers', () => {
		expect(() => FlowStepSchema.parse({ ...OLD_STEP, attemptHistory: [{ n: 'one' }] })).toThrow();
	});
});
