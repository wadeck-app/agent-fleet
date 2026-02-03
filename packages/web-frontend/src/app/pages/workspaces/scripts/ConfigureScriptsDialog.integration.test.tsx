import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfigureScriptsDialog } from './ConfigureScriptsDialog';
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

describe('ConfigureScriptsDialog - Visual Pending States', () => {
	const mockWorkspaceId = 'workspace-123';

	const mockScripts: ScriptProcessWithConfig[] = [
		{
			script: {
				id: 'script-1',
				workspaceId: mockWorkspaceId,
				scriptName: 'test-script',
				enabled: true,
				displayName: 'Test Script',
				description: '',
				url: '',
				order: 0,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				version: 1,
			},
			process: undefined,
		},
		{
			script: {
				id: 'script-2',
				workspaceId: mockWorkspaceId,
				scriptName: 'another-script',
				enabled: true,
				displayName: 'Another Script',
				description: '',
				url: '',
				order: 1,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				version: 1,
			},
			process: undefined,
		},
	];

	it('should show pending state (opacity-50) when REMOVING a script (LEFT → RIGHT)', async () => {
		const user = userEvent.setup();

		// Mock discover to find available scripts (needed for available section to work)
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'test-script', command: 'npm run test-script' },
			{ name: 'another-script', command: 'npm run another-script' },
			{ name: 'third-script', command: 'npm run third-script' },
		]);

		// Mock API with a delay to keep pending state visible
		let resolveDelete: () => void;
		const deletePromise = new Promise<{ success: boolean }>(resolve => {
			resolveDelete = () => resolve({ success: true });
		});
		vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockReturnValue(deletePromise);

		render(
			<ConfigureScriptsDialog workspaceId={mockWorkspaceId} open={true} onClose={vi.fn()} scripts={mockScripts} />
		);

		// Click Discover to load available scripts (so they can be shown when we remove configured ones)
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		// Wait for discover to complete (third-script is not configured, so it should appear)
		await waitFor(() => {
			expect(screen.getByText('third-script')).toBeInTheDocument();
		});

		// Find the configured script item (test-script is in mockScripts)
		// Use "Test Script" as it's the displayName
		expect(screen.getByText('Test Script')).toBeInTheDocument();

		// Find and click the remove button for "Test Script"
		const removeButton = screen.getByRole('button', { name: 'Remove Test Script' });
		await user.click(removeButton);

		// CRITICAL: The script should move to available section with opacity-50 (pending state)
		// After remove, it should appear with scriptName "test-script" (not displayName "Test Script")
		// First check that it disappears from configured
		await waitFor(() => {
			expect(screen.queryByText('Test Script')).not.toBeInTheDocument();
		});

		// Then check that it appears in available with pending state
		await waitFor(
			() => {
				const pendingItem = screen.getByText('test-script');
				expect(pendingItem).toBeInTheDocument();
				// Find the parent div that has both flex and items-center classes (the AvailableScriptItem root)
				const container = pendingItem.closest('.flex.items-center');
				expect(container).toHaveClass('opacity-50');
				expect(container).toHaveClass('pointer-events-none');
			},
			{ timeout: 500 }
		);

		// Resolve the API call
		resolveDelete!();

		// After API resolves, pending state should clear
		await waitFor(() => {
			const item = screen.getByText('test-script').closest('.flex.items-center')!;
			expect(item).not.toHaveClass('opacity-50');
			expect(item).not.toHaveClass('pointer-events-none');
		});
	});

	it('should show pending state (opacity-50) when ADDING a script (RIGHT → LEFT)', async () => {
		const user = userEvent.setup();

		// Mock discover to have available scripts
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'new-script', command: 'npm run new-script' },
		]);

		// Mock create with a delay
		let resolveCreate: () => void;
		const createPromise = new Promise<any>(resolve => {
			resolveCreate = () =>
				resolve({
					id: 'script-3',
					workspaceId: mockWorkspaceId,
					scriptName: 'new-script',
					enabled: true,
					displayName: 'new-script',
					description: '',
					url: '',
					order: 2,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
					version: 1,
				});
		});
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockReturnValue(createPromise);

		render(
			<ConfigureScriptsDialog workspaceId={mockWorkspaceId} open={true} onClose={vi.fn()} scripts={mockScripts} />
		);

		// Click Discover
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		// Wait for available scripts to load
		await waitFor(() => {
			expect(screen.getByText('new-script')).toBeInTheDocument();
		});

		// Find and click the add button (←) for new-script
		const addButton = screen.getByRole('button', { name: 'Add new-script' });
		await user.click(addButton);

		// CRITICAL: The script should appear in configured section with opacity-50 (pending state)
		await waitFor(
			() => {
				// Script moved to configured (check it's still findable)
				const pendingItem = screen.getByText('new-script');
				expect(pendingItem).toBeInTheDocument();
				// Find the parent div that has the opacity-50 class (the item root container)
				const container = pendingItem.closest('.flex.items-center');
				expect(container).toHaveClass('opacity-50'); // Should have pending style
				expect(container).toHaveClass('pointer-events-none'); // Should be disabled
			},
			{ timeout: 200 }
		);

		// Resolve the API call
		resolveCreate!();

		// After API resolves, pending state should clear
		await waitFor(() => {
			const item = screen.getByText('new-script').closest('.flex.items-center')!;
			expect(item).not.toHaveClass('opacity-50');
			expect(item).not.toHaveClass('pointer-events-none');
		});
	});
});
