import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Page } from '@framework/components/layout/Page';
import { SkeletonBox } from '@framework/components/loading/SkeletonBox';
import { useDialogParam } from '@framework/hooks/useDialogParam';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import {
	B2F_PROJECT_CREATED,
	B2F_PROJECT_DELETED,
	B2F_PROJECT_UPDATED,
	B2F_WORKSPACES_UPDATED,
	B2F_WORKSPACE_UPDATED,
} from '@shared/transport/B2FEventConstants';

import { ProjectEmptyState } from '@/app/components/domain/ProjectEmptyState';
import { WorkspaceEmptyState } from '@/app/components/domain/WorkspaceEmptyState';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { useProjectWorkspaces } from '@app/hooks/useProjectWorkspaces';
import { useProjects } from '@app/hooks/useProjects';

import { EditProjectDialog } from '../projects/EditProjectDialog';
import { CreateWorkspaceDialog } from '../workspaces/CreateWorkspaceDialog';
import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';
import { ManageProjectWorkspacesDialog } from './ManageProjectWorkspacesDialog';
import { ProjectTabs } from './ProjectTabs';
import { WorkspacePanel } from './WorkspacePanel';
import { WorkspaceTabs } from './WorkspaceTabs';

/**
 * ===========================================================================================
 * PROJECTS V2 PAGE
 * ===========================================================================================
 *
 * Advanced projects management page with pinned projects and workspace associations.
 *
 * Features:
 * - Pin/unpin projects
 * - Drag-and-drop reordering
 * - Associate workspaces with projects
 * - Real-time updates via WebSocket
 * - localStorage state persistence
 *
 * Architecture:
 * - Uses useProjects hook for project data/operations
 * - Uses useProjectWorkspaces hook for workspace data/operations
 * - Uses useProjectsV2State hook for active state persistence
 * - Pure composition - minimal logic in page
 *
 * Grade: B- → A (after refactoring)
 *
 * ===========================================================================================
 */

