import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import { TabGroup } from '@framework/components/primitives/TabGroup';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { Settings } from 'lucide-react';

interface ProjectTabsProps {
	projects: Project[];
	workspaces: Workspace[];
	activeProjectId: string | null;
	onProjectSelect: (projectId: string) => void;
	onManageClick?: () => void;
}

export function ProjectTabs({
	projects,
	workspaces,
	activeProjectId,
	onProjectSelect,
	onManageClick,
}: ProjectTabsProps) {
	return (
		<TooltipProvider delayDuration={300}>
			<TabGroup
				variant="card"
				title="Projects"
				emptyMessage="No projects configured yet"
				actions={
					onManageClick && (
						<Button variant="default" size="sm" onClick={onManageClick}>
							<Settings />
							Manage Projects
						</Button>
					)
				}
			>
				{projects.map(project => {
					const projectWorkspaceCount = workspaces.filter(w => project.workspaceIds.includes(w.id)).length;

					return (
						<TabButton
							key={project.id}
							active={activeProjectId === project.id}
							onClick={() => onProjectSelect(project.id)}
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
								<Tooltip>
									<TooltipTrigger asChild>
										<Badge variant="secondary" className="text-xs">
											{projectWorkspaceCount}
										</Badge>
									</TooltipTrigger>
									<TooltipContent>
										<p>Number of workspaces in this project</p>
									</TooltipContent>
								</Tooltip>
							}
						>
							<span className="text-sm font-medium">{project.name}</span>
						</TabButton>
					);
				})}
			</TabGroup>
		</TooltipProvider>
	);
}
