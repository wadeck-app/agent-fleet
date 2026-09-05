import { Link, useNavigate } from 'react-router-dom';

import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { formatDateShort } from '@framework/utils/formatting/DateFormat';
import type { Project } from '@shared/api/projects.contract';
import { Eye, MoreVertical, Pencil, Trash2 } from 'lucide-react';

export interface ProjectsTableProps extends Partial<Table2Props<Project>> {
	/** Optional edit callback */
	onEdit?: (project: Project) => void;
	/** Optional delete callback */
	onDelete?: (id: string) => void;
	/** Optional refreshing state - from Data2 */
	refreshing?: boolean;
	/** Optional deleting state - for bulk delete blur effect */
	deleting?: boolean;
	/** IDs of items being deleted - for strike-through effect */
	deletingIds?: Set<string>;
	/** Selection toggle callback */
	onSelectionToggle?: (id: string) => void;
	/** Select all callback */
	onSelectAll?: (ids: string[]) => void;
}

/**
 * Projects table column definitions
 */
export const PROJECTS_TABLE_COLUMNS: Table2Column<Project>[] = [
	{
		key: 'name',
		label: 'Name',
		render: (project: Project) => (
			<div className="flex items-center gap-2">
				{project.icon && (
					<DynamicLucideIcon
						name={project.icon}
						color={project.iconColor || '#6366F1'}
						className={`h-5 w-5`}
					/>
				)}
				<Link
					to={`/projects/${project.id}/board`}
					className={`
       font-medium text-primary
       hover:underline
     `}
					onClick={e => e.stopPropagation()}
				>
					{project.name}
				</Link>
			</div>
		),
	},
	{
		key: 'description',
		label: 'Description',
		render: (project: Project) => (
			<span className="text-sm text-muted-foreground" title={project.description}>
				{project.description ? (
					project.description.length > 60 ? (
						<>{project.description.slice(0, 60)}...</>
					) : (
						project.description
					)
				) : (
					<span className="italic">No description</span>
				)}
			</span>
		),
		sortable: false,
	},
	{
		key: 'workspaces',
		label: 'Workspaces',
		render: (project: Project) => (
			<Badge variant="secondary" className="font-medium">
				{project.workspaceIds.length}
			</Badge>
		),
		sortable: false,
	},
	{
		key: 'tasks',
		label: 'Tasks',
		render: (project: Project) => (
			<Badge variant="default" className="font-medium">
				{project.taskCount}
			</Badge>
		),
		sortable: false,
	},
	{
		key: 'createdAt',
		label: 'Created',
		render: (project: Project) => (
			<span className="text-xs text-muted-foreground" title={new Date(project.createdAt).toISOString().replace('T', ' ').slice(0, 19)}>
				{formatDateShort(project.createdAt)}
			</span>
		),
	},
];

/**
 * Projects table component using Table2
 */
export function ProjectsTable({
	onEdit,
	onDelete,
	refreshing,
	deleting,
	deletingIds,
	onSelectionToggle,
	onSelectAll,
	...props
}: ProjectsTableProps) {
	const navigate = useNavigate();

	// Build actions column if onEdit or onDelete is provided
	const renderActions =
		onEdit || onDelete
			? (project: Project) => (
					<div className="flex items-center justify-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="sm" variant="ghost" aria-label="Actions">
									<MoreVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{onEdit && (
									<DropdownMenuItem onClick={() => onEdit(project)}>
										<Pencil className="mr-2 h-4 w-4" />
										Edit
									</DropdownMenuItem>
								)}
								<DropdownMenuItem onClick={() => navigate(`/projects/${project.id}/board`)}>
									<Eye className="mr-2 h-4 w-4" />
									View Board
								</DropdownMenuItem>
								{onDelete && (
									<DropdownMenuItem
										onClick={() => onDelete(project.id)}
										className={`
            text-destructive
            focus:text-destructive
          `}
									>
										<Trash2 className="mr-2 h-4 w-4" />
										Delete
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)
			: undefined;

	return (
		<Table2
			columns={PROJECTS_TABLE_COLUMNS}
			getItemId={(project: Project) => project.id}
			renderActions={renderActions}
			emptyMessage="No projects found. Create your first project to get started."
			data={props.data ?? []}
			isLoading={props.isLoading ?? false}
			error={props.error ?? null}
			pagination={props.pagination}
			sorting={props.sorting}
			features={props.features}
			refreshing={refreshing}
			deleting={deleting}
			deletingIds={deletingIds}
			onSelectionToggle={onSelectionToggle}
			onSelectAll={onSelectAll}
		/>
	);
}
