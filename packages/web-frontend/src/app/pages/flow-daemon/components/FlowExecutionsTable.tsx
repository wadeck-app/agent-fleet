import { Link } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import { Table, type TableColumn } from '@framework/components/table/Table';
import type { FlowExecutionSummary } from '@shared/api/flow-daemon.contract';

import { countPages, formatStepCounts, formatTimestamp } from '../flowDaemonFormat';
import { PAGE_SIZE_OPTIONS } from '../hooks/useFlowExecutionsFilters';
import { FlowExecutionStatusBadge } from './FlowExecutionStatusBadge';

export function getExecutionDetailPath(executionId: string): string {
	return `/flow/executions/${encodeURIComponent(executionId)}`;
}

const columns: TableColumn<FlowExecutionSummary>[] = [
	{
		key: 'flowId',
		label: 'Flow',
		render: execution => (
			<div className="flex flex-col">
				<Link
					to={getExecutionDetailPath(execution.executionId)}
					// The row itself is clickable: avoid navigating twice
					onClick={event => event.stopPropagation()}
					className="font-medium text-primary hover:underline"
				>
					{execution.flowId}
				</Link>
				<span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
					{execution.executionId}
				</span>
			</div>
		),
	},
	{
		key: 'status',
		label: 'Status',
		render: execution => <FlowExecutionStatusBadge status={execution.status} />,
	},
	{
		key: 'startedAt',
		label: 'Started',
		render: execution => <span className="text-sm">{formatTimestamp(execution.startedAt)}</span>,
	},
	{
		key: 'duration',
		label: 'Duration',
		render: execution => <span className="text-sm">{execution.duration}</span>,
	},
	{
		key: 'steps',
		label: 'Failed / steps',
		render: execution => (
			<span className={execution.failedStepCount > 0 ? 'text-sm font-medium text-destructive' : 'text-sm'}>
				{formatStepCounts(execution.failedStepCount, execution.stepCount)}
			</span>
		),
	},
	{
		key: 'lastError',
		label: 'Last error',
		render: execution =>
			execution.lastError === undefined || execution.lastError === '' ? (
				<span className="text-sm text-muted-foreground">-</span>
			) : (
				<div className="flex max-w-xs items-center gap-2">
					<span className="min-w-0 truncate text-sm text-destructive" title={execution.lastError}>
						{execution.lastError}
					</span>
					{execution.lastErrorRecovered && (
						<Badge
							variant="outline"
							className="shrink-0"
							title="This error happened earlier and a later attempt recovered from it"
						>
							recovered
						</Badge>
					)}
				</div>
			),
	},
];

export interface FlowExecutionsTableProps {
	items: FlowExecutionSummary[];
	total: number;
	/** Zero-based page. */
	page: number;
	limit: number;
	/** True while the first load is in flight (skeleton rows). */
	initialLoading: boolean;
	/** True while data is being reloaded (rows blurred). */
	refreshing: boolean;
	onPageChange: (page: number) => void;
	onLimitChange: (limit: number) => void;
	onOpenExecution: (executionId: string) => void;
}

export function FlowExecutionsTable({
	items,
	total,
	page,
	limit,
	initialLoading,
	refreshing,
	onPageChange,
	onLimitChange,
	onOpenExecution,
}: FlowExecutionsTableProps) {
	return (
		<Table
			data={items}
			columns={columns}
			getItemId={execution => execution.executionId}
			onRowClick={execution => onOpenExecution(execution.executionId)}
			emptyMessage="No executions match these filters."
			initialLoading={initialLoading}
			refreshing={refreshing}
			pagination={{
				// The table pager is one-based, the backend page is zero-based
				currentPage: page + 1,
				totalPages: countPages(total, limit),
				totalItems: total,
				onPageChange: oneBasedPage => onPageChange(oneBasedPage - 1),
				pageSize: limit,
				onPageSizeChange: onLimitChange,
				pageSizeOptions: PAGE_SIZE_OPTIONS,
			}}
		/>
	);
}
