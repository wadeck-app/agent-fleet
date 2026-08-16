import type { ApprovalProvider } from 'extension-points';
import { describe, expect, it, vi } from 'vitest';

import type { UserInterventionStep } from '../types';
import { StepRunner } from './StepRunner';

const testWorkspace = {
	id: 'ws-1',
	path: '/tmp/ws',
	metaDir: '/tmp/ws.meta',
	mode: 'isolated' as const,
	concurrency: { key: 'test', activeTasks: new Set<string>(), locked: false },
	createdAt: new Date().toISOString(),
	lastUsedAt: new Date().toISOString(),
	usageCount: 0,
};

const baseContext = {
	inputs: {},
	stepOutputs: new Map(),
	taskMetadata: {},
	taskId: 'task-1',
	stepMeta: new Map(),
};

function makeApprovalProvider(overrides: Partial<ApprovalProvider> = {}): ApprovalProvider {
	return {
		requestInput: vi.fn().mockResolvedValue('user input'),
		requestChoice: vi.fn().mockResolvedValue('choice-a'),
		requestApproval: vi.fn().mockResolvedValue(true),
		...overrides,
	};
}

describe('StepRunner - ApprovalProvider injection', () => {
	it('routes approval step to approvalProvider.requestApproval()', async () => {
		const approvalProvider = makeApprovalProvider();
		const runner = new StepRunner({ interactive: false, approvalProvider });

		const step: UserInterventionStep = {
			id: 'step-approval',
			name: 'Approve',
			type: 'user_intervention',
			interventionType: 'approval',
			approval: { title: 'Approve this?', description: 'Some context' },
		};

		const trace = await runner.executeStep(step, testWorkspace, baseContext);
		expect(approvalProvider.requestApproval).toHaveBeenCalledOnce();
		expect(approvalProvider.requestApproval).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: 'Approve this?', taskId: 'task-1', stepId: 'step-approval' })
		);
		expect(trace.error).toBeUndefined();
	});

	it('routes question step to approvalProvider.requestInput()', async () => {
		const approvalProvider = makeApprovalProvider();
		const runner = new StepRunner({ interactive: false, approvalProvider });

		const step: UserInterventionStep = {
			id: 'step-question',
			name: 'Ask',
			type: 'user_intervention',
			interventionType: 'question',
			question: { question: 'What is your name?', responseType: 'text' },
		};

		const trace = await runner.executeStep(step, testWorkspace, baseContext);
		expect(approvalProvider.requestInput).toHaveBeenCalledOnce();
		expect(approvalProvider.requestInput).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: 'What is your name?', taskId: 'task-1', stepId: 'step-question' })
		);
		expect(trace.error).toBeUndefined();
	});

	it('routes choice step to approvalProvider.requestChoice()', async () => {
		const approvalProvider = makeApprovalProvider();
		const runner = new StepRunner({ interactive: false, approvalProvider });

		const step: UserInterventionStep = {
			id: 'step-choice',
			name: 'Pick',
			type: 'user_intervention',
			interventionType: 'choice',
			choice: {
				question: 'Pick one',
				options: [
					{ id: 'choice-a', label: 'Option A' },
					{ id: 'choice-b', label: 'Option B' },
				],
			},
		};

		const trace = await runner.executeStep(step, testWorkspace, baseContext);
		expect(approvalProvider.requestChoice).toHaveBeenCalledOnce();
		expect(approvalProvider.requestChoice).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'Pick one',
				taskId: 'task-1',
				stepId: 'step-choice',
				choices: [
					{ id: 'choice-a', label: 'Option A' },
					{ id: 'choice-b', label: 'Option B' },
				],
			})
		);
		expect(trace.error).toBeUndefined();
	});

	it('records error in trace when no approval provider is set', async () => {
		const runner = new StepRunner({ interactive: false });

		const step: UserInterventionStep = {
			id: 'step-approval',
			name: 'Approve',
			type: 'user_intervention',
			interventionType: 'approval',
			approval: { title: 'Approve?' },
		};

		const trace = await runner.executeStep(step, testWorkspace, baseContext);
		expect(trace.error).toMatch(/ApprovalProvider|approval.*provider|no.*handler/i);
	});

	it('falls back to InterventionHandler when only interventionHandler is set (backward compat)', async () => {
		const mockInterventionHandler = {
			requestIntervention: vi.fn().mockResolvedValue({
				value: true,
				answeredBy: 'user',
				answeredAt: new Date().toISOString(),
			}),
		};
		const runner = new StepRunner({
			interactive: false,
			interventionHandler: mockInterventionHandler,
		});

		const step: UserInterventionStep = {
			id: 'step-approval',
			name: 'Approve',
			type: 'user_intervention',
			interventionType: 'approval',
			approval: { title: 'Approve?' },
		};

		const trace = await runner.executeStep(step, testWorkspace, baseContext);
		expect(mockInterventionHandler.requestIntervention).toHaveBeenCalledOnce();
		expect(trace.error).toBeUndefined();
	});
});
