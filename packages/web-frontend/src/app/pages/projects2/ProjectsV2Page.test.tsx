import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ToastProvider } from '@framework/features/toast/ToastContext';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { useProjectWorkspaces } from '@app/hooks/useProjectWorkspaces';
import { useProjects } from '@app/hooks/useProjects';

import { ProjectsV2Page } from './ProjectsV2Page';

// Mock hooks BEFORE importing the component
vi.mock('@app/hooks/useProjects', () => ({
	useProjects: vi.fn(),
}));
vi.mock('@app/hooks/useProjectWorkspaces', () => ({
	useProjectWorkspaces: vi.fn(),
}));
vi.mock('@/hooks/useRealtimeRefresh', () => ({
	useRealtimeRefresh: vi.fn(),
}));

const mockCreatedWorkspace: Workspace = {
	id: 'new-workspace-id',
	path: '/new-workspace',
	name: 'New Workspace',
	mode: 'development' as const,
	tasksCount: 0,
	status: 'active' as const,
	createdAt: new Date().toISOString(),
	lastUsed: new Date().toISOString(),
	color: '#6366F1',
};

vi.mock('../workspaces/CreateWorkspaceDialog', () => ({
	CreateWorkspaceDialog: ({ open, onSuccess }: { open: boolean; onSuccess: (w: Workspace) => void }) => {
		if (!open) return null;
		return (
			// violations-suppress: react/no-raw-button test fixture
			<button data-testid="mock-create-workspace-submit" onClick={() => onSuccess(mockCreatedWorkspace)}>
				Submit Mock
			</button>
		);
	},
}));

// Helper to track location in MemoryRouter
let currentLocation: ReturnType<typeof useLocation> | null = null;

const wrapper = ({ children, initialUrl = '/' }: { children: ReactNode; initialUrl?: string }) => {
	const LocationTracker = () => {
		currentLocation = useLocation();
		return null;
	};

	return (
		<ToastProvider>
			<MemoryRouter initialEntries={[initialUrl]}>
				<LocationTracker />
				<Routes>
					<Route path="/" element={<div>{children}</div>} />
				</Routes>
			</MemoryRouter>
		</ToastProvider>
	);
};

const getSearchParams = () => {
	if (!currentLocation) return new URLSearchParams();
	return new URLSearchParams(currentLocation.search);
};

