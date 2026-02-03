import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('useConfigureScriptsState', () => {
	const mockWorkspaceId = 'workspace-123';
	const mockScripts: ScriptProcessWithConfig[] = [
		{
			script: {
				id: 'script-1',
				workspaceId: mockWorkspaceId,
				scriptName: 'test-script',
				enabled: true,
				displayName: 'Test Script',
				description: 'A test script',
				url: '',
				order: 0,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				version: 1,
			},
			process: undefined,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Pending State (isLoading)', () => {
		it('should show pending state when adding a script (RIGHT → LEFT)', async () => {
			// Mock successful API call with delay
			let resolveCreate: () => void;
			const createPromise = new Promise<void>(resolve => {
				resolveCreate = resolve;
			});
			vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockReturnValue(createPromise as any);

			const { result } = renderHook(() =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts: mockScripts,
					isOpen: true,
				})
			);

			// Initially: no loading items
			expect(result.current.loadingItems.size).toBe(0);

			// Add a new script
			const addPromise = result.current.actions.handleAddScript('new-script');

			// CRITICAL: Wait for state update (optimistic + loading)
			await waitFor(() => {
				// The script should appear in configured scripts (optimistic)
				expect(result.current.configuredScripts.length).toBe(2);
			});

			// Find the temporary script
			const tempScript = result.current.configuredScripts.find(s => s.scriptName === 'new-script');
			expect(tempScript).toBeDefined();
			expect(tempScript?.id).toBe('temp-new-script');

			// BUG CHECK: loadingItems should contain the temp script ID
			// This is the bug: loadingItems has 'new-script' but should have 'temp-new-script'
			expect(result.current.loadingItems.has(tempScript!.id)).toBe(true);

			// Resolve the API call
			resolveCreate!();
			await addPromise;

			// After completion: loading state should be cleared
			await waitFor(() => {
				expect(result.current.loadingItems.size).toBe(0);
			});
		});

		it('should show pending state when removing a script (LEFT → RIGHT)', async () => {
			// Mock successful API call with delay
			let resolveDelete: () => void;
			const deletePromise = new Promise<void>(resolve => {
				resolveDelete = resolve;
			});
			vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockReturnValue(deletePromise as any);

			const { result } = renderHook(() =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts: mockScripts,
					isOpen: true,
				})
			);

			// Initially: one script
			expect(result.current.configuredScripts.length).toBe(1);
			const scriptId = result.current.configuredScripts[0].id;

			// Remove the script
			const removePromise = result.current.actions.handleRemoveScript(scriptId);

			// CRITICAL: Wait for state update (optimistic + loading)
			await waitFor(() => {
				// Loading state should be set
				expect(result.current.loadingItems.has(scriptId)).toBe(true);
			});

			// The script should still be in the list (for pending display) but marked as loading
			// Note: Due to optimistic removal, it's actually removed from configuredScripts
			// but loadingItems should still have the scriptId
			expect(result.current.loadingItems.has(scriptId)).toBe(true);

			// Resolve the API call
			resolveDelete!();
			await removePromise;

			// After completion: loading state should be cleared
			await waitFor(() => {
				expect(result.current.loadingItems.size).toBe(0);
			});
		});
	});

	describe('Optimistic Updates', () => {
		it('should immediately add script to configured list', async () => {
			vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockResolvedValue({} as any);

			const { result } = renderHook(() =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts: mockScripts,
					isOpen: true,
				})
			);

			// Initially: 1 script
			expect(result.current.configuredScripts.length).toBe(1);

			// Add a new script
			result.current.actions.handleAddScript('new-script');

			// Wait for optimistic update
			await waitFor(() => {
				expect(result.current.configuredScripts.length).toBe(2);
			});

			// The new script should be a temporary one
			const newScript = result.current.configuredScripts.find(s => s.scriptName === 'new-script');
			expect(newScript).toBeDefined();
			expect(newScript?.id).toBe('temp-new-script');
			expect(newScript?.isNew).toBe(true);
		});

		it('should immediately remove script from configured list', async () => {
			vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockResolvedValue({ success: true });

			const { result } = renderHook(() =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts: mockScripts,
					isOpen: true,
				})
			);

			// Initially: 1 script
			expect(result.current.configuredScripts.length).toBe(1);
			const scriptId = result.current.configuredScripts[0].id;

			// Remove the script
			result.current.actions.handleRemoveScript(scriptId);

			// Wait for optimistic update
			await waitFor(() => {
				expect(result.current.configuredScripts.length).toBe(0);
			});
		});

		it('should rollback on API error', async () => {
			vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockRejectedValue(new Error('API Error'));

			const { result } = renderHook(() =>
				useConfigureScriptsState({
					workspaceId: mockWorkspaceId,
					scripts: mockScripts,
					isOpen: true,
				})
			);

			// Initially: 1 script
			expect(result.current.configuredScripts.length).toBe(1);

			// Add a new script (will fail)
			await result.current.actions.handleAddScript('new-script');

			// Wait for rollback
			await waitFor(() => {
				// Should be back to 1 script
				expect(result.current.configuredScripts.length).toBe(1);
			});

			// Error should be set
			expect(result.current.error).toContain('API Error');
		});
	});

	describe('Clear state on dialog close', () => {
		it('should clear optimistic state when dialog closes', async () => {
			vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockImplementation(
				() => new Promise(() => {}) // Never resolves
			);

			const { result, rerender } = renderHook(
				({ isOpen }) =>
					useConfigureScriptsState({
						workspaceId: mockWorkspaceId,
						scripts: mockScripts,
						isOpen,
					}),
				{
					initialProps: { isOpen: true },
				}
			);

			// Add a script (won't complete)
			result.current.actions.handleAddScript('new-script');

			// Wait for optimistic state
			await waitFor(() => {
				expect(result.current.configuredScripts.length).toBe(2);
				// Should have 2 loading items: 'new-script' (available) + 'temp-new-script' (configured)
				expect(result.current.loadingItems.size).toBe(2);
			});

			// Close the dialog
			rerender({ isOpen: false });

			// Wait for state to clear
			await waitFor(() => {
				expect(result.current.loadingItems.size).toBe(0);
			});
		});
	});
});
