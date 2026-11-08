import type { WorkspaceRequest } from 'extension-points';
import { describe, expect, it } from 'vitest';

import { noneWorkspaceProvider } from './NoneWorkspaceProvider.js';

const projectDir = '/projects/demo';

function request(taskId: string): WorkspaceRequest {
	return { taskId, executionId: taskId, projectDir, flow: { id: 'f', version: '1.0.0' } };
}

describe('NoneWorkspaceProvider', () => {
	it('allocate() returns the project folder of the run, not the working directory of the daemon', async () => {
		const handle = await noneWorkspaceProvider.allocate(request('task-1'));
		expect(handle.path).toBe(projectDir);
	});

	it('allocate() returns a handle with id starting with "none:"', async () => {
		const handle = await noneWorkspaceProvider.allocate(request('task-1'));
		expect(handle.id).toBe('none:task-1');
	});

	it('allocate() uses the taskId in the handle id', async () => {
		const handle = await noneWorkspaceProvider.allocate(request('my-task-42'));
		expect(handle.id).toBe('none:my-task-42');
	});

	it('release() is a no-op (does not throw)', async () => {
		const handle = await noneWorkspaceProvider.allocate(request('task-1'));
		await expect(noneWorkspaceProvider.release(handle)).resolves.toBeUndefined();
	});

	it('satisfies the WorkspaceProvider interface', () => {
		expect(typeof noneWorkspaceProvider.allocate).toBe('function');
		expect(typeof noneWorkspaceProvider.release).toBe('function');
	});
});