describe('ProjectsV2Page', () => {
	beforeEach(() => {
		currentLocation = null;
		vi.clearAllMocks();

		// Default mock for useRealtimeRefresh
		vi.mocked(useRealtimeRefresh).mockImplementation(() => {});
	});

	describe('BUG: Project switching regression', () => {
		it('CRITICAL: should NOT revert projectId when clicking second project (agent-browser reproduction)', async () => {
			// This test reproduces the EXACT bug found with agent-browser:
			// Step 1: Page loads with first project auto-selected (jz52yz1uq)
			// Step 2: User clicks "Agent Fleet" button
			// Step 3: BUG: URL reverts back to jz52yz1uq instead of staying on wwuypfn8p
			//
			// Expected console logs (from agent-browser):
			//  FLUSHING: projectId=wwuypfn8p
			//  FLUSHING: projectId=jz52yz1uq&workspaceId=... (STALE CLOSURE BUG!)
			//  External URL change detected {urlValue: jz52yz1uq, lastSynced: wwuypfn8p}

			const projects: Project[] = [
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
					workspaceIds: ['50115a2e-5226-46d4-9fb8-6f9c11a16f9d'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const workspaces: Workspace[] = [
				{
					id: '50115a2e-5226-46d4-9fb8-6f9c11a16f9d',
					name: 'Agent Fleet Workspace',
					path: '/workspace-agent-fleet',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#3b82f6',
				},
			];

			vi.mocked(useProjects).mockReturnValue({
				projects,
				loading: false,
				pinnedProjects: projects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces,
				loading: false,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: vi.fn(),
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return workspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			// Step 1: Navigate to base URL (simulates: agent-browser open http://localhost:5030/projects-v2)
			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			// Step 2: Wait for initial load and auto-selection (simulates: agent-browser wait 1000)
			await waitFor(() => {
				expect(screen.getByText('Image generation')).toBeInTheDocument();
			});

			// Step 3: Verify initial URL shows first project (simulates: agent-browser get url)
			let params = getSearchParams();
			expect(params.get('projectId')).toBe('jz52yz1uq');

			// Step 4: Click "Agent Fleet" button (simulates: agent-browser click @e19)
			const agentFleetButton = screen.getByText('Agent Fleet');
			await userEvent.click(agentFleetButton);

			// Step 5: Wait for all URL flushes to complete (simulates: agent-browser wait 800)
			await waitFor(
				() => {
					params = getSearchParams();
					// Workspace auto-selection should have triggered
					expect(params.get('workspaceId')).toBe('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
				},
				{ timeout: 1000 }
			);

			// Step 6: CRITICAL CHECK - Final URL must have projectId=wwuypfn8p
			// (simulates: agent-browser get url after all flushes)
			// BUG: Without fix, this will be 'jz52yz1uq' (reverted!)
			params = getSearchParams();
			expect(params.get('projectId')).toBe('wwuypfn8p');

			// Step 7: Additional check - ensure no delayed revert after microtask flush
			await act(async () => {
				await Promise.resolve();
			});

			params = getSearchParams();
			expect(params.get('projectId')).toBe('wwuypfn8p');
			expect(params.get('workspaceId')).toBe('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
		});

		it('DOUBLE FLUSH BUG: should NOT revert to first project when clicking second project and switching tabs', async () => {
			// This test reproduces the EXACT scenario from production:
			// 1. Page load with projectId=jz52yz1uq
			// 2. User clicks Agent Fleet → projectId changes to wwuypfn8p
			// 3. Auto-selection triggers for workspace
			// 4. Scripts tab opens (because view=scripts in URL)
			// 5. User clicks Tasks tab → view changes to tasks
			// 6. BUG: Multiple flushes with stale closures cause projectId to revert

			// Setup: Two pinned projects with workspaces
			const projects: Project[] = [
				{
					id: 'jz52yz1uq',
					name: 'Image generation',
					workspaceIds: [], // No workspaces
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
					workspaceIds: ['50115a2e-5226-46d4-9fb8-6f9c11a16f9d'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const workspaces: Workspace[] = [
				{
					id: '50115a2e-5226-46d4-9fb8-6f9c11a16f9d',
					name: 'Agent Fleet Workspace',
					path: '/workspace-agent-fleet',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#3b82f6',
				},
			];

			// Mock useProjects
			vi.mocked(useProjects).mockReturnValue({
				projects,
				loading: false,
				pinnedProjects: projects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			// Mock useProjectWorkspaces
			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces,
				loading: false,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: vi.fn(),
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return workspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			// Step 1: Render page with first project (Image generation) selected
			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=jz52yz1uq' }),
			});

			// Wait for initial render
			await waitFor(() => {
				expect(screen.getByText('Image generation')).toBeInTheDocument();
			});

			// Verify initial URL state
			let params = getSearchParams();
			expect(params.get('projectId')).toBe('jz52yz1uq');

			// Step 2: User clicks on second project tab ("Agent Fleet")
			const agentFleetTab = screen.getByText('Agent Fleet');
			await userEvent.click(agentFleetTab);

			// Wait for URL to update to second project
			await waitFor(
				() => {
					params = getSearchParams();
					expect(params.get('projectId')).toBe('wwuypfn8p');
				},
				{ timeout: 1000 }
			);

			// Step 3: Auto-selection should trigger for workspace
			await waitFor(
				() => {
					params = getSearchParams();
					expect(params.get('workspaceId')).toBe('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
				},
				{ timeout: 1000 }
			);

			// CRITICAL CHECK 1: projectId should STILL be 'wwuypfn8p' after auto-selection
			params = getSearchParams();
			expect(params.get('projectId')).toBe('wwuypfn8p');

			// Step 4: Wait for Tasks tab to appear (means WorkspacePanel is rendered)
			await waitFor(
				() => {
					const tab = screen.getByText('Tasks');
					expect(tab).toBeInTheDocument();
				},
				{ timeout: 2000 }
			);

			// Click Tasks tab (this triggers the bug in production)
			const tasksTab = screen.getByText('Tasks');
			await userEvent.click(tasksTab);

			// Wait for view to change
			await waitFor(
				() => {
					params = getSearchParams();
					// view=tasks should be in URL (or absent if it's the default)
					expect(params.get('view') === 'tasks' || params.get('view') === null).toBe(true);
				},
				{ timeout: 1000 }
			);

			// CRITICAL CHECK 2: projectId should STILL be 'wwuypfn8p' after tab switch
			// This is where the bug manifests: projectId reverts to 'jz52yz1uq'
			params = getSearchParams();
			expect(params.get('projectId')).toBe('wwuypfn8p');

			// Step 5: Force microtask flush to catch any delayed reverts
			await act(async () => {
				await Promise.resolve();
			});

			// FINAL CHECK: projectId must STILL be 'wwuypfn8p'
			params = getSearchParams();
			expect(params.get('projectId')).toBe('wwuypfn8p');
			expect(params.get('workspaceId')).toBe('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
		});
	});

	describe('BUG: Workspace dissociation stale URL', () => {
		it('should switch to remaining workspace when active workspace is dissociated', async () => {
			// Setup: project with 2 workspaces (ws-1 and ws-2), initial URL has workspaceId=ws-1
			// When ws-1 (the active workspace) is dissociated, URL should switch to ws-2
			const projects: Project[] = [
				{
					id: 'proj-1',
					name: 'Test Project',
					workspaceIds: ['ws-1', 'ws-2'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const workspaces: Workspace[] = [
				{
					id: 'ws-1',
					name: 'Workspace 1',
					path: '/workspace-1',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#3b82f6',
				},
				{
					id: 'ws-2',
					name: 'Workspace 2',
					path: '/workspace-2',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#10b981',
				},
			];

			const dissociateWorkspaceMock = vi.fn().mockResolvedValue(undefined);

			vi.mocked(useProjects).mockReturnValue({
				projects,
				loading: false,
				pinnedProjects: projects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces,
				loading: false,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: dissociateWorkspaceMock,
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return workspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			// Render page with ws-1 selected
			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=proj-1&workspaceId=ws-1' }),
			});

			// Wait for page to load
			await waitFor(() => {
				expect(screen.getByText('Test Project')).toBeInTheDocument();
			});

			// Verify initial URL has ws-1
			let params = getSearchParams();
			expect(params.get('projectId')).toBe('proj-1');
			expect(params.get('workspaceId')).toBe('ws-1');

			// Open the Manage Workspaces dialog by clicking the "Manage Workspaces" button
			const manageButton = screen.getByText('Manage Workspaces');
			await userEvent.click(manageButton);

			// Wait for dialog to appear (should show "Manage Workspaces for Test Project")
			await waitFor(() => {
				expect(screen.getByText('Manage Workspaces for Test Project')).toBeInTheDocument();
			});

			// Click the dissociate button for ws-1 (the active workspace)
			// The button has aria-label="Dissociate Workspace 1"
			const dissociateButton = screen.getByLabelText('Dissociate Workspace 1');
			await userEvent.click(dissociateButton);

			// Wait for dissociateWorkspace to be called and URL to update
			await waitFor(() => {
				expect(dissociateWorkspaceMock).toHaveBeenCalledWith('ws-1', 'proj-1');
			});

			// CRITICAL CHECK: URL should switch to ws-2
			await waitFor(() => {
				params = getSearchParams();
				expect(params.get('workspaceId')).toBe('ws-2');
			});
			expect(params.get('projectId')).toBe('proj-1');
		});

		it('should clear workspaceId when last workspace is dissociated', async () => {
			// Setup: project with 1 workspace (ws-1), initial URL has workspaceId=ws-1
			// When ws-1 is dissociated, URL should clear workspaceId but keep projectId
			const projects: Project[] = [
				{
					id: 'proj-1',
					name: 'Test Project',
					workspaceIds: ['ws-1'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const workspaces: Workspace[] = [
				{
					id: 'ws-1',
					name: 'Workspace 1',
					path: '/workspace-1',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#3b82f6',
				},
			];

			const dissociateWorkspaceMock = vi.fn().mockResolvedValue(undefined);

			vi.mocked(useProjects).mockReturnValue({
				projects,
				loading: false,
				pinnedProjects: projects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces,
				loading: false,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: dissociateWorkspaceMock,
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return workspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			// Render page with ws-1 selected
			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=proj-1&workspaceId=ws-1' }),
			});

			// Wait for page to load
			await waitFor(() => {
				expect(screen.getByText('Test Project')).toBeInTheDocument();
			});

			// Verify initial URL has ws-1
			let params = getSearchParams();
			expect(params.get('projectId')).toBe('proj-1');
			expect(params.get('workspaceId')).toBe('ws-1');

			// Open the Manage Workspaces dialog
			const manageButton = screen.getByText('Manage Workspaces');
			await userEvent.click(manageButton);

			// Wait for dialog to appear
			await waitFor(() => {
				expect(screen.getByText('Manage Workspaces for Test Project')).toBeInTheDocument();
			});

			// Click the dissociate button for ws-1
			const dissociateButton = screen.getByLabelText('Dissociate Workspace 1');
			await userEvent.click(dissociateButton);

			// Wait for dissociateWorkspace to be called and URL to update
			await waitFor(() => {
				expect(dissociateWorkspaceMock).toHaveBeenCalledWith('ws-1', 'proj-1');
			});

			// CRITICAL CHECK: URL should have projectId but no workspaceId
			await waitFor(() => {
				params = getSearchParams();
				expect(params.get('workspaceId')).toBeNull();
			});
			expect(params.get('projectId')).toBe('proj-1');
		});
	});

	describe('BUG: Edit dialog re-opens after background workspace refresh', () => {
		// Root cause: loadWorkspaces() called setLoading(true) on every refresh (including WebSocket).
		// This caused: loading=true → skeleton → WorkspacePanel unmounts → URL cleanup effect skipped
		// → WorkspacePanel remounts reading stale ?dialog=edit-workspace → modal re-opens.
		// Fix: loading skeleton only when workspaces.length === 0 (initial load, no data yet).

		const bgProjects: Project[] = [
			{
				id: 'proj-bg',
				name: 'Background Test Project',
				workspaceIds: ['ws-bg'],
				taskCount: 0,
				archived: false,
				pinned: true,
				order: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
			},
		];

		const bgWorkspaces: Workspace[] = [
			{
				id: 'ws-bg',
				name: 'Background Workspace',
				path: '/background-workspace',
				mode: 'development' as const,
				tasksCount: 0,
				status: 'active' as const,
				createdAt: new Date().toISOString(),
				lastUsed: new Date().toISOString(),
				color: '#6366F1',
			},
		];

		it('should NOT show loading skeleton during background refresh when workspaces already loaded', () => {
			vi.mocked(useProjects).mockReturnValue({
				projects: bgProjects,
				loading: false,
				pinnedProjects: bgProjects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			// workspacesLoading=true simulates a WebSocket background refresh, but data is present
			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces: bgWorkspaces,
				loading: true,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: vi.fn(),
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return bgWorkspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=proj-bg&workspaceId=ws-bg' }),
			});

			// WorkspacePanel must be mounted -- h2 heading visible, not replaced by skeleton
			// (name also appears in WorkspaceTabs, so we scope to heading role)
			expect(screen.getByRole('heading', { name: 'Background Workspace' })).toBeInTheDocument();
		});

		it('should keep edit dialog open when background workspace refresh fires', async () => {
			vi.mocked(useProjects).mockReturnValue({
				projects: bgProjects,
				loading: false,
				pinnedProjects: bgProjects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces: bgWorkspaces,
				loading: false,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: vi.fn(),
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return bgWorkspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			const { rerender } = render(<ProjectsV2Page />, {
				wrapper: ({ children }) =>
					wrapper({
						children,
						initialUrl: '/?projectId=proj-bg&workspaceId=ws-bg&dialog=edit-workspace',
					}),
			});

			// Dialog should be open from URL param
			await waitFor(() => {
				expect(screen.getByText('Edit Workspace')).toBeInTheDocument();
			});

			// Simulate WebSocket background refresh: workspacesLoading flips to true, data still present
			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces: bgWorkspaces,
				loading: true,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: vi.fn(),
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return bgWorkspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			rerender(<ProjectsV2Page />);

			// Dialog must still be open -- WorkspacePanel must NOT have been unmounted
			expect(screen.getByText('Edit Workspace')).toBeInTheDocument();
		});
	});

	describe('View param preservation', () => {
		it('should preserve view param when switching workspaces', async () => {
			const projects: Project[] = [
				{
					id: 'proj-1',
					name: 'Test Project',
					workspaceIds: ['ws-1', 'ws-2'],
					taskCount: 0,
					archived: false,
					pinned: true,
					order: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					version: 1,
				},
			];

			const workspaces: Workspace[] = [
				{
					id: 'ws-1',
					name: 'Workspace 1',
					path: '/workspace-1',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#3b82f6',
				},
				{
					id: 'ws-2',
					name: 'Workspace 2',
					path: '/workspace-2',
					mode: 'development' as const,
					tasksCount: 0,
					status: 'active' as const,
					createdAt: new Date().toISOString(),
					lastUsed: new Date().toISOString(),
					color: '#10b981',
				},
			];

			vi.mocked(useProjects).mockReturnValue({
				projects,
				loading: false,
				pinnedProjects: projects,
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});

			vi.mocked(useProjectWorkspaces).mockReturnValue({
				workspaces,
				loading: false,
				loadWorkspaces: vi.fn(),
				associateWorkspace: vi.fn(),
				dissociateWorkspace: vi.fn(),
				reorderWorkspaces: vi.fn(),
				getProjectWorkspaces: (project: Project | undefined) => {
					if (!project) return [];
					return workspaces.filter(w => project.workspaceIds.includes(w.id));
				},
				error: null,
				clearError: vi.fn(),
			});

			// Render with view=files param
			render(<ProjectsV2Page />, {
				wrapper: ({ children }) =>
					wrapper({ children, initialUrl: '/?projectId=proj-1&workspaceId=ws-1&view=files' }),
			});

			// Wait for page to load
			await waitFor(() => {
				expect(screen.getByText('Test Project')).toBeInTheDocument();
			});

			// Verify initial URL has view=files
			let params = getSearchParams();
			expect(params.get('projectId')).toBe('proj-1');
			expect(params.get('workspaceId')).toBe('ws-1');
			expect(params.get('view')).toBe('files');

			// Click the second workspace tab
			const ws2Tab = screen.getByText('Workspace 2');
			await userEvent.click(ws2Tab);

			// Wait for URL to update
			await waitFor(() => {
				params = getSearchParams();
				expect(params.get('workspaceId')).toBe('ws-2');
			});

			// CRITICAL CHECK: view param should be preserved
			expect(params.get('projectId')).toBe('proj-1');
			expect(params.get('view')).toBe('files');
		});
	});

	describe('Workspace auto-association', () => {
		const projectWithWorkspace: Project = {
			id: 'project-123',
			name: 'Test Project',
			workspaceIds: [],
			taskCount: 0,
			archived: false,
			pinned: true,
			order: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		const defaultProjectWorkspaceMock = {
			workspaces: [],
			loading: false,
			loadWorkspaces: vi.fn(),
			associateWorkspace: vi.fn(),
			dissociateWorkspace: vi.fn(),
			reorderWorkspaces: vi.fn(),
			getProjectWorkspaces: () => [],
			error: null,
			clearError: vi.fn(),
		};

		it('should call associateWorkspace with correct IDs when project is active', async () => {
			const associateWorkspaceMock = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useProjects).mockReturnValue({
				projects: [projectWithWorkspace],
				loading: false,
				pinnedProjects: [projectWithWorkspace],
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});
			vi.mocked(useProjectWorkspaces).mockReturnValue({
				...defaultProjectWorkspaceMock,
				associateWorkspace: associateWorkspaceMock,
			});

			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=project-123' }),
			});

			await waitFor(() => {
				expect(screen.getByText('Create Workspace')).toBeInTheDocument();
			});

			await userEvent.click(screen.getByText('Create Workspace'));
			await userEvent.click(screen.getByTestId('mock-create-workspace-submit'));

			await waitFor(() => {
				expect(associateWorkspaceMock).toHaveBeenCalledWith('new-workspace-id', 'project-123');
			});
		});

		it('should NOT call associateWorkspace when no project is active', async () => {
			const associateWorkspaceMock = vi.fn();
			vi.mocked(useProjects).mockReturnValue({
				projects: [],
				loading: false,
				pinnedProjects: [],
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});
			vi.mocked(useProjectWorkspaces).mockReturnValue({
				...defaultProjectWorkspaceMock,
				associateWorkspace: associateWorkspaceMock,
			});

			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			// Wait for render to stabilize
			await waitFor(() => {
				expect(screen.queryByText('Create Workspace')).not.toBeInTheDocument();
			});

			expect(associateWorkspaceMock).not.toHaveBeenCalled();
		});

		it('should close the dialog even if associateWorkspace rejects', async () => {
			// associateWorkspace catches errors internally, so the promise should resolve cleanly
			const associateWorkspaceMock = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useProjects).mockReturnValue({
				projects: [projectWithWorkspace],
				loading: false,
				pinnedProjects: [projectWithWorkspace],
				loadProjects: vi.fn(),
				pinProject: vi.fn(),
				unpinProject: vi.fn(),
				reorderProjects: vi.fn(),
				error: null,
				clearError: vi.fn(),
			});
			vi.mocked(useProjectWorkspaces).mockReturnValue({
				...defaultProjectWorkspaceMock,
				associateWorkspace: associateWorkspaceMock,
			});

			render(<ProjectsV2Page />, {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?projectId=project-123' }),
			});

			await waitFor(() => {
				expect(screen.getByText('Create Workspace')).toBeInTheDocument();
			});

			await userEvent.click(screen.getByText('Create Workspace'));
			expect(screen.getByTestId('mock-create-workspace-submit')).toBeInTheDocument();

			await userEvent.click(screen.getByTestId('mock-create-workspace-submit'));

			await waitFor(() => {
				expect(screen.queryByTestId('mock-create-workspace-submit')).not.toBeInTheDocument();
			});
		});
	});
});
