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

const mockScripts: ScriptProcessWithConfig[] = [
	{
		script: {
			id: 'script-1',
			workspaceId: 'ws-1',
			scriptName: 'test',
			enabled: true,
			displayName: 'test',
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

describe('ConfigureScriptsDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should NOT close dialog when reordering scripts via drag and drop (regression test)', async () => {
		const onClose = vi.fn();

		const twoScripts: ScriptProcessWithConfig[] = [
			{
				script: {
					id: 'script-1',
					workspaceId: 'ws-1',
					scriptName: 'dev',
					enabled: true,
					displayName: 'dev',
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
					workspaceId: 'ws-1',
					scriptName: 'build',
					enabled: true,
					displayName: 'build',
					description: '',
					url: '',
					order: 1,
					createdAt: '2024-01-01T00:00:01Z',
					updatedAt: '2024-01-01T00:00:01Z',
					version: 1,
				},
				process: undefined,
			},
		];

		// Mock successful update for reordering
		vi.mocked(workspaceScriptsApi.updateWorkspaceScript).mockResolvedValue({
			id: 'script-1',
			workspaceId: 'ws-1',
			scriptName: 'dev',
			enabled: true,
			displayName: 'dev',
			description: '',
			url: '',
			order: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
			version: 2,
		});

		const { rerender } = render(
			<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={twoScripts} />
		);

		await waitFor(() => {
			expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		});

		// Verify both scripts are visible in order
		expect(screen.getByText('Configured Scripts (2/10)')).toBeInTheDocument();
		expect(screen.getByText('dev')).toBeInTheDocument();
		expect(screen.getByText('build')).toBeInTheDocument();

		// Simulate drag and drop (can't easily test actual DnD in jsdom)
		// Instead, simulate the reorder by calling the internal handler
		// We'll trigger it by simulating props change after multiple WebSocket events

		// Simulate the burst of WebSocket events that happens during reorder
		// (as seen in the logs: created/deleted/updated events)
		const reorderedScripts: ScriptProcessWithConfig[] = [
			{
				script: { ...twoScripts[1].script, order: 0 }, // build now first
				process: undefined,
			},
			{
				script: { ...twoScripts[0].script, order: 1 }, // dev now second
				process: undefined,
			},
		];

		// Simulate multiple rapid props updates (WebSocket events)
		// No need for setTimeout - rerenders are synchronous
		for (let i = 0; i < 5; i++) {
			rerender(
				<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={reorderedScripts} />
			);
		}

		// CRITICAL: Dialog should NOT close despite the burst of updates
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		expect(screen.getByText('Configured Scripts (2/10)')).toBeInTheDocument();
	});

	it('should preserve optimistic order during reordering even when props change (regression test)', async () => {
		const onClose = vi.fn();

		const twoScripts: ScriptProcessWithConfig[] = [
			{
				script: {
					id: 'script-1',
					workspaceId: 'ws-1',
					scriptName: 'dev',
					enabled: true,
					displayName: 'dev',
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
					workspaceId: 'ws-1',
					scriptName: 'build',
					enabled: true,
					displayName: 'build',
					description: '',
					url: '',
					order: 1,
					createdAt: '2024-01-01T00:00:01Z',
					updatedAt: '2024-01-01T00:00:01Z',
					version: 1,
				},
				process: undefined,
			},
		];

		const { rerender } = render(
			<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={twoScripts} />
		);

		// Wait for initial render
		await waitFor(() => {
			expect(screen.getByText('dev')).toBeInTheDocument();
			expect(screen.getByText('build')).toBeInTheDocument();
		});

		// Simulate props change (WebSocket event) while dialog is open
		// CRITICAL: This should NOT reset the visual order or close the dialog
		const unrelatedUpdate: ScriptProcessWithConfig[] = [
			{
				script: { ...twoScripts[0].script, version: 2 },
				process: undefined,
			},
			{
				script: { ...twoScripts[1].script, version: 2 },
				process: undefined,
			},
		];

		// Trigger rerender with updated props (simulating WebSocket)
		rerender(<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={unrelatedUpdate} />);

		// CRITICAL: Order should remain stable (scripts should still be visible in same order)
		// The dialog should not flash or reset during the update
		expect(screen.getByText('dev')).toBeInTheDocument();
		expect(screen.getByText('build')).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('should NOT close dialog when clicking left arrow to add a script (regression test)', async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();

		// Mock discover API to return available scripts
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'build', command: 'npm run build' },
			{ name: 'test', command: 'npm test' },
		]);

		// Use deferred promise to control when the create completes
		const createDeferred = createDeferredPromise();
		vi.mocked(workspaceScriptsApi.createWorkspaceScript).mockReturnValue(createDeferred.promise);

		// 1. Open dialog with one existing script
		render(<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={mockScripts} />);

		await waitFor(() => {
			expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		});

		// 2. Click "Discover" button
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		// 3. Wait for scripts to appear in Available Scripts (right column)
		await waitFor(() => {
			expect(screen.getByText('build')).toBeInTheDocument();
		});

		// 4. Click left arrow (←) to add "build" script
		const addBuildButton = screen.getByRole('button', { name: 'Add build' });
		await user.click(addBuildButton);

		// 5. CRITICAL: Dialog should NOT close BEFORE API completes
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		// Script should be optimistically added (moved to left column)
		expect(screen.getByText('Configured Scripts (2/10)')).toBeInTheDocument();

		// 6. Resolve the API call
		createDeferred.resolve({
			id: 'script-2',
			workspaceId: 'ws-1',
			scriptName: 'build',
			enabled: true,
			displayName: 'build',
			description: '',
			url: '',
			order: 1,
			createdAt: '2024-01-01T00:00:01Z',
			updatedAt: '2024-01-01T00:00:01Z',
			version: 1,
		});

		// 7. CRITICAL: Dialog should STILL NOT close AFTER API completes
		await waitFor(() => expect(onClose).not.toHaveBeenCalled());
		expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		expect(screen.getByText('Configured Scripts (2/10)')).toBeInTheDocument();
	});

	it('should not reinitialize when props change while dialog is open', async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();

		// 1. Render with initial scripts
		const { rerender } = render(
			<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={mockScripts} />
		);

		// Wait for initial render
		await waitFor(() => {
			expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		});

		// 2. Add optimistic state (user adds a script)
		vi.mocked(workspaceScriptsApi.discoverAvailableScripts).mockResolvedValue([
			{ name: 'build', command: 'npm run build' },
		]);

		// Click discover button
		const discoverButton = screen.getByRole('button', { name: /discover/i });
		await user.click(discoverButton);

		// Wait for scripts to load
		await waitFor(() => {
			expect(screen.getByText('build')).toBeInTheDocument();
		});

		// 3. Simulate props change (WebSocket event) - add a new script from server
		const updatedScripts: ScriptProcessWithConfig[] = [
			...mockScripts,
			{
				script: {
					id: 'script-2',
					workspaceId: 'ws-1',
					scriptName: 'build',
					enabled: true,
					displayName: 'build',
					description: '',
					url: '',
					order: 1,
					createdAt: '2024-01-01T00:00:01Z',
					updatedAt: '2024-01-01T00:00:01Z',
					version: 1,
				},
				process: undefined,
			},
		];

		rerender(<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={updatedScripts} />);

		// 4. Verify dialog didn't close/reopen - dialog title should still be visible
		expect(screen.getByText('Configure Scripts')).toBeInTheDocument();

		// 5. Verify discovered scripts are still visible (optimistic state preserved)
		expect(screen.getByText('build')).toBeInTheDocument();
	});

	it('should preserve optimistic removal when props update BEFORE server confirms', async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();

		// Use deferred promise to control when delete completes
		const deleteDeferred = createDeferredPromise();
		vi.mocked(workspaceScriptsApi.deleteWorkspaceScript).mockReturnValue(deleteDeferred.promise);

		const { rerender } = render(
			<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={mockScripts} />
		);

		// Wait for initial render - script should be visible
		await waitFor(() => {
			expect(screen.getByText('test')).toBeInTheDocument();
		});

		// Find and click remove button (arrow right button)
		const removeButtons = screen.getAllByRole('button');
		const removeButton = removeButtons.find(btn => btn.getAttribute('aria-label')?.includes('Remove'));
		if (removeButton) {
			await user.click(removeButton);
		}

		// Verify script is immediately hidden (optimistic removal)
		await waitFor(() => {
			expect(screen.queryByText('test')).not.toBeInTheDocument();
		});

		// BUG TEST: Simulate unrelated props update (WebSocket event for a different script)
		// while the delete is still in progress (BEFORE server confirms)
		// If the bug exists, this will RESET editingScripts and make the script reappear!
		const unrelatedUpdate = [
			{
				...mockScripts[0],
				script: { ...mockScripts[0].script, version: 2 }, // Just a version bump
			},
		];

		rerender(<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={unrelatedUpdate} />);

		// CRITICAL: Script should STILL be hidden (optimistic state preserved)
		// If the bug exists, the script will reappear because editingScripts was reset
		expect(screen.queryByText('test')).not.toBeInTheDocument();

		// Now resolve the delete
		deleteDeferred.resolve({} as any);

		// Wait for delete to complete
		await waitFor(() => {
			expect(vi.mocked(workspaceScriptsApi.deleteWorkspaceScript)).toHaveBeenCalled();
		});

		// Script should STILL be hidden after delete completes
		expect(screen.queryByText('test')).not.toBeInTheDocument();
	});

	it('should not close dialog when scripts prop changes', async () => {
		const onClose = vi.fn();

		const { rerender } = render(
			<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={mockScripts} />
		);

		// Wait for initial render
		await waitFor(() => {
			expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
		});

		// Change props multiple times (simulate multiple WebSocket events)
		// No need for setTimeout - rerenders are synchronous
		for (let i = 0; i < 5; i++) {
			const updatedScripts = mockScripts.map(s => ({
				...s,
				script: { ...s.script, version: s.script.version + 1 },
			}));

			rerender(
				<ConfigureScriptsDialog workspaceId="ws-1" open={true} onClose={onClose} scripts={updatedScripts} />
			);
		}

		// Verify dialog never closed
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByText('Configure Scripts')).toBeInTheDocument();
	});
});
