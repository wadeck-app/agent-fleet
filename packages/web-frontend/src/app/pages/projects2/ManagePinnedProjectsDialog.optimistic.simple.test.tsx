import { useState } from 'react';

import type { Project } from '@shared/api/projects.contract';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * ===========================================================================================
 * SIMPLE OPTIMISTIC UPDATE TEST - Demonstrates the Problem
 * ===========================================================================================
 *
 * This test demonstrates that ManagePinnedProjectsDialog does NOT implement optimistic updates.
 * The issue: items only move AFTER the API call completes, not immediately.
 *
 * Expected behavior (optimistic):
 * 1. User clicks "pin" on Project Gamma
 * 2. Project Gamma IMMEDIATELY appears in pinnedProjects (optimistic)
 * 3. Loading spinner shows on Project Gamma
 * 4. API call completes
 * 5. Server confirms state (or rollback on error)
 *
 * Current behavior (non-optimistic):
 * 1. User clicks "pin" on Project Gamma
 * 2. Loading spinner shows on Project Gamma IN ITS CURRENT POSITION
 * 3. API call completes
 * 4. Props update
 * 5. Project Gamma suddenly jumps to pinnedProjects (jarring UX)
 *
 * ===========================================================================================
 */

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

// Simulate the logic inside ManagePinnedProjectsDialog (CURRENT implementation)
function useManagePinnedProjectsNonOptimistic(projects: Project[], onPin: (id: string) => Promise<void>) {
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

	const pinnedProjects = projects.filter(p => p.pinned);
	const availableProjects = projects.filter(p => !p.pinned);

	const handlePin = async (projectId: string) => {
		setLoadingItems(prev => new Set(prev).add(projectId));
		try {
			await onPin(projectId);
		} finally {
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		}
	};

	return {
		pinnedProjects,
		availableProjects,
		loadingItems,
		handlePin,
	};
}

// Simulate OPTIMISTIC implementation (EXPECTED behavior)
function useManagePinnedProjectsOptimistic(projects: Project[], onPin: (id: string) => Promise<void>) {
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [optimisticPins, setOptimisticPins] = useState<Set<string>>(new Set());
	const [optimisticUnpins, setOptimisticUnpins] = useState<Set<string>>(new Set());

	// Calculate effective pinned state (props + optimistic)
	const effectivePinnedIds = new Set(projects.filter(p => p.pinned).map(p => p.id));
	optimisticPins.forEach(id => effectivePinnedIds.add(id));
	optimisticUnpins.forEach(id => effectivePinnedIds.delete(id));

	// Build lists based on effective state
	const pinnedProjects = projects.filter(p => effectivePinnedIds.has(p.id));
	const availableProjects = projects.filter(p => !effectivePinnedIds.has(p.id));

	const handlePin = async (projectId: string) => {
		// OPTIMISTIC: Add to pinned immediately
		setOptimisticPins(prev => new Set(prev).add(projectId));
		setOptimisticUnpins(prev => {
			const next = new Set(prev);
			next.delete(projectId);
			return next;
		});
		setLoadingItems(prev => new Set(prev).add(projectId));

		try {
			await onPin(projectId);
			// Success: keep optimistic state until props sync
		} catch (error) {
			// Rollback on error
			setOptimisticPins(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		} finally {
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		}
	};

	return {
		pinnedProjects,
		availableProjects,
		loadingItems,
		handlePin,
	};
}

describe('ManagePinnedProjectsDialog - Optimistic vs Non-Optimistic', () => {
	it('CURRENT IMPLEMENTATION: item does NOT move until API completes', async () => {
		let resolvePin: () => void = () => {};
		const mockPin = () =>
			new Promise<void>(resolve => {
				resolvePin = resolve;
			});

		const { result } = renderHook(() => useManagePinnedProjectsNonOptimistic(mockProjects, mockPin));

		// Initial state
		expect(result.current.pinnedProjects).toHaveLength(1); // Only Project Alpha
		expect(result.current.availableProjects).toHaveLength(1); // Only Project Gamma

		// User clicks pin on Project Gamma
		act(() => {
			result.current.handlePin('project-2');
		});

		// ❌ PROBLEM: Item has NOT moved yet (still in availableProjects)
		expect(result.current.pinnedProjects).toHaveLength(1); // Still only Project Alpha
		expect(result.current.availableProjects).toHaveLength(1); // Still Project Gamma
		expect(result.current.loadingItems.has('project-2')).toBe(true); // Only loading state changed

		// API completes
		act(() => {
			resolvePin();
		});

		// Item STILL hasn't moved (waiting for props to update)
		expect(result.current.pinnedProjects).toHaveLength(1);
		expect(result.current.availableProjects).toHaveLength(1);
	});

	it('EXPECTED IMPLEMENTATION: item moves IMMEDIATELY before API completes', async () => {
		let resolvePin: () => void = () => {};
		const mockPin = () =>
			new Promise<void>(resolve => {
				resolvePin = resolve;
			});

		const { result } = renderHook(() => useManagePinnedProjectsOptimistic(mockProjects, mockPin));

		// Initial state
		expect(result.current.pinnedProjects).toHaveLength(1); // Only Project Alpha
		expect(result.current.availableProjects).toHaveLength(1); // Only Project Gamma

		// User clicks pin on Project Gamma
		await act(async () => {
			result.current.handlePin('project-2');
			// Allow microtasks to process
			await Promise.resolve();
		});

		// ✅ CORRECT: Item has moved IMMEDIATELY (optimistic)
		expect(result.current.pinnedProjects).toHaveLength(2); // Alpha + Gamma (optimistic)
		expect(result.current.availableProjects).toHaveLength(0); // Empty
		expect(result.current.loadingItems.has('project-2')).toBe(true); // Loading state active

		// Verify Project Gamma is in pinnedProjects
		expect(result.current.pinnedProjects.find(p => p.id === 'project-2')).toBeDefined();
		expect(result.current.availableProjects.find(p => p.id === 'project-2')).toBeUndefined();

		// API completes
		await act(async () => {
			resolvePin();
			await Promise.resolve();
		});

		// Item still in pinnedProjects (confirmed by API)
		expect(result.current.pinnedProjects).toHaveLength(2);
		expect(result.current.loadingItems.has('project-2')).toBe(false); // Loading cleared
	});

	it('EXPECTED IMPLEMENTATION: rollback on API error', async () => {
		let rejectPin: (error: Error) => void = () => {};
		const mockPin = () =>
			new Promise<void>((_resolve, reject) => {
				rejectPin = reject;
			});

		const { result } = renderHook(() => useManagePinnedProjectsOptimistic(mockProjects, mockPin));

		// Initial state
		expect(result.current.availableProjects).toHaveLength(1); // Project Gamma

		// User clicks pin on Project Gamma
		await act(async () => {
			result.current.handlePin('project-2');
			await Promise.resolve();
		});

		// Item moved optimistically
		expect(result.current.pinnedProjects).toHaveLength(2);
		expect(result.current.availableProjects).toHaveLength(0);

		// API fails
		await act(async () => {
			rejectPin(new Error('Network error'));
			await Promise.resolve();
		});

		// ✅ ROLLBACK: Item back in availableProjects
		expect(result.current.pinnedProjects).toHaveLength(1); // Only Alpha
		expect(result.current.availableProjects).toHaveLength(1); // Gamma back
		expect(result.current.availableProjects.find(p => p.id === 'project-2')).toBeDefined();
	});
});
