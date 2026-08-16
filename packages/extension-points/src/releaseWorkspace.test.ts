import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { releaseWorkspace } from './releaseWorkspace.js';
import type { WorkspaceHandle, WorkspaceProvider } from './workspace/v1.js';

const HANDLE: WorkspaceHandle = { path: '/tmp/test-workspace', id: 'test:handle-1' };

function makeProvider(releaseImpl: () => Promise<void>): WorkspaceProvider {
	return {
		allocate: async () => HANDLE,
		release: releaseImpl,
	};
}

describe('releaseWorkspace - no prior error', () => {
	it('resolves when release succeeds', async () => {
		const provider = makeProvider(async () => {});
		await expect(releaseWorkspace(provider, HANDLE)).resolves.toBeUndefined();
	});

	it('propagates release error when no prior error', async () => {
		const releaseError = new Error('git remove failed');
		const provider = makeProvider(async () => {
			throw releaseError;
		});
		await expect(releaseWorkspace(provider, HANDLE)).rejects.toBe(releaseError);
	});
});

describe('releaseWorkspace - with prior error', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('re-throws original error when both flow and release fail', async () => {
		const originalError = new Error('flow execution failed');
		const releaseError = new Error('git remove failed');
		const provider = makeProvider(async () => {
			throw releaseError;
		});

		await expect(releaseWorkspace(provider, HANDLE, originalError)).rejects.toBe(originalError);
	});

	it('logs release error as warning when prior error exists', async () => {
		const originalError = new Error('flow execution failed');
		const releaseError = new Error('git remove failed');
		const provider = makeProvider(async () => {
			throw releaseError;
		});

		await expect(releaseWorkspace(provider, HANDLE, originalError)).rejects.toBe(originalError);

		expect(warnSpy).toHaveBeenCalledOnce();
		const warnArg = warnSpy.mock.calls[0]?.[0] as string;
		expect(warnArg).toContain('git remove failed');
		expect(warnArg).toContain(HANDLE.id);
	});

	it('does NOT re-throw original error when release succeeds (prior error present)', async () => {
		const originalError = new Error('flow execution failed');
		const provider = makeProvider(async () => {});
		// release succeeds - prior error is not re-thrown by releaseWorkspace (caller handles it)
		await expect(releaseWorkspace(provider, HANDLE, originalError)).resolves.toBeUndefined();
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
