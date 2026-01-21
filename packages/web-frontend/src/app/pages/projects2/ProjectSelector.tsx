import { useMemo, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Popover, PopoverContent, PopoverTrigger } from '@framework/components/forms/Popover';
import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { Project } from '@shared/api/projects.contract';
import { Check, Plus, Search } from 'lucide-react';

interface ProjectSelectorProps {
	projects: Project[];
	selectedProjectIds: string[];
	onProjectSelect: (projectId: string) => void;
	disabled?: boolean;
}

export function ProjectSelector({ projects, selectedProjectIds, onProjectSelect, disabled }: ProjectSelectorProps) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const filteredProjects = useMemo(() => {
		if (!searchQuery) return projects;
		const query = searchQuery.toLowerCase();
		return projects.filter(
			project =>
				project.name.toLowerCase().includes(query) ||
				(project.description && project.description.toLowerCase().includes(query))
		);
	}, [projects, searchQuery]);

	const handleProjectSelect = (projectId: string) => {
		onProjectSelect(projectId);
		setSearchQuery('');
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="default" size="sm" disabled={disabled}>
					<Plus className="h-4 w-4" />
					Add Project
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-96 p-3" align="end">
				<div className="space-y-3">
					{/* Search input */}
					<div className="relative">
						<Search
							className={`
         absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2
         text-muted-foreground
       `}
						/>
						<Input
							type="text"
							placeholder="Search projects..."
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>

					{/* Project list */}
					<div className="max-h-96 overflow-y-auto">
						{filteredProjects.length > 0 ? (
							<div className="space-y-1">
								{filteredProjects.map(project => {
									const isSelected = selectedProjectIds.includes(project.id);

									return (
										<Button
											key={project.id}
											variant="ghost"
											onClick={() => handleProjectSelect(project.id)}
											className={cn(
												'w-full justify-start px-3 py-2',
												isSelected && 'bg-accent/50'
											)}
										>
											<div className="flex items-center gap-2">
												{project.icon && (
													<DynamicLucideIcon
														name={project.icon}
														color={project.iconColor || '#6366F1'}
														className="h-4 w-4 flex-shrink-0"
													/>
												)}
												<div className="flex-1 overflow-hidden">
													<div className="flex items-center gap-2">
														<span className="truncate text-sm font-medium">
															{project.name}
														</span>
														{isSelected && (
															<Check className="h-4 w-4 flex-shrink-0 text-primary" />
														)}
													</div>
													{project.description && (
														<p className="truncate text-xs text-muted-foreground">
															{project.description}
														</p>
													)}
												</div>
											</div>
										</Button>
									);
								})}
							</div>
						) : (
							<div className="py-6 text-center text-sm text-muted-foreground">
								{searchQuery ? `No projects matching "${searchQuery}"` : 'No projects available'}
							</div>
						)}
					</div>

					{/* Project count */}
					<div
						className={`
        border-t border-border pt-2 text-center text-xs text-muted-foreground
      `}
					>
						{filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
						{searchQuery && ` matching "${searchQuery}"`}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
