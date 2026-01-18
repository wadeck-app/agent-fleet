import { useEffect, useState } from 'react';

import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { SkeletonBox } from '@framework/components/loading/SkeletonBox';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { B2F_PROJECT_CREATED, B2F_PROJECT_DELETED, B2F_PROJECT_UPDATED } from '@shared/transport/B2FEventConstants';
import { Settings } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { projectsApi } from '../projects/projects.api';
import { workspacesApi } from '../workspaces/workspaces.api';
import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';
import { WorkspacePanel } from './WorkspacePanel';
import { WorkspaceTabs } from './WorkspaceTabs';

interface ProjectsV2State {
	activeProjectId: string | null;
	activeWorkspaceId: string | null;
}

const STORAGE_KEY = 'projects-v2-active-state';

// Load only active states from localStorage (not selected projects - those come from server)
function loadActiveState(): ProjectsV2State {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error('Failed to load ProjectsV2 active state:', error);
	}
	return {
		activeProjectId: null,
		activeWorkspaceId: null,
	};
}

function saveActiveState(state: ProjectsV2State): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (error) {
		console.error('Failed to save ProjectsV2 active state:', error);
	}
}

export function ProjectsV2Page() {
	const [state, setState] = useState<ProjectsV2State>(loadActiveState);
	const [projects, setProjects] = useState<Project[]>([]);
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [loading, setLoading] = useState(true);
	const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);

	// Load projects
	const loadProjects = async () => {
		try {
			const response = await projectsApi.getProjectsList({});
			// Handle both response types: ProjectsListResponse (items) or ProjectsData (projects)
			const projectsList = 'items' in response ? response.items : (response as { projects: Project[] }).projects;

			// Sort projects: pinned projects first, sorted by order
			const sortedProjects = [...projectsList].sort((a, b) => {
				if (a.pinned && !b.pinned) return -1;
				if (!a.pinned && b.pinned) return 1;
				if (a.pinned && b.pinned) return (a.order || 0) - (b.order || 0);
				return 0;
			});

			setProjects(sortedProjects);
			setLoading(false);

			// Auto-select first pinned project if no active project
			const pinnedProjects = sortedProjects.filter(p => p.pinned);
			if (pinnedProjects.length > 0 && !state.activeProjectId) {
				setState(prev => ({
					...prev,
					activeProjectId: pinnedProjects[0].id,
				}));
			}
		} catch (error) {
			console.error('Failed to load projects:', error);
			setLoading(false);
		}
	};

	// Load workspaces
	const loadWorkspaces = async () => {
		try {
			const response = await workspacesApi.getWorkspaces();
			setWorkspaces(response.workspaces);
		} catch (error) {
			console.error('Failed to load workspaces:', error);
		}
	};

	// Initial data load
	useEffect(() => {
		loadProjects();
		loadWorkspaces();
	}, []);

	// Subscribe to real-time project updates
	useRealtimeRefresh({
		events: [B2F_PROJECT_CREATED, B2F_PROJECT_UPDATED, B2F_PROJECT_DELETED],
		onEvent: loadProjects,
		logPrefix: 'ProjectsV2Page',
	});

	// Save active state to localStorage whenever it changes
	useEffect(() => {
		saveActiveState(state);
	}, [state]);

	// Pin a project (mark as pinned and set order)
	const handleProjectSelect = async (projectId: string) => {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;

		if (project.pinned) {
			// Already pinned, just activate it
			setState(prev => ({ ...prev, activeProjectId: projectId, activeWorkspaceId: null }));
		} else {
			// Pin the project
			const pinnedProjects = projects.filter(p => p.pinned);
			const maxOrder = pinnedProjects.length > 0 ? Math.max(...pinnedProjects.map(p => p.order || 0)) : -1;

			try {
				await projectsApi.updateProject(projectId, {
					pinned: true,
					order: maxOrder + 1,
					version: project.version,
				});
				// Project list will be refreshed via real-time event
				setState(prev => ({ ...prev, activeProjectId: projectId, activeWorkspaceId: null }));
			} catch (error) {
				console.error('Failed to pin project:', error);
			}
		}
	};

	// Unpin a project (mark as not pinned)
	const handleProjectRemove = async (projectId: string) => {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;

		try {
			await projectsApi.updateProject(projectId, {
				pinned: false,
				version: project.version,
			});

			// Update active project if removing the current one
			const pinnedProjects = projects.filter(p => p.pinned && p.id !== projectId);
			setState(prev => {
				const newActiveProjectId =
					prev.activeProjectId === projectId ? pinnedProjects[0]?.id || null : prev.activeProjectId;

				return {
					activeProjectId: newActiveProjectId,
					activeWorkspaceId: newActiveProjectId === prev.activeProjectId ? prev.activeWorkspaceId : null,
				};
			});
		} catch (error) {
			console.error('Failed to unpin project:', error);
		}
	};

	// Reorder pinned projects
	const handleReorder = async (activeId: string, overId: string) => {
		const pinnedProjectsList = projects.filter(p => p.pinned);
		const oldIndex = pinnedProjectsList.findIndex(p => p.id === activeId);
		const newIndex = pinnedProjectsList.findIndex(p => p.id === overId);

		if (oldIndex === -1 || newIndex === -1) {
			return;
		}

		// Reorder the array
		const reordered = [...pinnedProjectsList];
		const [moved] = reordered.splice(oldIndex, 1);
		reordered.splice(newIndex, 0, moved);

		// Optimistic update: Update local state immediately with new order
		const updatedProjects = projects.map(project => {
			const reorderedIndex = reordered.findIndex(p => p.id === project.id);
			if (reorderedIndex !== -1) {
				return { ...project, order: reorderedIndex };
			}
			return project;
		});

		// Sort the updated projects like loadProjects does
		const sortedProjects = [...updatedProjects].sort((a, b) => {
			if (a.pinned && !b.pinned) return -1;
			if (!a.pinned && b.pinned) return 1;
			if (a.pinned && b.pinned) return (a.order || 0) - (b.order || 0);
			return 0;
		});

		setProjects(sortedProjects);

		// Update order field for all affected projects
		const updates = reordered.map((project, index) => ({
			id: project.id,
			order: index,
			pinned: true,
			version: project.version,
		}));

		// Send updates to server
		try {
			await Promise.all(
				updates.map(update =>
					projectsApi.updateProject(update.id, {
						order: update.order,
						pinned: update.pinned,
						version: update.version,
					})
				)
			);
		} catch (error) {
			console.error('Failed to reorder projects:', error);
			// Revert on error by reloading
			loadProjects();
		}
	};

	const handleProjectTabClick = (projectId: string) => {
		setState(prev => ({
			...prev,
			activeProjectId: projectId,
			activeWorkspaceId: null,
		}));
	};

	const handleWorkspaceSelect = (workspaceId: string) => {
		setState(prev => ({
			...prev,
			activeWorkspaceId: workspaceId,
		}));
	};

	// Get pinned projects
	const pinnedProjects = projects.filter(p => p.pinned);

	// Get active project
	const activeProject = projects.find(p => p.id === state.activeProjectId);

	// Get workspaces for active project
	const projectWorkspaces =
		activeProject && activeProject.workspaceIds.length > 0
			? workspaces.filter(w => activeProject.workspaceIds.includes(w.id))
			: [];

	// Auto-select first workspace if project has workspaces and none selected
	useEffect(() => {
		if (activeProject && projectWorkspaces.length > 0 && !state.activeWorkspaceId) {
			setState(prev => ({
				...prev,
				activeWorkspaceId: projectWorkspaces[0].id,
			}));
		}
	}, [activeProject, projectWorkspaces, state.activeWorkspaceId]);

	const activeWorkspace = workspaces.find(w => w.id === state.activeWorkspaceId);

	return (
		<Page fullWidth className="flex h-screen flex-col">
			<PageHeader
				title="Projects v2"
				action={
					<Button variant="default" size="sm" onClick={() => setIsManageDialogOpen(true)}>
						<Settings />
						Manage Projects
					</Button>
				}
			/>

			<div className="flex-1 overflow-hidden -mx-6">
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
					// Empty state
					<div className="flex h-full items-center justify-center px-6">
						<div className="text-center">
							<div className="mb-4 text-4xl text-muted-foreground">📂</div>
							<h3 className="mb-2 text-lg font-semibold">No Projects Selected</h3>
							<p className="mb-4 text-sm text-muted-foreground">
								Select projects to view their workspaces and tasks
							</p>
							<Button onClick={() => setIsManageDialogOpen(true)}>
								<Settings className="mr-2 h-4 w-4" />
								Manage Projects
							</Button>
						</div>
					</div>
				) : (
					<div className="flex h-full flex-col">
						{/* Project Tabs */}
						<div className="border-b border-border bg-card">
							<div className="flex items-center px-4">
								<div className="flex items-center gap-1 overflow-x-auto py-2">
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
						</div>

						{/* Workspace Tabs and Content */}
						{activeProject && (
							<div className="flex flex-1 flex-col overflow-hidden">
								{projectWorkspaces.length > 0 ? (
									<>
										<WorkspaceTabs
											workspaces={projectWorkspaces}
											activeWorkspaceId={state.activeWorkspaceId}
											onWorkspaceSelect={handleWorkspaceSelect}
										/>
										{activeWorkspace && (
											<WorkspacePanel workspace={activeWorkspace} projectId={activeProject.id} />
										)}
									</>
								) : (
									<div className="flex h-full items-center justify-center px-6">
										<div className="text-center">
											<div className="mb-4 text-4xl text-muted-foreground">🔗</div>
											<h3 className="mb-2 text-lg font-semibold">No Workspaces Linked</h3>
											<p className="text-sm text-muted-foreground">
												This project has no workspaces associated with it
											</p>
										</div>
									</div>
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
				onReorder={handleReorder}
			/>
		</Page>
	);
}
