import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigureScriptsDialog } from './ConfigureScriptsDialog';
import { workspaceScriptsApi } from './workspaceScripts.api';

// Mock the API
vi.mock('./workspaceScripts.api', () => ({
	workspaceScriptsApi: {
		listWorkspaceScripts: vi.fn(),
		createWorkspaceScript: vi.fn(),
		deleteWorkspaceScript: vi.fn(),
		updateWorkspaceScript: vi.fn(),
		discoverAvailableScripts: vi.fn(),
	},
}));

describe('ConfigureScriptsDialog - Rapid Toggle Regression', () => {
	const mockWorkspaceId = 'workspace-123';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should prevent removing a script that is currently being added (ADD then REMOVE rapidly)', async () => {
		const user = userEvent.setup();

		// Mock discover to have available scripts
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'build', command: 'npm run build' },
		]);

		// Mock create with a delay (simulating slow API) - NEVER resolves
		const createDeferred = createDeferredPromise<any>();
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockReturnValue(createDeferred.promise);

		render(<ConfigureScriptsDialog workspaceId={mockWorkspaceId} open={true} onClose={vi.fn()} scripts={[]} />);

		// Click Discover
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		// Wait for available scripts
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Add build' })).toBeInTheDocument();
		});

		// Step 1: ADD (RIGHT → LEFT) - API is slow, doesn't complete
		const addButton = screen.getByRole('button', { name: 'Add build' });
		await user.click(addButton);

		// Script should appear in configured with temp ID (optimistic add)
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Remove build' })).toBeInTheDocument();
		});

		// Step 2: Immediately try to REMOVE (LEFT → RIGHT) while ADD is still in progress
		const removeButton = screen.getByRole('button', { name: 'Remove build' });

		// CRITICAL: Button should be DISABLED (preventing the remove operation)
		// This is better UX than showing an error - the button can't be clicked at all
		await waitFor(() => {
			expect(removeButton).toBeDisabled();
		});

		// Delete API should NOT have been called (button is disabled)
		expect(vi.mocked(workspaceScriptsApi.deleteWorkspaceScript)).not.toHaveBeenCalled();

		// Resolve the API call
		createDeferred.resolve({
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

		// After API completes, button should be enabled again
		await waitFor(() => {
			expect(removeButton).not.toBeDisabled();
		});
	});

	it('should prevent re-adding a script that is currently being deleted (regression test)', async () => {
		const user = userEvent.setup();

		// Mock discover to have available scripts
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'build:orchestrator', command: 'npm run build --workspace=orchestrator' },
		]);

		// Mock create that will fail with "already exists" error
		const createDeferred = createDeferredPromise<any>();
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockReturnValue(createDeferred.promise);

		// Mock delete with a delay (simulating slow API)
		const deleteDeferred = createDeferredPromise<{ success: boolean }>();
		vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockReturnValue(deleteDeferred.promise);

		const mockScripts: ScriptProcessWithConfig[] = [
			{
				script: {
					id: 'script-1',
					workspaceId: mockWorkspaceId,
					scriptName: 'build:orchestrator',
					enabled: true,
					displayName: 'build:orchestrator',
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

		render(
			<ConfigureScriptsDialog workspaceId={mockWorkspaceId} open={true} onClose={vi.fn()} scripts={mockScripts} />
		);

		// Click Discover to load available scripts
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		// Wait for initial render
		await waitFor(() => {
			expect(screen.getByText('build:orchestrator')).toBeInTheDocument();
		});

		// Step 1: Remove the script (LEFT → RIGHT)
		const removeButton = screen.getByRole('button', { name: 'Remove build:orchestrator' });
		await user.click(removeButton);

		// Script should move to available (optimistic removal)
		await waitFor(() => {
			expect(screen.queryByRole('button', { name: 'Remove build:orchestrator' })).not.toBeInTheDocument();
		});

		// Step 2: Try to add it back immediately (RIGHT → LEFT) while delete is still pending
		const addButton = screen.getByRole('button', { name: 'Add build:orchestrator' });

		// CRITICAL: This click should be PREVENTED or show error immediately
		// because the script is still being deleted (delete API hasn't responded yet)
		await user.click(addButton);

		// The add button should be disabled OR an error should be shown
		// (The script is still in the process of being deleted on the server)
		await waitFor(() => {
			// Check if error is displayed
			const errorText = screen.queryByText(/already exists|in progress/i);
			if (errorText) {
				expect(errorText).toBeInTheDocument();
			} else {
				// Or the button should still be disabled
				expect(screen.getByRole('button', { name: 'Add build:orchestrator' })).toBeDisabled();
			}
		});

		// Resolve the delete (server confirms deletion)
		deleteDeferred.resolve({ success: true });

		// Now the script should be fully available for re-adding
		await waitFor(() => {
			const btn = screen.getByRole('button', { name: 'Add build:orchestrator' });
			expect(btn).not.toBeDisabled();
		});
	});

	it('should allow re-adding a script after delete completes successfully', async () => {
		const user = userEvent.setup();

		// Mock discover
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'build', command: 'npm run build' },
		]);

		// Mock delete that resolves immediately
		vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockResolvedValue({ success: true });

		// Mock create
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockResolvedValue({
			id: 'script-2',
			workspaceId: mockWorkspaceId,
			scriptName: 'build',
			enabled: true,
			displayName: 'build',
			description: '',
			url: '',
			order: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
			version: 1,
		});

		const mockScripts: ScriptProcessWithConfig[] = [
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

		render(
			<ConfigureScriptsDialog workspaceId={mockWorkspaceId} open={true} onClose={vi.fn()} scripts={mockScripts} />
		);

		// Discover
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Remove build' })).toBeInTheDocument();
		});

		// Step 1: Remove
		const removeButton = screen.getByRole('button', { name: 'Remove build' });
		await user.click(removeButton);

		// Wait for delete to complete
		await waitFor(() => {
			expect(vi.mocked(workspaceScriptsApi.deleteWorkspaceScript)).toHaveBeenCalled();
		});

		// After delete completes, the button should be enabled again
		await waitFor(() => {
			const addBtn = screen.getByRole('button', { name: 'Add build' });
			expect(addBtn).not.toBeDisabled();
		});

		// Step 2: Now we should be able to add it back
		const addButton = screen.getByRole('button', { name: 'Add build' });
		await user.click(addButton);

		// Should call create API without errors
		await waitFor(() => {
			expect(vi.mocked(workspaceScriptsApi.createWorkspaceScript)).toHaveBeenCalled();
		});
	});
});
