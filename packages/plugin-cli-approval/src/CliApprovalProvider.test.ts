import { describe, expect, it, vi } from 'vitest';

import { createCliApprovalProvider } from './CliApprovalProvider.js';

function makeProvider(responses: string[]) {
	let idx = 0;
	const mockReadLine = async (_prompt: string): Promise<string> => {
		const answer = responses[idx++] ?? '';
		return answer;
	};
	return createCliApprovalProvider({ _readLine: mockReadLine });
}

describe('CliApprovalProvider.requestInput', () => {
	it('returns the typed string', async () => {
		const provider = makeProvider(['hello world']);
		const result = await provider.requestInput({ taskId: 't1', stepId: 's1', prompt: 'Enter value:' });
		expect(result).toBe('hello world');
	});

	it('trims the response', async () => {
		const provider = makeProvider(['  trimmed  ']);
		const result = await provider.requestInput({ taskId: 't1', stepId: 's1', prompt: 'Enter:' });
		expect(result).toBe('trimmed');
	});
});

describe('CliApprovalProvider.requestChoice', () => {
	it('returns the id of the selected choice', async () => {
		const provider = makeProvider(['2']);
		const result = await provider.requestChoice({
			taskId: 't1',
			stepId: 's1',
			prompt: 'Pick one:',
			choices: [
				{ id: 'option-a', label: 'Option A' },
				{ id: 'option-b', label: 'Option B' },
				{ id: 'option-c', label: 'Option C' },
			],
		});
		expect(result).toBe('option-b');
	});

	it('returns the first choice id when user enters 1', async () => {
		const provider = makeProvider(['1']);
		const result = await provider.requestChoice({
			taskId: 't1',
			stepId: 's1',
			prompt: 'Pick:',
			choices: [{ id: 'first', label: 'First' }],
		});
		expect(result).toBe('first');
	});

	it('re-prompts on invalid input and returns correct answer on retry', async () => {
		const provider = makeProvider(['99', '0', '1']);
		const result = await provider.requestChoice({
			taskId: 't1',
			stepId: 's1',
			prompt: 'Pick:',
			choices: [{ id: 'only', label: 'Only option' }],
		});
		expect(result).toBe('only');
	});
});

describe('CliApprovalProvider.requestApproval', () => {
	it('returns true for "y"', async () => {
		const provider = makeProvider(['y']);
		const result = await provider.requestApproval({ taskId: 't1', stepId: 's1', prompt: 'OK?' });
		expect(result).toBe(true);
	});

	it('returns true for "Y" (case insensitive)', async () => {
		const provider = makeProvider(['Y']);
		const result = await provider.requestApproval({ taskId: 't1', stepId: 's1', prompt: 'OK?' });
		expect(result).toBe(true);
	});

	it('returns false for "n"', async () => {
		const provider = makeProvider(['n']);
		const result = await provider.requestApproval({ taskId: 't1', stepId: 's1', prompt: 'OK?' });
		expect(result).toBe(false);
	});

	it('returns false for "N"', async () => {
		const provider = makeProvider(['N']);
		const result = await provider.requestApproval({ taskId: 't1', stepId: 's1', prompt: 'OK?' });
		expect(result).toBe(false);
	});

	it('re-prompts on invalid input and accepts y on retry', async () => {
		const provider = makeProvider(['maybe', 'y']);
		const result = await provider.requestApproval({ taskId: 't1', stepId: 's1', prompt: 'OK?' });
		expect(result).toBe(true);
	});
});
