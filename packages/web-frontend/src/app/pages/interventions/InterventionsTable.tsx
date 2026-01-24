import { Link, useNavigate } from 'react-router-dom';

import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { formatDateFull, formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Intervention } from '@shared/api/interventions.contract';
import { Eye, MessageSquare, MoreVertical, XCircle } from 'lucide-react';

import { getInterventionStatusVariant, getInterventionTypeVariant } from './interventions.helpers';

/**
 * InterventionsTable column definitions
 */
export const INTERVENTIONS_TABLE_COLUMNS: Table2Column<Intervention>[] = [
	{
		key: 'taskId',
		label: 'Task ID',
		render: (i: Intervention) => (
			<Link
				to={`/tasks/${i.taskId}/logs-stacked`}
				className={`
      font-mono text-xs text-primary
      hover:underline
    `}
				onClick={e => e.stopPropagation()}
			>
				{i.taskId.substring(0, 8)}
			</Link>
		),
		sortable: false,
	},
	{
		key: 'type',
		label: 'Type',
		render: (i: Intervention) => (
			<Badge variant={getInterventionTypeVariant(i.type)} className={`font-medium capitalize`}>
				{i.type}
			</Badge>
		),
	},
	{
		key: 'title',
		label: 'Title',
		render: (i: Intervention) => (
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-semibold">{i.config.title}</span>
				{i.config.description && (
					<span className="line-clamp-1 text-xs text-muted-foreground">{i.config.description}</span>
				)}
			</div>
		),
		sortable: false,
	},
	{
		key: 'status',
		label: 'Status',
		render: (i: Intervention) => (
			<Badge variant={getInterventionStatusVariant(i.status)} className={`font-medium`}>
				{i.status}
			</Badge>
		),
	},
	{
		key: 'blocking',
		label: 'Blocking',
		render: (i: Intervention) => (
			<Badge variant={i.blocking ? 'destructive' : 'secondary'} className={`font-medium`}>
				{i.blocking ? 'Yes' : 'No'}
			</Badge>
		),
	},
	{
		key: 'createdAt',
		label: 'Created',
		render: (i: Intervention) => (
			<span className="text-xs text-muted-foreground" title={formatDateFull(i.createdAt)}>
				{formatRelativeTime(i.createdAt)}
			</span>
		),
	},
];

export interface InterventionsTableProps extends Partial<Table2Props<Intervention>> {
	/** Optional cancel callback */
	onCancel?: (id: string) => void;
	/** Optional refreshing state - from Data2 */
	refreshing?: boolean;
	/** Optional cancelling state - for bulk cancel blur effect */
	cancelling?: boolean;
	/** IDs of items being cancelled - for strike-through effect */
	cancellingIds?: Set<string>;
	/** Selection toggle callback */
	onSelectionToggle?: (id: string) => void;
	/** Select all callback */
	onSelectAll?: (ids: string[]) => void;
}

/**
 * Interventions table component using Table2
 */
export function InterventionsTable({
	onCancel,
	refreshing,
	cancelling,
	cancellingIds,
	onSelectionToggle,
	onSelectAll,
	...props
}: InterventionsTableProps) {
	const navigate = useNavigate();

	// Build actions column with dropdown menu
	const renderActions = (intervention: Intervention) => (
		<div className="flex items-center justify-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						size="sm"
						variant="ghost"
						onClick={e => e.stopPropagation()}
						aria-label={`Actions for intervention ${intervention.id}`}
					>
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => navigate(`/interventions/${intervention.id}`)}>
						<Eye className="mr-2 h-4 w-4" />
						View Details
					</DropdownMenuItem>
					{intervention.status === 'pending' && (
						<>
							<DropdownMenuItem onClick={() => navigate(`/interventions/${intervention.id}`)}>
								<MessageSquare className="mr-2 h-4 w-4" />
								Respond
							</DropdownMenuItem>
							{onCancel && (
								<DropdownMenuItem variant="destructive" onClick={() => onCancel(intervention.id)}>
									<XCircle className="mr-2 h-4 w-4" />
									Cancel
								</DropdownMenuItem>
							)}
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);

	// Handle row click - navigate to detail page
	const handleRowClick = (intervention: Intervention) => {
		navigate(`/interventions/${intervention.id}`);
	};

	return (
		<Table2
			columns={INTERVENTIONS_TABLE_COLUMNS}
			getItemId={(i: Intervention) => i.id}
			renderActions={renderActions}
			onRowClick={handleRowClick}
			emptyMessage="No interventions found. Interventions will appear here when agents need your input."
			data={props.data ?? []}
			isLoading={props.isLoading ?? false}
			error={props.error ?? null}
			pagination={props.pagination}
			sorting={props.sorting}
			features={props.features}
			refreshing={refreshing}
			deleting={cancelling}
			deletingIds={cancellingIds}
			onSelectionToggle={onSelectionToggle}
			onSelectAll={onSelectAll}
		/>
	);
}
