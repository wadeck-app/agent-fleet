import { useEffect, useState } from 'react';

import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { B2F_PROJECT_CREATED, B2F_PROJECT_DELETED, B2F_PROJECT_UPDATED } from '@shared/transport/B2FEventConstants';
import { X } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { projectsApi } from '../projects/projects.api';
import { workspacesApi } from '../workspaces/workspaces.api';
import { ProjectSelector } from './ProjectSelector';
import { WorkspacePanel } from './WorkspacePanel';
import { WorkspaceTabs } from './WorkspaceTabs';

interface ProjectsV2State {
	selectedProjects: string[];
	activeProjectId: string | null;
	activeWorkspaceId: string | null;
}

const STORAGE_KEY = 'projects-v2-state';

function loadState(): ProjectsV2State {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error('Failed to load ProjectsV2 state:', error);
	}
	return {
		selectedProjects: [],
		activeProjectId: null,
		activeWorkspaceId: null,
	};
}

function saveState(state: ProjectsV2State): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (error) {
		console.error('Failed to save ProjectsV2 state:', error);
	}
}

export function ProjectsV2Page() {
	const [state, setState] = useState<ProjectsV2State>(loadState);
	const [projects, setProjects] = useState<Project[]>([]);
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [loading, setLoading] = useState(true);

	// Load projects
	const loadProjects = async () => {
		try {
			const response = await projectsApi.getProjectsList({});
			// Handle both response types: ProjectsListResponse (items) or ProjectsData (projects)
			const projectsList = 'items' in response ? response.items : (response as { projects: Project[] }).projects;
			setProjects(projectsList);
			setLoading(false);

			// Clean up state if projects were deleted
			setState(prev => {
				const validProjectIds = prev.selectedProjects.filter(id =>
					projectsList.some((p: Project) => p.id === id)
				);
				if (validProjectIds.length !== prev.selectedProjects.length) {
					const newState = {
						...prev,
						selectedProjects: validProjectIds,
						activeProjectId:
							prev.activeProjectId && validProjectIds.includes(prev.activeProjectId)
								? prev.activeProjectId
								: validProjectIds[0] || null,
					};
					saveState(newState);
					return newState;
				}
				return prev;
			});
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

	// Save state to localStorage whenever it changes
	useEffect(() => {
		saveState(state);
	}, [state]);

	const handleProjectSelect = (projectId: string) => {
		setState(prev => {
			if (prev.selectedProjects.includes(projectId)) {
				// Already selected, just activate it
				return { ...prev, activeProjectId: projectId, activeWorkspaceId: null };
			}
			// Add to selected projects and activate it
			return {
				selectedProjects: [...prev.selectedProjects, projectId],
				activeProjectId: projectId,
				activeWorkspaceId: null,
			};
		});
	};

	const handleProjectRemove = (projectId: string) => {
		setState(prev => {
			const newSelectedProjects = prev.selectedProjects.filter(id => id !== projectId);
			const newActiveProjectId =
				prev.activeProjectId === projectId ? newSelectedProjects[0] || null : prev.activeProjectId;

			return {
				selectedProjects: newSelectedProjects,
				activeProjectId: newActiveProjectId,
				activeWorkspaceId: newActiveProjectId === prev.activeProjectId ? prev.activeWorkspaceId : null,
			};
		});
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
					<ProjectSelector
						projects={projects}
						selectedProjectIds={state.selectedProjects}
						onProjectSelect={handleProjectSelect}
						disabled={loading}
					/>
				}
			/>

			<div className="flex-1 overflow-hidden -mx-6">
				{state.selectedProjects.length === 0 ? (
					// Empty state
					<div className="flex h-full items-center justify-center px-6">
						<div className="text-center">
							<div className="mb-4 text-4xl text-muted-foreground">📂</div>
							<h3 className="mb-2 text-lg font-semibold">No Projects Selected</h3>
							<p className="mb-4 text-sm text-muted-foreground">
								Select projects to view their workspaces and tasks
							</p>
							<ProjectSelector
								projects={projects}
								selectedProjectIds={state.selectedProjects}
								onProjectSelect={handleProjectSelect}
								disabled={loading}
							/>
						</div>
					</div>
				) : (
					<div className="flex h-full flex-col">
						{/* Project Tabs */}
						<div className="border-b border-border bg-card">
							<div className="flex items-center gap-1 overflow-x-auto px-4">
								{state.selectedProjects.map(projectId => {
									const project = projects.find(p => p.id === projectId);
									if (!project) return null;

									const projectWorkspaceCount = workspaces.filter(w =>
										project.workspaceIds.includes(w.id)
									).length;

									return (
										<button
											key={project.id}
											onClick={() => handleProjectTabClick(project.id)}
											className={`
												group relative flex items-center gap-2 border-b-2 px-4 py-3
												transition-colors hover:bg-accent/50
												${
													state.activeProjectId === project.id
														? 'border-primary bg-accent/30 text-foreground'
														: 'border-transparent text-muted-foreground hover:text-foreground'
												}
											`}
										>
											{project.icon && (
												<DynamicLucideIcon
													name={project.icon}
													color={project.iconColor || '#6366F1'}
													className="h-4 w-4"
												/>
											)}
											<span className="text-sm font-medium">{project.name}</span>
											<Badge variant="secondary" className="text-xs">
												{projectWorkspaceCount}
											</Badge>
											<button
												onClick={e => {
													e.stopPropagation();
													handleProjectRemove(project.id);
												}}
												className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-100"
												title="Remove from view"
											>
												<X className="h-3 w-3" />
											</button>
										</button>
									);
								})}
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
		</Page>
	);
}
