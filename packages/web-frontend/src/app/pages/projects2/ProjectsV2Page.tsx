import { useEffect, useState } from 'react';

import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Page } from '@framework/components/layout/Page';
import { SkeletonBox } from '@framework/components/loading/SkeletonBox';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import {
	B2F_PROJECT_CREATED,
	B2F_PROJECT_DELETED,
	B2F_PROJECT_UPDATED,
	B2F_WORKSPACE_UPDATED,
} from '@shared/transport/B2FEventConstants';
import { Settings } from 'lucide-react';

import { ProjectEmptyState } from '@/app/components/domain/ProjectEmptyState';
import { WorkspaceEmptyState } from '@/app/components/domain/WorkspaceEmptyState';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { useProjectWorkspaces } from '@app/hooks/useProjectWorkspaces';
import { useProjects } from '@app/hooks/useProjects';
import { useProjectsV2State } from '@app/hooks/useProjectsV2State';

import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';
import { ManageProjectWorkspacesDialog } from './ManageProjectWorkspacesDialog';
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
	const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
	const [isManageWorkspacesDialogOpen, setIsManageWorkspacesDialogOpen] = useState(false);

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

	// Active state management (URL persistence + auto-selection)
	const { state, setActiveProject, setActiveWorkspace, setActiveView } = useProjectsV2State({
		pinnedProjects,
	});

	const activeProject = projects.find(p => p.id === state.activeProjectId);
	const projectWorkspaces = getProjectWorkspaces(activeProject);

	// Auto-select first workspace when project changes and has workspaces
	useEffect(() => {
		console.log('[ProjectsV2Page] Auto-select effect', {
			activeProjectId: activeProject?.id,
			projectWorkspacesLength: projectWorkspaces.length,
			activeWorkspaceId: state.activeWorkspaceId,
			willAutoSelect: activeProject && projectWorkspaces.length > 0 && !state.activeWorkspaceId,
		});

		if (activeProject && projectWorkspaces.length > 0 && !state.activeWorkspaceId) {
			console.log('[ProjectsV2Page] AUTO-SELECTING first workspace:', projectWorkspaces[0].id);
			setActiveWorkspace(projectWorkspaces[0].id);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeProject?.id, projectWorkspaces.length, state.activeWorkspaceId]);

	// Subscribe to real-time updates
	useRealtimeRefresh({
		events: [B2F_PROJECT_CREATED, B2F_PROJECT_UPDATED, B2F_PROJECT_DELETED, B2F_WORKSPACE_UPDATED],
		onEvent: () => {
			loadProjects();
			loadWorkspaces();
		},
		logPrefix: 'ProjectsV2Page',
	});

	// Handlers - now just thin wrappers around hook functions
	const handleProjectSelect = async (projectId: string) => {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;

		if (project.pinned) {
			setActiveProject(projectId);
		} else {
			await pinProject(projectId, project.version);
			setActiveProject(projectId);
		}
	};

	const handleProjectRemove = async (projectId: string) => {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;

		await unpinProject(projectId, project.version);

		// Update active project if removing the current one
		const remainingPinned = pinnedProjects.filter(p => p.id !== projectId);
		if (state.activeProjectId === projectId && remainingPinned.length > 0) {
			setActiveProject(remainingPinned[0].id);
		}
	};

	const handleProjectTabClick = (projectId: string) => {
		setActiveProject(projectId);
	};

	const handleWorkspaceAssociate = async (workspaceId: string) => {
		if (!activeProject) return;
		await associateWorkspace(workspaceId, activeProject.id);
	};

	const handleWorkspaceDissociate = async (workspaceId: string) => {
		await dissociateWorkspace(workspaceId);
	};

	const handleWorkspaceReorder = async (activeId: string, overId: string) => {
		if (!activeProject) return;
		await reorderWorkspaces(activeProject.id, activeId, overId, activeProject.version);
	};

	const activeWorkspace = projectWorkspaces.find(w => w.id === state.activeWorkspaceId);
	const loading = projectsLoading || workspacesLoading;

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
					<ProjectEmptyState onManageClick={() => setIsManageDialogOpen(true)} />
				) : (
					<div className="flex h-full flex-col">
						{/* Project Tabs with Title and Actions */}
						<div className="border-b border-border bg-card">
							<div className="flex items-center justify-between px-4">
								<div className="flex items-center gap-4 overflow-x-auto py-2">
									<span className="text-sm font-medium text-muted-foreground">Projects v2</span>
									<div className="flex items-center gap-1">
										{pinnedProjects.map(project => {
											const projectWorkspaceCount = workspaces.filter(w =>
												project.workspaceIds.includes(w.id)
											).length;

											return (
												<TabButton
													key={project.id}
													active={state.activeProjectId === project.id}
													onClick={() => handleProjectTabClick(project.id)}
													icon={
														project.icon && (
															<DynamicLucideIcon
																name={project.icon}
																color={project.iconColor || '#6366F1'}
																className="h-4 w-4"
															/>
														)
													}
													badge={
														<Badge variant="secondary" className="text-xs">
															{projectWorkspaceCount}
														</Badge>
													}
												>
													<span className="text-sm font-medium">{project.name}</span>
												</TabButton>
											);
										})}
									</div>
								</div>
								<Button variant="default" size="sm" onClick={() => setIsManageDialogOpen(true)}>
									<Settings />
									Manage Projects
								</Button>
							</div>
						</div>

						{/* Workspace Tabs and Content */}
						{activeProject && (
							<div className="flex flex-1 flex-col overflow-hidden">
								<WorkspaceTabs
									workspaces={projectWorkspaces}
									activeWorkspaceId={state.activeWorkspaceId}
									onWorkspaceSelect={setActiveWorkspace}
									onManageClick={() => setIsManageWorkspacesDialogOpen(true)}
								/>
								{activeWorkspace ? (
									<WorkspacePanel
										workspace={activeWorkspace}
										projectId={activeProject.id}
										activeView={state.activeView}
										onViewChange={setActiveView}
									/>
								) : (
									<WorkspaceEmptyState onManageClick={() => setIsManageWorkspacesDialogOpen(true)} />
								)}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Manage Pinned Projects Dialog */}
			<ManagePinnedProjectsDialog
				open={isManageDialogOpen}
				onOpenChange={setIsManageDialogOpen}
				projects={projects}
				pinnedProjects={pinnedProjects}
				onPin={handleProjectSelect}
				onUnpin={handleProjectRemove}
				onReorder={reorderProjects}
			/>

			{/* Manage Project Workspaces Dialog */}
			<ManageProjectWorkspacesDialog
				open={isManageWorkspacesDialogOpen}
				onOpenChange={setIsManageWorkspacesDialogOpen}
				project={activeProject}
				workspaces={workspaces}
				onAssociate={handleWorkspaceAssociate}
				onDissociate={handleWorkspaceDissociate}
				onReorder={handleWorkspaceReorder}
			/>
		</Page>
	);
}
