import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConfigureScriptsState } from './useConfigureScriptsState';
import { workspaceScriptsApi } from './workspaceScripts.api';

// Mock the API
vi.mock('./workspaceScripts.api', () => ({
	workspaceScriptsApi: {
		discoverAvailableScripts: vi.fn(),
		createWorkspaceScript: vi.fn(),
		deleteWorkspaceScript: vi.fn(),
		updateWorkspaceScript: vi.fn(),
	},
}));

describe('useConfigureScriptsState - WebSocket Updates', () => {
	const mockWorkspaceId = 'workspace-123';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('CRITICAL: should clean up optimisticAdditions when WebSocket confirms script creation', async () => {
		// Mock successful API call
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockResolvedValue({
			id: 'script-new',
			workspaceId: mockWorkspaceId,
			scriptName: 'build',
			enabled: true,
			displayName: 'build',
			description: '',
			url: '',
			order: 0,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
			version: 1,
		});

		// Start with no scripts
		const { result, rerender } = renderHook(
			({ scripts }) =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts,
					isOpen: true,
				}),
			{
				initialProps: {
					scripts: [] as ScriptProcessWithConfig[],
				},
			}
		);

		// Step 1: User adds a script
		result.current.actions.handleAddScript('build');

		// Wait for optimistic state to be set
		await waitFor(() => {
			expect(result.current.configuredScripts.length).toBe(1);
			expect(result.current.configuredScripts[0].scriptName).toBe('build');
		});

		// API call completes
		await waitFor(() => {
			expect(vi.mocked(workspaceScriptsApi.createWorkspaceScript)).toHaveBeenCalled();
		});

		// Step 2: WebSocket event arrives - props update with new script
		const newScripts: ScriptProcessWithConfig[] = [
			{
				script: {
					id: 'script-new',
					workspaceId: mockWorkspaceId,
					scriptName: 'build',
					enabled: true,
					displayName: 'build',
					description: '',
					url: '',
					order: 0,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
					version: 1,
				},
				process: undefined,
			},
		];

		rerender({ scripts: newScripts });

		// CRITICAL: optimisticAdditions should be cleaned up
		// Because the script now exists in props
		await waitFor(() => {
			// The script should still appear (from props now, not optimistic)
			expect(result.current.configuredScripts.length).toBe(1);
			expect(result.current.configuredScripts[0].scriptName).toBe('build');
			// And it should NOT be a temp script anymore
			expect(result.current.configuredScripts[0].id).toBe('script-new'); // Real ID, not temp
		});

		// Step 3: User tries to add it again - should be blocked
		result.current.actions.handleAddScript('build');

		await waitFor(() => {
			expect(result.current.error).toContain('already configured');
		});

		// Create API should NOT be called again
		expect(vi.mocked(workspaceScriptsApi.createWorkspaceScript)).toHaveBeenCalledTimes(1);
	});

	it('CRITICAL: should clean up optimisticRemovals when WebSocket confirms script deletion', async () => {
		// Mock successful API call
		vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockResolvedValue({ success: true });

		const initialScripts: ScriptProcessWithConfig[] = [
			{
				script: {
					id: 'script-1',
					workspaceId: mockWorkspaceId,
					scriptName: 'build',
					enabled: true,
					displayName: 'build',
					description: '',
					url: '',
					order: 0,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
					version: 1,
				},
				process: undefined,
			},
		];

		// Start with one script
		const { result, rerender } = renderHook(
			({ scripts }) =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts,
					isOpen: true,
				}),
			{
				initialProps: {
					scripts: initialScripts,
				},
			}
		);

		// Step 1: User removes the script
		result.current.actions.handleRemoveScript('script-1');

		// Wait for optimistic removal
		await waitFor(() => {
			expect(result.current.configuredScripts.length).toBe(0);
		});

		// API call completes
		await waitFor(() => {
			expect(vi.mocked(workspaceScriptsApi.deleteWorkspaceScript)).toHaveBeenCalled();
		});

		// Step 2: WebSocket event arrives - props update (script removed)
		rerender({ scripts: [] });

		// CRITICAL: optimisticRemovals should be cleaned up
		await waitFor(() => {
			expect(result.current.configuredScripts.length).toBe(0);
		});

		// Step 3: User tries to remove it again - should do nothing (script doesn't exist)
		// This shouldn't cause an error because the script is no longer in props
		const initialError = result.current.error;
		result.current.actions.handleRemoveScript('script-1');

		// Should not change error state (no script to remove)
		expect(result.current.error).toBe(initialError);
	});

	it('REAL BUG: Multiple rapid add/remove cycles with WebSocket updates should not cause "already exists"', async () => {
		// Mock APIs
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockResolvedValue({
			id: 'script-new',
			workspaceId: mockWorkspaceId,
			scriptName: 'build',
			enabled: true,
			displayName: 'build',
			description: '',
			url: '',
			order: 0,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
			version: 1,
		});
		vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockResolvedValue({ success: true });

		const { result, rerender } = renderHook(
			({ scripts }) =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts,
					isOpen: true,
				}),
			{
				initialProps: {
					scripts: [] as ScriptProcessWithConfig[],
				},
			}
		);

		// Cycle 1: ADD
		result.current.actions.handleAddScript('build');
		await waitFor(() => expect(result.current.configuredScripts.length).toBe(1));

		// WebSocket: script created
		rerender({
			scripts: [
				{
					script: {
						id: 'script-1',
						workspaceId: mockWorkspaceId,
						scriptName: 'build',
						enabled: true,
						displayName: 'build',
						description: '',
						url: '',
						order: 0,
						createdAt: '2024-01-01T00:00:00Z',
						updatedAt: '2024-01-01T00:00:00Z',
						version: 1,
					},
					process: undefined,
				},
			],
		});

		await waitFor(() => {
			expect(result.current.configuredScripts[0].id).toBe('script-1'); // Real ID
		});

		// Cycle 2: REMOVE
		result.current.actions.handleRemoveScript('script-1');
		await waitFor(() => expect(result.current.configuredScripts.length).toBe(0));

		// WebSocket: script deleted
		rerender({ scripts: [] });

		// Cycle 3: ADD AGAIN - should work without "already exists" error
		result.current.actions.handleAddScript('build');

		await waitFor(() => {
			expect(result.current.configuredScripts.length).toBe(1);
			// Should NOT have error
			expect(result.current.error).toBeNull();
		});

		// Create API should be called twice (cycle 1 and cycle 3)
		expect(vi.mocked(workspaceScriptsApi.createWorkspaceScript)).toHaveBeenCalledTimes(2);
	});
});
