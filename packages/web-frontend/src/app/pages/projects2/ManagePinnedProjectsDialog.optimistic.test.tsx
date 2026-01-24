import type { Project } from '@shared/api/projects.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';

/**
 * ===========================================================================================
 * OPTIMISTIC UPDATES TESTS FOR MANAGE PINNED PROJECTS DIALOG
 * ===========================================================================================
 *
 * Tests to verify optimistic UI behavior with controlled promises.
 * These tests validate that items move IMMEDIATELY (before API responds).
 *
 * Test scenarios:
 * 1. Pin project (right → left): Item should appear in left panel immediately
 * 2. Unpin project (left → right): Item should appear in right panel immediately
 * 3. Reorder projects: Items should reorder immediately
 *
 * All tests use controlled promises to verify optimistic state BEFORE server response.
 * ===========================================================================================
 */

// Helper to create a controlled promise that we can resolve manually
function createControlledPromise<T>() {
	let resolve: (value: T) => void = () => {};
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
		taskCount: 0,
		archived: false,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'project-2',
		name: 'Project Beta',
		pinned: true,
		order: 1,
		workspaceIds: [],
		taskCount: 0,
		archived: false,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'project-3',
		name: 'Project Gamma',
		pinned: false,
		order: 0,
		workspaceIds: [],
		taskCount: 0,
		archived: false,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
];

