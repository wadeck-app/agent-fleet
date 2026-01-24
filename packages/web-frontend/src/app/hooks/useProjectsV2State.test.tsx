import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { Project } from '@shared/api/projects.contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectsV2State } from './useProjectsV2State';

// Helper to track location in MemoryRouter
let currentLocation: ReturnType<typeof useLocation> | null = null;

const wrapper = ({ children, initialUrl = '/' }: { children: ReactNode; initialUrl?: string }) => {
	const LocationTracker = () => {
		currentLocation = useLocation();
		return null;
	};

	return (
		<MemoryRouter initialEntries={[initialUrl]}>
			<LocationTracker />
			<Routes>
				<Route path="/" element={<div>{children}</div>} />
			</Routes>
		</MemoryRouter>
	);
};

const getSearchParams = () => {
	if (!currentLocation) return new URLSearchParams();
	return new URLSearchParams(currentLocation.search);
};

describe('useProjectsV2State', () => {
	beforeEach(() => {
		currentLocation = null;

		// Mock window.location.search
		Object.defineProperty(window, 'location', {
			value: {
				search: '',
			},
			writable: true,
		});
	});

	describe('BUG: Project switching regression', () => {
		it('DOUBLE FLUSH BUG: should NOT revert projectId when workspace auto-selection triggers', async () => {
			// This test reproduces the REAL production bug:
			// 1. User on project1 with workspace1
			// 2. User clicks project2
			// 3. setProjectId('project2') + setWorkspaceId(null) → queued for flush
			// 4. Microtask flushes → URL updates to projectId=project2 (workspace removed)
			// 5. searchParams changes → all hooks re-render
			// 6. Auto-selection effect sees project2 has workspaces → setWorkspaceId(workspace2)
			// 7. NEW flush triggered, but it reads OLD searchParams (closure) → reverts to project1!

			const pinnedProjects: Project[] = [
				{
					id: 'proj-1',
					name: 'Project 1',
					workspaceIds: ['ws-1'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				{
					id: 'proj-2',
					name: 'Project 2',
					workspaceIds: ['ws-2'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			// Start with project1 + workspace1 in URL
			const { result } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=proj-1&workspaceId=ws-1' }),
			});

			// Verify initial state
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-1');
				expect(result.current.state.activeWorkspaceId).toBe('ws-1');
			});

			// User clicks project 2
			act(() => {
				result.current.setActiveProject('proj-2');
			});

			// Wait for first flush to complete
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-2');
				expect(result.current.state.activeWorkspaceId).toBe(null);
			});

			// Simulate auto-selection effect (like in ProjectsV2Page)
			// This triggers AFTER the first flush, causing a second flush with stale searchParams
			act(() => {
				result.current.setActiveWorkspace('ws-2');
			});

			// CRITICAL BUG CHECK: projectId should STAY 'proj-2', NOT revert to 'proj-1'
			// The bug is that the second flush reads stale searchParams from closure
			await waitFor(
				() => {
					const params = getSearchParams();
					expect(params.get('projectId')).toBe('proj-2');
					expect(params.get('workspaceId')).toBe('ws-2');
				},
				{ timeout: 500 }
			);

			// Final state check
			expect(result.current.state.activeProjectId).toBe('proj-2');
			expect(result.current.state.activeWorkspaceId).toBe('ws-2');
		});

		it('RACE CONDITION: should NOT revert when workspaceId parent reset triggers simultaneous URL updates', async () => {
			// This test reproduces the REAL bug from production:
			// ROOT CAUSE: When projectId changes, two useUrlState hooks try to update URL simultaneously:
			//   1. projectId hook writes new projectId to URL
			//   2. workspaceId hook resets (parent changed) and writes to URL
			//   Both read from the same old searchParams, so workspaceId's update overwrites projectId's change!
			//
			// SCENARIO:
			// 1. User loads page with projectId=jz52yz1uq AND workspaceId=workspace-1 in URL
			// 2. pinnedProjects loads asynchronously (empty → 2 projects)
			// 3. User clicks on second project (wwuypfn8p)
			// 4. BUG: workspaceId resets → both hooks update URL → race condition → projectId reverts

			// Start with EMPTY pinnedProjects (simulates async loading)
			let pinnedProjects: Project[] = [];

			// START WITH BOTH projectId AND workspaceId in URL - this is key!
			const { result, rerender } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) =>
					wrapper({ children, initialUrl: '/?projectId=jz52yz1uq&workspaceId=workspace-1' }),
			});

			// Initial state from URL (first project + workspace)
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('jz52yz1uq');
				expect(result.current.state.activeWorkspaceId).toBe('workspace-1');
			});

			// Simulate pinnedProjects loading from backend
			pinnedProjects = [
				{
					id: 'jz52yz1uq',
					name: 'Image generation',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				{
					id: 'wwuypfn8p',
					name: 'Agent Fleet',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			rerender();

			// User clicks on "Agent Fleet" tab
			// This triggers:
			//   1. setProjectId('wwuypfn8p') → projectId useUrlState sync effect runs
			//   2. workspaceId sees parentValue changed → resets to null → workspaceId useUrlState sync effect runs
			//   3. RACE: Both effects read old searchParams and call setSearchParams → second call overwrites first!
			act(() => {
				result.current.setActiveProject('wwuypfn8p');
			});

			// Immediate check: projectId should be 'wwuypfn8p'
			expect(result.current.state.activeProjectId).toBe('wwuypfn8p');

			// Wait for all effects to settle
			await waitFor(
				() => {
					const params = getSearchParams();
					// After race condition, projectId may have reverted
					expect(params.get('projectId')).toBe('wwuypfn8p');
				},
				{ timeout: 1000 }
			);

			// CRITICAL BUG CHECK: ProjectId should STILL be 'wwuypfn8p', NOT reverted to 'jz52yz1uq'
			// This will FAIL if the race condition exists
			expect(result.current.state.activeProjectId).toBe('wwuypfn8p');

			// Verify URL has correct projectId
			const params = getSearchParams();
			expect(params.get('projectId')).toBe('wwuypfn8p');
			// workspaceId should be reset (expected behavior)
			expect(params.get('workspaceId')).toBe(null);
		});

		it('should NOT revert to first project after switching to second project', async () => {
			// Setup: Two pinned projects
			const pinnedProjects: Project[] = [
				{
					id: 'image-gen-id',
					name: 'Image generation',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				{
					id: 'agent-fleet-id',
					name: 'Agent Fleet',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			// Render hook - should auto-select first project
			const { result } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			// Wait for initial auto-selection
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('image-gen-id');
			});

			// Simulate user clicking on "Agent Fleet" tab
			act(() => {
				result.current.setActiveProject('agent-fleet-id');
			});

			// Verify projectId changed immediately
			expect(result.current.state.activeProjectId).toBe('agent-fleet-id');

			// Wait for URL to update
			await waitFor(() => {
				const params = getSearchParams();
				expect(params.get('projectId')).toBe('agent-fleet-id');
			});

			// CRITICAL: Verify no auto-reselection bug after state settles
			// Force a microtask flush to allow any pending effects to complete
			await act(async () => {
				await Promise.resolve();
			});

			// BUG CHECK: ProjectId should STILL be 'agent-fleet-id', NOT 'image-gen-id'
			expect(result.current.state.activeProjectId).toBe('agent-fleet-id');

			// Verify URL still has correct projectId
			const params = getSearchParams();
			expect(params.get('projectId')).toBe('agent-fleet-id');
		});

		it('should maintain project selection through multiple render cycles', async () => {
			const pinnedProjects: Project[] = [
				{
					id: 'proj-1',
					name: 'Project 1',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				{
					id: 'proj-2',
					name: 'Project 2',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const { result, rerender } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			// Auto-select first project
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-1');
			});

			// Switch to second project
			act(() => {
				result.current.setActiveProject('proj-2');
			});

			expect(result.current.state.activeProjectId).toBe('proj-2');

			// Force multiple rerenders (simulating React updates)
			rerender();
			rerender();
			rerender();

			// ProjectId should STILL be proj-2
			expect(result.current.state.activeProjectId).toBe('proj-2');
		});
	});

	describe('Auto-selection behavior', () => {
		it('should auto-select first pinned project on initial mount', async () => {
			const pinnedProjects: Project[] = [
				{
					id: 'proj-1',
					name: 'Project 1',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const { result } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-1');
			});
		});

		it('should NOT auto-select if projectId already in URL', async () => {
			const pinnedProjects: Project[] = [
				{
					id: 'proj-1',
					name: 'Project 1',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				{
					id: 'proj-2',
					name: 'Project 2',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			// Pre-populate URL with proj-2
			const { result } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=proj-2' }),
			});

			// Should read from URL, NOT auto-select first project
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-2');
			});

			// Verify URL still has proj-2
			const params = getSearchParams();
			expect(params.get('projectId')).toBe('proj-2');
		});
	});

	describe('Nested groups - workspace reset', () => {
		it.skip('should reset workspaceId when projectId changes', async () => {
			const pinnedProjects: Project[] = [
				{
					id: 'proj-1',
					name: 'Project 1',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				{
					id: 'proj-2',
					name: 'Project 2',
					workspaceIds: [],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const { result } = renderHook(() => useProjectsV2State({ pinnedProjects }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			// Wait for auto-selection
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-1');
			});

			// Manually set workspace
			act(() => {
				result.current.setActiveWorkspace('ws-1');
			});

			// Verify workspace is set
			await waitFor(() => {
				expect(result.current.state.activeWorkspaceId).toBe('ws-1');
			});

			// Change project
			act(() => {
				result.current.setActiveProject('proj-2');
			});

			// workspaceId should reset to null when project changes
			await waitFor(() => {
				expect(result.current.state.activeProjectId).toBe('proj-2');
				expect(result.current.state.activeWorkspaceId).toBe(null);
			});
		});
	});
});
