import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Table, type TableColumn } from '@framework/components/table/Table';
import type { FlowExecutionDetail } from '@shared/api/flow-daemon.contract';

import { formatCostWithLabel, formatStepRunner, formatTimestamp, shortenId } from '../flowDaemonFormat';
import { FlowExecutionStatusBadge } from './FlowExecutionStatusBadge';
import { StepAttemptHistory } from './StepAttemptHistory';

type FlowStep = FlowExecutionDetail['steps'][number];

// Narrow columns: tighter horizontal padding (important modifier beats the shared cell px-4) and no wrapping
const COMPACT_COLUMN_CLASS = 'px-2! whitespace-nowrap';

const columns: TableColumn<FlowStep>[] = [
	{
		key: 'stepId',
		label: 'Step',
		render: step => (
			<div className="flex max-w-xl flex-col gap-1">
				<span className="flex items-center gap-2 text-sm font-medium">
					{step.stepId}
					{step.injected && (
						<Badge variant="outline" title="Step added at runtime, not declared in the flow file">
							injected
						</Badge>
					)}
				</span>
				{step.error !== undefined && step.error !== '' && (
					<p
						role="alert"
						className={`
        rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs
        break-words whitespace-pre-wrap text-destructive
      `}
					>
						{step.error}
					</p>
				)}
			</div>
		),
	},
	{
		key: 'status',
		label: 'Status',
		className: COMPACT_COLUMN_CLASS,
		render: step => <FlowExecutionStatusBadge status={step.status} />,
	},
	{
		key: 'duration',
		label: 'Duration',
		className: COMPACT_COLUMN_CLASS,
		render: step => <span className="text-sm">{step.duration}</span>,
	},
	{
		key: 'attempts',
		label: 'Attempts',
		className: COMPACT_COLUMN_CLASS,
		render: step => <span className="text-sm">{step.attempts ?? '-'}</span>,
	},
	{
		key: 'model',
		label: 'Model',
		className: COMPACT_COLUMN_CLASS,
		render: step => (
			// Long provider/model names are truncated; the full name stays in the tooltip
			<span className="block max-w-32 truncate text-sm" title={step.model}>
				{step.model ?? '-'}
			</span>
		),
	},
	{
		key: 'costUsd',
		label: 'Cost',
		className: COMPACT_COLUMN_CLASS,
		render: step => (
			<div className="flex flex-col gap-1">
				<span className="text-sm">{formatCostWithLabel(step.costLabel, step.costUsd)}</span>
				{step.attemptHistory !== undefined && step.attemptHistory.length >= 2 && (
					<StepAttemptHistory attempts={step.attemptHistory} />
				)}
			</div>
		),
	},
	{
		key: 'runner',
		label: 'Source / worker',
		className: COMPACT_COLUMN_CLASS,
		render: step => (
			// Short ids keep the cell on one line; the full ids stay available in the tooltip
			<span
				className="font-mono text-xs whitespace-nowrap"
				title={formatStepRunner(step.sourceId, step.workerId)}
			>
				{formatStepRunner(
					step.sourceId === undefined ? undefined : shortenId(step.sourceId),
					step.workerId === undefined ? undefined : shortenId(step.workerId)
				)}
			</span>
		),
	},
	{
		key: 'relaunches',
		label: 'Relaunches',
		render: step =>
			step.relaunches.length === 0 ? (
				<span className="text-sm text-muted-foreground">-</span>
			) : (
				<ul className="flex flex-col gap-1">
					{step.relaunches.map(relaunch => (
						<li
							key={`${relaunch.at}-${relaunch.feedback}`}
							// One truncated line per relaunch; the full text stays in the tooltip
							className="max-w-32 truncate text-xs"
							title={`${formatTimestamp(relaunch.at)} ${relaunch.feedback}`}
						>
							<span className="text-muted-foreground">{formatTimestamp(relaunch.at)}</span>{' '}
							{relaunch.feedback}
						</li>
					))}
				</ul>
			),
	},
];

export interface FlowExecutionStepsTableProps {
	steps: FlowStep[];
	/** When set, each step gets a button that opens the logs filtered on that step. */
	onShowStepLogs?: (stepId: string) => void;
}

export function FlowExecutionStepsTable({ steps, onShowStepLogs }: FlowExecutionStepsTableProps) {
	const allColumns: TableColumn<FlowStep>[] =
		onShowStepLogs === undefined
			? columns
			: [
					...columns,
					{
						key: 'logs',
						label: 'Logs',
						className: COMPACT_COLUMN_CLASS,
						render: step => (
							<Button
								variant="outline"
								size="sm"
								aria-label={`Show logs of step ${step.stepId}`}
								onClick={() => onShowStepLogs(step.stepId)}
							>
								Logs
							</Button>
						),
					},
				];

	return (
		<Table
			data={steps}
			columns={allColumns}
			getItemId={step => step.stepId}
			emptyMessage="This execution has no step yet."
		/>
	);
}
