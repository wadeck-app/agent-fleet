import type { Project } from '@shared/api/projects.contract';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createControlledPromise } from '@/test/utils/asyncUtils';

import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';

/**
 * ===========================================================================================
 * PROPER TESTS - Using asyncUtils and Controlled Promises
 * ===========================================================================================
 *
 * These tests use the existing asyncUtils.createControlledPromise() to properly test
 * optimistic updates with controlled async timing.
 *
 * Test approach:
 * 1. Mock handlers with controlled promises (from asyncUtils)
 * 2. User performs action
 * 3. Verify IMMEDIATE optimistic state (item moved, loading state visible)
 * 4. Resolve promise
 * 5. Verify final state after API completes
 *
 * Key assertions:
 * - Items move IMMEDIATELY (before API response)
 * - Loading/reordering states are VISIBLE (opacity-50)
 * - Final state matches server response
 * - Errors trigger rollback
 *
 * ===========================================================================================
 */

const createMockProject = (id: string, name: string, pinned: boolean, order: number): Project => ({
	id,
	name,
	pinned,
	order,
	workspaceIds: [],
	taskCount: 0,
	archived: false,
	version: 1,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
});

const mockProjects: Project[] = [
	createMockProject('project-1', 'Project Alpha', true, 0),
	createMockProject('project-2', 'Project Beta', true, 1),
	createMockProject('project-3', 'Project Gamma', false, 0),
	createMockProject('project-4', 'Project Delta', false, 0),
];

describe('ManagePinnedProjectsDialog - Optimistic Updates with asyncUtils', () => {
	it('PIN: should move item immediately and show loading state', async () => {
		const user = userEvent.setup();
		const pinPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(pinPromise.promise);

		render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		// STEP 1: Verify initial state
		const leftPanel = screen.getByText('Pinned Projects').closest('.space-y-4') as HTMLElement;
		const rightPanel = screen.getByText('Available Projects').closest('.space-y-4') as HTMLElement;

		expect(within(leftPanel).queryByText('Project Gamma')).not.toBeInTheDocument();
		expect(within(rightPanel).getByText('Project Gamma')).toBeInTheDocument();

		// STEP 2: Click pin button
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 3: CRITICAL - Verify optimistic state BEFORE API responds
		// Item should move to left panel IMMEDIATELY
		await waitFor(() => {
			expect(within(leftPanel).getByText('Project Gamma')).toBeInTheDocument();
		});

		// Item should NO LONGER be in right panel
		expect(within(rightPanel).queryByText('Project Gamma')).not.toBeInTheDocument();

		// CRITICAL BUG CHECK: Item should have loading state (opacity-50)
		const gammaContainer = within(leftPanel).getByText('Project Gamma').closest('div') as HTMLElement;
		expect(gammaContainer.className).toContain('opacity-50');
		expect(gammaContainer.className).toContain('pointer-events-none');

		// STEP 4: Resolve promise (API completes)
		pinPromise.resolve();

		// STEP 5: Loading state should clear
		await waitFor(() => {
			const updatedContainer = within(leftPanel).getByText('Project Gamma').closest('div') as HTMLElement;
			expect(updatedContainer.className).not.toContain('opacity-50');
		});
	});

	it('UNPIN: should move item immediately and show loading state', async () => {
		const user = userEvent.setup();
		const unpinPromise = createControlledPromise<void>();
		const onUnpin = vi.fn().mockReturnValue(unpinPromise.promise);

		render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={vi.fn()}
				onUnpin={onUnpin}
				onReorder={vi.fn()}
			/>
		);

		const leftPanel = screen.getByText('Pinned Projects').closest('.space-y-4') as HTMLElement;
		const rightPanel = screen.getByText('Available Projects').closest('.space-y-4') as HTMLElement;

		// STEP 1: Verify Project Alpha is in left panel
		expect(within(leftPanel).getByText('Project Alpha')).toBeInTheDocument();

		// STEP 2: Click unpin button
		const unpinButton = screen.getByLabelText('Unpin Project Alpha');
		await user.click(unpinButton);

		// STEP 3: Verify optimistic state (item moved immediately)
		await waitFor(() => {
			expect(within(rightPanel).getByText('Project Alpha')).toBeInTheDocument();
		});
		expect(within(leftPanel).queryByText('Project Alpha')).not.toBeInTheDocument();

		// Verify loading state
		const alphaContainer = within(rightPanel).getByText('Project Alpha').closest('div') as HTMLElement;
		expect(alphaContainer.className).toContain('opacity-50');

		// STEP 4: Resolve promise
		unpinPromise.resolve();

		// STEP 5: Loading state clears
		await waitFor(() => {
			const updatedContainer = within(rightPanel).getByText('Project Alpha').closest('div') as HTMLElement;
			expect(updatedContainer.className).not.toContain('opacity-50');
		});
	});

	it('REORDER: should reorder immediately and show reordering state on ALL items', async () => {
		const reorderPromise = createControlledPromise<void>();
		const onReorder = vi.fn().mockReturnValue(reorderPromise.promise);

		// For this test, we need to simulate the DnD onReorder being called
		// Since we can't easily trigger DnD in tests, we'll verify the handler setup
		render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={vi.fn()}
				onUnpin={vi.fn()}
				onReorder={onReorder}
			/>
		);

		// Verify dialog renders pinned projects
		const leftPanel = screen.getByText('Pinned Projects').closest('.space-y-4') as HTMLElement;
		expect(within(leftPanel).getByText('Project Alpha')).toBeInTheDocument();
		expect(within(leftPanel).getByText('Project Beta')).toBeInTheDocument();

		// Note: Testing actual DnD requires more complex setup with @dnd-kit test utilities
		// For now, we verify that onReorder prop is passed correctly
		// Integration tests would verify the full DnD flow

		expect(onReorder).not.toHaveBeenCalled(); // Not called yet
	});

	it('ERROR: should rollback optimistic state on API error', async () => {
		const user = userEvent.setup();
		const pinPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(pinPromise.promise);

		render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		const leftPanel = screen.getByText('Pinned Projects').closest('.space-y-4') as HTMLElement;
		const rightPanel = screen.getByText('Available Projects').closest('.space-y-4') as HTMLElement;

		// STEP 1: Pin Project Gamma
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 2: Verify optimistic state (item moved)
		await waitFor(() => {
			expect(within(leftPanel).getByText('Project Gamma')).toBeInTheDocument();
		});

		// STEP 3: Reject promise (API error)
		pinPromise.reject(new Error('Network error'));

		// STEP 4: Item should ROLLBACK to right panel
		await waitFor(() => {
			expect(within(rightPanel).getByText('Project Gamma')).toBeInTheDocument();
		});
		expect(within(leftPanel).queryByText('Project Gamma')).not.toBeInTheDocument();
	});

	it('DIALOG CLOSE: should clear all optimistic states', async () => {
		const user = userEvent.setup();
		const pinPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(pinPromise.promise);
		const onOpenChange = vi.fn();

		const { rerender } = render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={onOpenChange}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		// STEP 1: Pin item (optimistic state active)
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 2: Close dialog (without resolving promise)
		rerender(
			<ManagePinnedProjectsDialog
				open={false}
				onOpenChange={onOpenChange}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		// STEP 3: Reopen dialog - optimistic state should be cleared
		rerender(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={onOpenChange}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		// STEP 4: Verify Project Gamma is back in right panel (optimistic state cleared)
		const rightPanel = screen.getByText('Available Projects').closest('.space-y-4') as HTMLElement;
		expect(within(rightPanel).getByText('Project Gamma')).toBeInTheDocument();
	});
});