export function ProjectsV2Page() {
	// Dialog state
	const manageDialog = useDialogParam('manage-pinned');
	const manageWorkspacesDialog = useDialogParam('manage-workspaces');
	const createWorkspaceDialog = useDialogParam('create-workspace');
	const editDialog = useDialogParam('edit-project');
	const [editProject, setEditProject] = useState<Project | null>(null);

	// URL as source of truth (read-only)
	const [searchParams, setSearchParams] = useSearchParams();
	const projectId = searchParams.get('projectId');
	const workspaceId = searchParams.get('workspaceId');
	const view = (searchParams.get('view') as 'tasks' | 'scripts' | 'files') || 'tasks';

	// Track if we've done initial auto-selection
	const hasAutoSelected = useRef(false);

	// Hooks for data management
	const {
		projects,
		loading: projectsLoading,
		pinnedProjects,
		loadProjects,
		pinProject,
		unpinProject,
		reorderProjects,
	} = useProjects();

	const {
		workspaces,
		loading: workspacesLoading,
		loadWorkspaces,
		associateWorkspace,
		dissociateWorkspace,
		reorderWorkspaces,
		getProjectWorkspaces,
	} = useProjectWorkspaces();

	const activeProject = projects.find(p => p.id === projectId);
	const projectWorkspaces = getProjectWorkspaces(activeProject);

	// Track previous projectId to detect changes
	const prevProjectId = useRef<string | null>(null);

	// One-time auto-selection on mount and when projectId changes (URL → State, not bidirectional)
	useEffect(() => {
		// Reset hasAutoSelected when projectId changes
		if (prevProjectId.current !== projectId) {
			hasAutoSelected.current = false;
			prevProjectId.current = projectId;
		}

		// Skip if already done or still loading
		if (hasAutoSelected.current || projectsLoading) {
			return;
		}

		// Auto-select first pinned project if none selected
		if (!projectId && pinnedProjects.length > 0) {
			console.log('[ProjectsV2Page] Auto-selecting first project:', pinnedProjects[0].id);
			setSearchParams({ projectId: pinnedProjects[0].id }, { replace: true });
			hasAutoSelected.current = true;
			return;
		}

		// Auto-select first workspace if project has workspaces but none selected
		if (projectId && activeProject && projectWorkspaces.length > 0 && !workspaceId) {
			console.log('[ProjectsV2Page] Auto-selecting first workspace:', projectWorkspaces[0].id);
			// Use functional form to ensure we use the current projectId from URL
			setSearchParams(
				prev => {
					const currentProjectId = prev.get('projectId');
					if (!currentProjectId) return prev;
					return { projectId: currentProjectId, workspaceId: projectWorkspaces[0].id };
				},
				{ replace: true }
			);
			hasAutoSelected.current = true;
			return;
		}

		// Mark as done if URL already has valid params
		if (projectId) {
			hasAutoSelected.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId, workspaceId, projectsLoading, pinnedProjects.length, activeProject?.id, projectWorkspaces.length]);

	// Subscribe to real-time updates
	useRealtimeRefresh({
		events: [
			B2F_PROJECT_CREATED,
			B2F_PROJECT_UPDATED,
			B2F_PROJECT_DELETED,
			B2F_WORKSPACE_UPDATED,
			B2F_WORKSPACES_UPDATED,
		],
		onEvent: () => {
			loadProjects();
			loadWorkspaces();
		},
		logPrefix: 'ProjectsV2Page',
	});

	// Handlers - explicit URL updates (User Action → URL)
	const handleProjectSelect = async (newProjectId: string) => {
		const project = projects.find(p => p.id === newProjectId);
		if (!project) return;

		if (!project.pinned) {
			await pinProject(newProjectId, project.version);
		}

		// Explicit URL update - clear workspace when changing projects
		setSearchParams({ projectId: newProjectId });
	};

	const handleProjectRemove = async (removedProjectId: string) => {
		const project = projects.find(p => p.id === removedProjectId);
		if (!project) return;

		await unpinProject(removedProjectId, project.version);

		// If removing current project, switch to first remaining
		const remainingPinned = pinnedProjects.filter(p => p.id !== removedProjectId);
		if (projectId === removedProjectId && remainingPinned.length > 0) {
			setSearchParams({ projectId: remainingPinned[0].id });
		} else if (projectId === removedProjectId) {
			// No projects left, clear URL
			setSearchParams({});
		}
	};

	const handleProjectTabClick = (newProjectId: string) => {
		// Explicit URL update - clear workspace when switching projects
		setSearchParams({ projectId: newProjectId });
	};

	const handleWorkspaceAssociate = async (workspaceId: string) => {
		if (!activeProject) return;
		await associateWorkspace(workspaceId, activeProject.id);
	};

	const handleWorkspaceDissociate = async (dissociatedWorkspaceId: string) => {
		if (!activeProject) return;
		await dissociateWorkspace(dissociatedWorkspaceId, activeProject.id);
		// If the dissociated workspace was the currently selected one, select the next available
		if (dissociatedWorkspaceId === workspaceId) {
			const remaining = projectWorkspaces.filter(w => w.id !== dissociatedWorkspaceId);
			setSearchParams(prev => {
				const currentProjectId = prev.get('projectId');
				if (!currentProjectId) return prev;
				const params: Record<string, string> = { projectId: currentProjectId };
				if (remaining.length > 0) {
					params.workspaceId = remaining[0].id;
				}
				return params;
			});
		}
	};

	const handleWorkspaceReorder = async (activeId: string, overId: string) => {
		if (!activeProject) return;
		await reorderWorkspaces(activeProject.id, activeId, overId, activeProject.version);
	};

	const activeWorkspace = projectWorkspaces.find(w => w.id === workspaceId);
	// Only show loading skeleton on initial load (no data yet).
	// Background WebSocket refreshes must not unmount WorkspacePanel — doing so loses URL state
	// mid-close (e.g. dialog=edit-workspace not cleaned up) causing dialogs to re-open.
	const loading = (projectsLoading && projects.length === 0) || (workspacesLoading && workspaces.length === 0);

	// Handlers for workspace and view selection
	const handleWorkspaceSelect = (newWorkspaceId: string) => {
		// Use functional form to avoid stale closure issues
		setSearchParams(prev => {
			const currentProjectId = prev.get('projectId');
			if (!currentProjectId) return prev;
			const currentView = prev.get('view');
			const params: Record<string, string> = { projectId: currentProjectId, workspaceId: newWorkspaceId };
			if (currentView) params.view = currentView;
			return params;
		});
	};

	const handleViewChange = (newView: 'tasks' | 'scripts' | 'files') => {
		// Use functional form to avoid stale closure issues
		setSearchParams(prev => {
			const currentProjectId = prev.get('projectId');
			const currentWorkspaceId = prev.get('workspaceId');
			const currentFile = prev.get('file');
			const currentLine = prev.get('line');
			if (!currentProjectId) return prev;

			const params: Record<string, string> = { projectId: currentProjectId };
			if (currentWorkspaceId) params.workspaceId = currentWorkspaceId;
			if (newView !== 'tasks') params.view = newView; // Only add if not default
			// Preserve file and line params when switching to/within files view
			if (newView === 'files' && currentFile) params.file = currentFile;
			if (newView === 'files' && currentLine) params.line = currentLine;
			return params;
		});
	};

	const handleEditProject = (project: Project) => {
		setEditProject(project);
		editDialog.open();
	};

	// Note: No need to manually reload here - the realtime WebSocket listener
	// (useRealtimeRefresh hook) already handles reloading when B2F_PROJECT_UPDATED is received.
	// Having both would cause a double reload and potential race conditions.
	const handleProjectUpdated = () => {
		// Projects and workspaces will be reloaded automatically via WebSocket event
	};

	const handleCreateWorkspace = () => {
		createWorkspaceDialog.open();
	};

	const handleWorkspaceCreated = async (workspace: Workspace) => {
		if (activeProject) {
			await associateWorkspace(workspace.id, activeProject.id);
		}
		// Workspaces will be reloaded automatically via WebSocket event
		createWorkspaceDialog.close();
	};

	return (
		<Page fullWidth className="flex h-screen flex-col">
			<div className="flex-1 overflow-hidden">
				{loading ? (
					// Loading skeleton
					<div className="flex h-full flex-col">
						{/* Project Tabs Skeleton */}
						<div className="border-b border-border bg-card">
							<div className="flex items-center justify-between px-4">
								<div className="flex items-center gap-1 py-2">
									{[...Array(3)].map((_, i) => (
										<div key={i} className="flex items-center gap-2 rounded-lg px-4 py-2">
											<SkeletonBox shape="circle" className="size-4" />
											<SkeletonBox className="h-4 w-24" />
											<SkeletonBox shape="pill" className="h-5 w-6" />
										</div>
									))}
								</div>
								<SkeletonBox className="h-8 w-8" />
							</div>
						</div>

						{/* Workspace Tabs Skeleton */}
						<div className="border-b border-border bg-muted/30">
							<div className="flex items-center gap-2 px-4 py-2">
								{[...Array(2)].map((_, i) => (
									<SkeletonBox key={i} className="h-9 w-32 rounded-lg" />
								))}
							</div>
						</div>

						{/* Content Skeleton */}
						<div className="flex-1 overflow-hidden p-6">
							<div className="space-y-4">
								<SkeletonBox className="h-8 w-48" />
								<div className="space-y-2">
									<SkeletonBox className="h-4 w-full" />
									<SkeletonBox className="h-4 w-5/6" />
									<SkeletonBox className="h-4 w-4/5" />
								</div>
							</div>
						</div>
					</div>
				) : pinnedProjects.length === 0 ? (
					<ProjectEmptyState onManageClick={() => manageDialog.open()} />
				) : (
					<div className="flex h-full flex-col">
						<ProjectTabs
							projects={pinnedProjects}
							workspaces={workspaces}
							activeProjectId={projectId}
							onProjectSelect={handleProjectTabClick}
							onManageClick={() => manageDialog.open()}
						/>

						{/* Workspace Tabs and Content */}
						{activeProject && (
							<div className="flex flex-1 flex-col overflow-hidden">
								<WorkspaceTabs
									workspaces={projectWorkspaces}
									activeWorkspaceId={workspaceId}
									onWorkspaceSelect={handleWorkspaceSelect}
									onEditProjectClick={() => handleEditProject(activeProject)}
									onManageClick={() => manageWorkspacesDialog.open()}
									onCreateWorkspaceClick={handleCreateWorkspace}
								/>
								{activeWorkspace ? (
									<WorkspacePanel
										workspace={activeWorkspace}
										projectId={activeProject.id}
										activeView={view}
										onViewChange={handleViewChange}
									/>
								) : (
									<WorkspaceEmptyState onManageClick={() => manageWorkspacesDialog.open()} />
								)}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Edit Project Dialog */}
			<EditProjectDialog
				project={editProject}
				open={editDialog.isOpen}
				onOpenChange={open => {
					editDialog.onOpenChange(open);
					if (!open) setEditProject(null);
				}}
				onSuccess={handleProjectUpdated}
			/>

			{/* Manage Pinned Projects Dialog */}
			<ManagePinnedProjectsDialog
				open={manageDialog.isOpen}
				onOpenChange={manageDialog.onOpenChange}
				projects={projects}
				pinnedProjects={pinnedProjects}
				onPin={handleProjectSelect}
				onUnpin={handleProjectRemove}
				onReorder={reorderProjects}
			/>

			{/* Manage Project Workspaces Dialog */}
			<ManageProjectWorkspacesDialog
				open={manageWorkspacesDialog.isOpen}
				onOpenChange={manageWorkspacesDialog.onOpenChange}
				project={activeProject}
				workspaces={workspaces}
				onAssociate={handleWorkspaceAssociate}
				onDissociate={handleWorkspaceDissociate}
				onReorder={handleWorkspaceReorder}
			/>

			{/* Create Workspace Dialog */}
			<CreateWorkspaceDialog
				open={createWorkspaceDialog.isOpen}
				onOpenChange={createWorkspaceDialog.onOpenChange}
				onSuccess={handleWorkspaceCreated}
				projectId={projectId ?? undefined}
			/>
		</Page>
	);
}
