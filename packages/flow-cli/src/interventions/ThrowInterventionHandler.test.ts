import { describe, expect, it } from 'vitest';

import { ThrowInterventionHandler } from './ThrowInterventionHandler.js';

describe('ThrowInterventionHandler', () => {
	it('rejects with an error that mentions the step ID', async () => {
		const handler = new ThrowInterventionHandler();

		const request = {
			taskId: 'task-1',
			stepId: 'my-intervention-step',
			type: 'approval' as const,
			blocking: true,
			config: { title: 'Do you approve?' },
		};

		await expect(handler.requestIntervention(request)).rejects.toThrow('my-intervention-step');
	});

	it('rejects with an Error instance', async () => {
		const handler = new ThrowInterventionHandler();

		const request = {
			taskId: 'task-2',
			stepId: 'step-xyz',
			type: 'question' as const,
			blocking: true,
			config: { question: 'What is your name?', responseType: 'text' as const },
		};

		await expect(handler.requestIntervention(request)).rejects.toBeInstanceOf(Error);
	});

	it('error message mentions using Agent Fleet for interactive flows', async () => {
		const handler = new ThrowInterventionHandler();

		const request = {
			taskId: 'task-3',
			stepId: 'approval-step',
			type: 'choice' as const,
			blocking: true,
			config: {
				question: 'Choose',
				options: [
					{ id: 'yes', label: 'Yes' },
					{ id: 'no', label: 'No' },
				],
			},
		};

		await expect(handler.requestIntervention(request)).rejects.toThrow('Agent Fleet');
	});
});
