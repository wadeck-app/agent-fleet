import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { useAsyncData } from '@framework/hooks/useAsyncData';
import { X } from 'lucide-react';

import { projectsApi } from '../projects/projects.api';

export interface ProjectSelectProps {
	value?: string;
	onChange: (value: string | undefined) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
}

/**
 * ProjectSelect - Select a project from available projects
 *
 * Displays projects with their icon, color, and name.
 * Allows clearing the selection (setting to undefined).
 *
 * @example
 * ```tsx
 * <ProjectSelect
 *   value={projectId}
 *   onChange={setProjectId}
 *   placeholder="Select project..."
 * />
 * ```
 */
export function ProjectSelect({ value, onChange, placeholder = 'Select project...', disabled, id }: ProjectSelectProps) {
	const { data: projectsResponse, loading } = useAsyncData(
		() => projectsApi.getProjectsList({ page: 1, pageSize: 100 }),
		[]
	);

	const projects = projectsResponse?.items || [];

	// Find selected project to display
	const selectedProject = value ? projects.find(p => p.id === value) : undefined;

	// Helper to get icon name with fallback
	const getIconName = (iconName: string | undefined): string => iconName || 'FolderKanban';

	// Helper to get icon color with fallback
	const getIconColor = (color: string | undefined): string => color || '#6366F1';

	// Handle clear action
	const handleClear = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onChange(undefined);
	};

	return (
		<div className="relative">
			<Select
				value={value || 'none'}
				onValueChange={val => {
					if (val === 'none') {
						onChange(undefined);
					} else {
						onChange(val);
					}
				}}
				disabled={disabled || loading}
			>
				<SelectTrigger id={id} aria-label={placeholder} className="pr-8">
					<SelectValue placeholder={loading ? 'Loading projects...' : placeholder}>
						{loading && value ? (
							// Loading state when a project is selected but data is still loading
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<div className="h-4 w-4 animate-pulse rounded bg-muted" />
								<span className="truncate">Loading project...</span>
							</div>
						) : selectedProject ? (
							// Display selected project
							<div className="flex items-center gap-1.5">
								<DynamicLucideIcon
									name={getIconName(selectedProject.icon)}
									color={getIconColor(selectedProject.iconColor)}
									className="h-4 w-4"
								/>
								<span className="truncate">{selectedProject.name}</span>
							</div>
						) : loading ? (
							// Loading state when no project selected
							<span className="text-muted-foreground">Loading projects...</span>
						) : (
							// Placeholder when not loading and no selection
							placeholder
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{/* Clear option */}
					<SelectItem value="none" className="text-muted-foreground italic">
						No project
					</SelectItem>

					{/* Project options */}
					{projects.map(project => (
						<SelectItem key={project.id} value={project.id}>
							<div className="flex items-center gap-1.5">
								<DynamicLucideIcon
									name={getIconName(project.icon)}
									color={getIconColor(project.iconColor)}
									className="h-4 w-4"
								/>
								<span>{project.name}</span>
							</div>
						</SelectItem>
					))}

					{/* Empty state */}
					{projects.length === 0 && !loading && (
						<div className="px-2 py-1.5 text-sm text-muted-foreground">No projects available</div>
					)}
				</SelectContent>
			</Select>

			{/* Clear button (only show when value is set) */}
			{value && !disabled && (
				<button
					type="button"
					onClick={handleClear}
					className="absolute right-8 top-1/2 -translate-y-1/2 rounded-sm p-0.5 hover:bg-accent"
					aria-label="Clear selection"
				>
					<X className="h-3 w-3 text-muted-foreground" />
				</button>
			)}
		</div>
	);
}
