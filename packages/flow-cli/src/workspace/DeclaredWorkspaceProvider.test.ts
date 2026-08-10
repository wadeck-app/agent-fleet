import type { WorkspaceConfig } from 'flow-engine/src/types.js';
import { describe, expect, it } from 'vitest';

import { DeclaredWorkspaceProvider, UnsupportedOperationError } from './DeclaredWorkspaceProvider.js';

const cwd = '/workspace/project';

function makeConfig(mode: WorkspaceConfig['mode']): WorkspaceConfig {
	return { mode, gitStrategy: 'any', reusePolicy: 'if-available' };
}

describe('DeclaredWorkspaceProvider', () => {
	it('returns cwd for shared mode', async () => {
		const provider = new DeclaredWorkspaceProvider(makeConfig('shared'), cwd);
		expect(await provider.prepare()).toBe(cwd);
	});

	it('returns cwd for manual mode', async () => {
		const provider = new DeclaredWorkspaceProvider(makeConfig('manual'), cwd);
		expect(await provider.prepare()).toBe(cwd);
	});

	it('throws UnsupportedOperationError for isolated mode', async () => {
		const provider = new DeclaredWorkspaceProvider(makeConfig('isolated'), cwd);
		await expect(provider.prepare()).rejects.toThrow(UnsupportedOperationError);
	});
});
