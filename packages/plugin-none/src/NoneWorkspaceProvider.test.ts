import { describe, expect, it } from 'vitest';

import { noneWorkspaceProvider } from './NoneWorkspaceProvider.js';

describe('NoneWorkspaceProvider', () => {
	it('allocate() returns a handle with path = process.cwd()', async () => {
		const handle = await noneWorkspaceProvider.allocate({ taskId: 'task-1' });
		expect(handle.path).toBe(process.cwd());
	});

	it('allocate() returns a handle with id starting with "none:"', async () => {
		const handle = await noneWorkspaceProvider.allocate({ taskId: 'task-1' });
		expect(handle.id).toBe('none:task-1');
	});

	it('allocate() uses the taskId in the handle id', async () => {
		const handle = await noneWorkspaceProvider.allocate({ taskId: 'my-task-42' });
		expect(handle.id).toBe('none:my-task-42');
	});

	it('release() is a no-op (does not throw)', async () => {
		const handle = await noneWorkspaceProvider.allocate({ taskId: 'task-1' });
		await expect(noneWorkspaceProvider.release(handle)).resolves.toBeUndefined();
	});

	it('satisfies the WorkspaceProvider interface', () => {
		expect(typeof noneWorkspaceProvider.allocate).toBe('function');
		expect(typeof noneWorkspaceProvider.release).toBe('function');
	});
});