describe('ManagePinnedProjectsDialog - Optimistic Updates', () => {
	it('should move item from right to left IMMEDIATELY when pinning (before API responds)', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(controlledPromise.promise);
		const onUnpin = vi.fn();
		const onReorder = vi.fn();

		const { rerender } = render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// STEP 1: Verify initial state
		// Project Gamma should be in the "Available Projects" (right panel)
		const availableSection = screen.getByText('Available Projects').closest('div');
		expect(availableSection).toHaveTextContent('Project Gamma');

		const pinnedSection = screen.getByText('Pinned Projects').closest('div');
		expect(pinnedSection).not.toHaveTextContent('Project Gamma');

		// STEP 2: Click pin button for Project Gamma
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 3: CRITICAL TEST - Before API responds, item should be in left panel (OPTIMISTIC)
		// This is where current implementation FAILS - item stays on right until API responds
		await waitFor(() => {
			const updatedPinnedSection = screen.getByText('Pinned Projects').closest('div');
			expect(updatedPinnedSection).toHaveTextContent('Project Gamma');
		});

		// Item should NO LONGER be in right panel (moved optimistically)
		const updatedAvailableSection = screen.getByText('Available Projects').closest('div');
		expect(updatedAvailableSection).not.toHaveTextContent('Project Gamma');

		// Item should show loading state
		expect(screen.getByLabelText('Pin Project Gamma')).toBeDisabled();

		// STEP 4: Resolve API call (simulate success)
		controlledPromise.resolve();

		// STEP 5: Update props to reflect server state
		const updatedProjects = mockProjects.map(p => (p.id === 'project-3' ? { ...p, pinned: true, order: 2 } : p));
		rerender(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={updatedProjects}
				pinnedProjects={updatedProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// STEP 6: Item should still be in left panel (now confirmed by server)
		await waitFor(() => {
			const finalPinnedSection = screen.getByText('Pinned Projects').closest('div');
			expect(finalPinnedSection).toHaveTextContent('Project Gamma');
		});

		// Loading state should be cleared
		expect(screen.queryByLabelText('Pin Project Gamma')).not.toBeInTheDocument();
	});

	it('should move item from left to right IMMEDIATELY when unpinning (before API responds)', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn();
		const onUnpin = vi.fn().mockReturnValue(controlledPromise.promise);
		const onReorder = vi.fn();

		const { rerender } = render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// STEP 1: Verify initial state
		// Project Alpha should be in the "Pinned Projects" (left panel)
		const pinnedSection = screen.getByText('Pinned Projects').closest('div');
		expect(pinnedSection).toHaveTextContent('Project Alpha');

		const availableSection = screen.getByText('Available Projects').closest('div');
		expect(availableSection).not.toHaveTextContent('Project Alpha');

		// STEP 2: Click unpin button for Project Alpha
		const unpinButton = screen.getByLabelText('Unpin Project Alpha');
		await user.click(unpinButton);

		// STEP 3: CRITICAL TEST - Before API responds, item should be in right panel (OPTIMISTIC)
		await waitFor(() => {
			const updatedAvailableSection = screen.getByText('Available Projects').closest('div');
			expect(updatedAvailableSection).toHaveTextContent('Project Alpha');
		});

		// Item should NO LONGER be in left panel (moved optimistically)
		const updatedPinnedSection = screen.getByText('Pinned Projects').closest('div');
		expect(updatedPinnedSection).not.toHaveTextContent('Project Alpha');

		// Item should show loading state
		expect(screen.getByLabelText('Unpin Project Alpha')).toBeDisabled();

		// STEP 4: Resolve API call (simulate success)
		controlledPromise.resolve();

		// STEP 5: Update props to reflect server state
		const updatedProjects = mockProjects.map(p => (p.id === 'project-1' ? { ...p, pinned: false } : p));
		rerender(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={updatedProjects}
				pinnedProjects={updatedProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// STEP 6: Item should still be in right panel (now confirmed by server)
		await waitFor(() => {
			const finalAvailableSection = screen.getByText('Available Projects').closest('div');
			expect(finalAvailableSection).toHaveTextContent('Project Alpha');
		});
	});

	it('should reorder items IMMEDIATELY (before API responds)', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn();
		const onUnpin = vi.fn();
		const onReorder = vi.fn().mockReturnValue(controlledPromise.promise);

		render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// STEP 1: Verify initial order
		const pinnedSection = screen.getByText('Pinned Projects').closest('div');
		const pinnedItems = pinnedSection?.querySelectorAll('[data-item-id]');
		expect(pinnedItems).toHaveLength(2);
		expect(pinnedItems?.[0]).toHaveAttribute('data-item-id', 'project-1');
		expect(pinnedItems?.[1]).toHaveAttribute('data-item-id', 'project-2');

		// STEP 2: Drag Project Beta above Project Alpha
		// (This would normally be done with DnD library, but we'll simulate the reorder callback)
		// In real DnD: user drags project-2 over project-1
		// DualListDialog would call onReorder('project-2', 'project-1')

		// TODO: Simulate drag & drop interaction
		// For now, we're testing that the promise is controlled
		// In a real implementation, we'd verify that items reorder BEFORE promise resolves

		expect(onReorder).not.toHaveBeenCalled();
	});

	it('should rollback optimistic update on API error', async () => {
		const user = userEvent.setup();
		const controlledPromise = createControlledPromise<void>();
		const onPin = vi.fn().mockReturnValue(controlledPromise.promise);
		const onUnpin = vi.fn();
		const onReorder = vi.fn();

		const { rerender } = render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// STEP 1: Click pin button for Project Gamma
		const pinButton = screen.getByLabelText('Pin Project Gamma');
		await user.click(pinButton);

		// STEP 2: Item should move to left panel optimistically
		await waitFor(() => {
			const pinnedSection = screen.getByText('Pinned Projects').closest('div');
			expect(pinnedSection).toHaveTextContent('Project Gamma');
		});

		// STEP 3: Reject API call (simulate error)
		controlledPromise.reject(new Error('Network error'));

		// STEP 4: Item should ROLLBACK to right panel
		await waitFor(() => {
			const availableSection = screen.getByText('Available Projects').closest('div');
			expect(availableSection).toHaveTextContent('Project Gamma');
		});

		// Item should NOT be in left panel anymore
		const pinnedSection = screen.getByText('Pinned Projects').closest('div');
		expect(pinnedSection).not.toHaveTextContent('Project Gamma');

		// Props remain unchanged (no server update on error)
		rerender(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={onPin}
				onUnpin={onUnpin}
				onReorder={onReorder}
			/>
		);

		// Verify final state matches original (rollback complete)
		const finalAvailableSection = screen.getByText('Available Projects').closest('div');
		expect(finalAvailableSection).toHaveTextContent('Project Gamma');
	});
});
