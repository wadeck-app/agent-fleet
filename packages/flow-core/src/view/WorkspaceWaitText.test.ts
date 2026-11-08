import { describe, expect, it } from 'vitest';

import { isWaitingForWorkspace, statusLabelOf, workspaceWaitLines } from './WorkspaceWaitText.js';

const wait = {
	since: '2026-10-25T10:00:00.000Z',
	message: 'Waiting for a free workspace: 2/2 slots are claimed.',
	run: {},
};

describe('WorkspaceWaitText', () => {
	it('recognises a queued run that carries workspaceWait', () => {
		expect(isWaitingForWorkspace({ status: 'queued', workspaceWait: wait })).toBe(true);
		expect(isWaitingForWorkspace({ status: 'queued' })).toBe(false);
		expect(isWaitingForWorkspace({ status: 'running', workspaceWait: wait })).toBe(false);
	});

	it('words the status in full for a waiting run and keeps the stored status otherwise', () => {
		expect(statusLabelOf({ status: 'queued', workspaceWait: wait })).toBe('waiting for workspace');
		expect(statusLabelOf({ status: 'queued' })).toBe('queued');
	});

	it('prints the wait start and its reason, nothing for a run that does not wait', () => {
		expect(workspaceWaitLines({ status: 'queued', workspaceWait: wait })).toEqual([
			'Waiting:   since 2026-10-25 10:00:00 UTC',
			`Reason:    ${wait.message}`,
		]);
		expect(workspaceWaitLines({ status: 'queued' })).toEqual([]);
	});
});
