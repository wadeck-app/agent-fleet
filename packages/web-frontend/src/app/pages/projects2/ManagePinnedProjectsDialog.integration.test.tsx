import type { Project } from '@shared/api/projects.contract';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';

/**
 * ===========================================================================================
 * INTEGRATION TESTS - Real Component with Controlled Promises
 * ===========================================================================================
 *
 * These tests mount the REAL ManagePinnedProjectsDialog component and use controlled
 * promises to verify optimistic UI behavior DURING API calls (not just after).
 *
 * Key testing approach:
 * 1. Create controlled promise (can resolve/reject manually)
 * 2. User performs action (pin/unpin/reorder)
 * 3. IMMEDIATELY verify optimistic state (before promise resolves)
 * 4. Verify loading/reordering states are shown
 * 5. Resolve promise
 * 6. Verify final state matches server response
 *
 * These tests WILL FAIL if optimistic updates are broken!
 * ===========================================================================================
 */

// Helper to create a controlled promise
function createControlledPromise<T = void>() {
	let resolve: (value: T | PromiseLike<T>) => void = () => {};
	let reject: (error: Error) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const mockProjects: Project[] = [
	{
		id: 'project-1',
		name: 'Project Alpha',
		pinned: true,
		order: 0,
		workspaceIds: [],
		taskCount: 5,
		archived: false,
		version: 1,
		icon: 'Folder',
		iconColor: '#3B82F6',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'project-2',
		name: 'Project Beta',
		pinned: true,
		order: 1,
		workspaceIds: [],
		taskCount: 3,
		archived: false,
		version: 1,
		icon: 'FolderKanban',
		iconColor: '#10B981',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'project-3',
		name: 'Project Gamma',
		pinned: false,
		order: 0,
		workspaceIds: [],
		taskCount: 8,
		archived: false,
		version: 1,
		icon: 'FolderOpen',
		iconColor: '#F59E0B',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'project-4',
		name: 'Project Delta',
		pinned: false,
		order: 0,
		workspaceIds: [],
		taskCount: 2,
		archived: false,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
];

describe('ManagePinnedProjectsDialog - Integration Tests with Controlled Promises', () => {
	it('PIN: should show item in left panel immediately WITH loading state (before API responds)', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(controlledPromise.promise);

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
		const leftPanel = screen.getByText('Pinned Projects').parentElement!;
		const rightPanel = screen.getByText('Available Projects').parentElement!;

		expect(within(leftPanel).queryByText('Project Gamma')).not.toBeInTheDocument();
		expect(within(rightPanel).getByText('Project Gamma')).toBeInTheDocument();

		// STEP 2: Click pin button for Project Gamma
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 3: CRITICAL - Before API responds, verify optimistic state
		// 3a. Item should be in left panel IMMEDIATELY
		await waitFor(() => {
			expect(within(leftPanel).getByText('Project Gamma')).toBeInTheDocument();
		});

		// 3b. Item should NO LONGER be in right panel
		expect(within(rightPanel).queryByText('Project Gamma')).not.toBeInTheDocument();

		// 3c. CRITICAL BUG CHECK: Item should show LOADING state (spinner)
		// The item should be disabled/loading while API call is pending
		const gammaItemInLeft = within(leftPanel).getByText('Project Gamma').closest('[class*="flex"]');
		expect(gammaItemInLeft).toHaveClass('pointer-events-none', 'opacity-50'); // Loading state classes

		// STEP 4: Promise is still pending - verify API was called
		expect(onPin).toHaveBeenCalledWith('project-3');
		expect(onPin).toHaveBeenCalledTimes(1);

		// STEP 5: Resolve the promise (simulate API success)
		controlledPromise.resolve();

		// STEP 6: Wait for loading state to clear
		await waitFor(() => {
			const updatedItem = within(leftPanel).getByText('Project Gamma').closest('[class*="flex"]');
			expect(updatedItem).not.toHaveClass('pointer-events-none');
		});
	});

	it('PIN: should place item at CORRECT position (not at end of list)', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(controlledPromise.promise);

		const { rerender } = render(
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

		const leftPanel = screen.getByText('Pinned Projects').parentElement!;

		// STEP 1: Pin Project Gamma
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 2: Before API responds, item should be at END (optimistically, no order yet)
		await waitFor(() => {
			expect(within(leftPanel).getByText('Project Gamma')).toBeInTheDocument();
		});

		// Get current order in left panel
		const leftItems = within(leftPanel).getAllByRole('button', { name: /Unpin/ });
		const currentOrder = leftItems.map(btn => btn.getAttribute('aria-label'));

		// BUG: Optimistically pinned item goes to END because it has no order
		// Expected: ['Unpin Project Alpha', 'Unpin Project Beta', 'Unpin Project Gamma']
		expect(currentOrder[2]).toBe('Unpin Project Gamma'); // At end initially

		// STEP 3: Resolve API and update props with CORRECT server order
		controlledPromise.resolve();

		// Simulate server response: Project Gamma gets order=2 (end position)
		const updatedProjects = mockProjects.map(p =>
			p.id === 'project-3' ? { ...p, pinned: true, order: 2 } : p
		);

		rerender(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={updatedProjects}
				pinnedProjects={updatedProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		// STEP 4: After props sync, verify final order matches server
		await waitFor(() => {
			const finalItems = within(leftPanel).getAllByRole('button', { name: /Unpin/ });
			const finalOrder = finalItems.map(btn => btn.getAttribute('aria-label'));
			expect(finalOrder).toEqual(['Unpin Project Alpha', 'Unpin Project Beta', 'Unpin Project Gamma']);
		});
	});

	it('UNPIN: should show item in right panel immediately WITH loading state', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onUnpin = vi.fn().mockReturnValue(controlledPromise.promise);

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

		const leftPanel = screen.getByText('Pinned Projects').parentElement!;
		const rightPanel = screen.getByText('Available Projects').parentElement!;

		// STEP 1: Verify Project Alpha is in left panel
		expect(within(leftPanel).getByText('Project Alpha')).toBeInTheDocument();

		// STEP 2: Click unpin button
		const unpinButton = screen.getByLabelText('Unpin Project Alpha');
		await user.click(unpinButton);

		// STEP 3: IMMEDIATELY verify optimistic state (before API responds)
		// 3a. Item should be in right panel
		await waitFor(() => {
			expect(within(rightPanel).getByText('Project Alpha')).toBeInTheDocument();
		});

		// 3b. Item should NO LONGER be in left panel
		expect(within(leftPanel).queryByText('Project Alpha')).not.toBeInTheDocument();

		// 3c. Item should show LOADING state
		const alphaItemInRight = within(rightPanel).getByText('Project Alpha').closest('[class*="flex"]');
		expect(alphaItemInRight).toHaveClass('pointer-events-none', 'opacity-50');

		// STEP 4: Resolve promise
		controlledPromise.resolve();

		// STEP 5: Loading state should clear
		await waitFor(() => {
			const updatedItem = within(rightPanel).getByText('Project Alpha').closest('[class*="flex"]');
			expect(updatedItem).not.toHaveClass('pointer-events-none');
		});
	});

	it('REORDER: should reorder immediately WITH reordering state (before API responds)', async () => {
		const controlledPromise = createControlledPromise<void>();
		const onReorder = vi.fn().mockReturnValue(controlledPromise.promise);

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

		const leftPanel = screen.getByText('Pinned Projects').parentElement!;

		// STEP 1: Verify initial order
		const initialItems = within(leftPanel).getAllByRole('button', { name: /Unpin/ });
		const initialOrder = initialItems.map(btn => btn.getAttribute('aria-label'));
		expect(initialOrder).toEqual(['Unpin Project Alpha', 'Unpin Project Beta']);

		// STEP 2: Simulate drag & drop (DualListDialog would call onReorder)
		// In real DnD: user drags project-2 (Beta) over project-1 (Alpha)
		// This should swap their positions
		onReorder('project-2', 'project-1');

		// STEP 3: IMMEDIATELY verify optimistic reordering (before promise resolves)
		// Note: We can't easily simulate DnD in tests, but we can verify that
		// when onReorder is called with controlled promise, the reordering state is set
		expect(onReorder).toHaveBeenCalledWith('project-2', 'project-1');

		// STEP 4: ALL items in left panel should show REORDERING state
		// This is the BUG - reordering state is not visible
		await waitFor(() => {
			const allLeftItems = within(leftPanel).getAllByText(/Project (Alpha|Beta)/);
			allLeftItems.forEach(item => {
				const container = item.closest('[class*="flex"]');
				// During reordering, ALL pinned items should have reordering state
				expect(container).toHaveClass('pointer-events-none', 'opacity-50');
			});
		});

		// STEP 5: Resolve promise
		controlledPromise.resolve();

		// STEP 6: Reordering state should clear
		await waitFor(() => {
			const allLeftItems = within(leftPanel).getAllByText(/Project (Alpha|Beta)/);
			allLeftItems.forEach(item => {
				const container = item.closest('[class*="flex"]');
				expect(container).not.toHaveClass('pointer-events-none');
			});
		});
	});

	it('ROLLBACK: should revert optimistic state on API error', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(controlledPromise.promise);

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

		const leftPanel = screen.getByText('Pinned Projects').parentElement!;
		const rightPanel = screen.getByText('Available Projects').parentElement!;

		// STEP 1: Pin Project Gamma
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 2: Verify optimistic state
		await waitFor(() => {
			expect(within(leftPanel).getByText('Project Gamma')).toBeInTheDocument();
		});
		expect(within(rightPanel).queryByText('Project Gamma')).not.toBeInTheDocument();

		// STEP 3: Reject the promise (API error)
		controlledPromise.reject(new Error('Network error'));

		// STEP 4: Item should ROLLBACK to right panel
		await waitFor(() => {
			expect(within(rightPanel).getByText('Project Gamma')).toBeInTheDocument();
		});
		expect(within(leftPanel).queryByText('Project Gamma')).not.toBeInTheDocument();
	});
});
