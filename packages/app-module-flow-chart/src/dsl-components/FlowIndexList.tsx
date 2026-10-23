import { Link } from 'react-router-dom';

import { Badge, ButtonLink, RelativeDate } from '@wadeck-app/dsl-ui';
import { FLOW_ACTION_BUTTON_STYLE } from 'flow-core/graph-tree';

export type FlowIndexLayout = 'cards' | 'list';

/** One flow as GET /flows answers it (only what the component reads). */
export interface FlowIndexRow {
	flowId: string;
	runCount: number;
	failedCount: number;
	lastStatus: string;
	lastRunAt: string;
	chartPath: string;
	lastRunChartPath: string;
}

type BadgeVariant = NonNullable<Parameters<typeof Badge>[0]['variant']>;

const STATUS_BADGES: Record<string, BadgeVariant> = {
	completed: 'success',
	failed: 'danger',
	running: 'primary',
	queued: 'default',
	're-queued': 'default',
};

function statusBadge(status: string): BadgeVariant {
	const variant = STATUS_BADGES[status];
	if (variant === undefined) {
		throw new Error(`Unknown execution status '${status}': add it to STATUS_BADGES in FlowIndexList.tsx.`);
	}
	return variant;
}

// Written out in full: Tailwind finds classes by scanning source text.
const LAYOUT_CLASSES: Record<FlowIndexLayout, { container: string; item: string }> = {
	cards: {
		container: 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3',
		item: 'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm',
	},
	list: {
		container: 'flex flex-col divide-y divide-border rounded-lg border border-border bg-surface',
		item: 'flex min-w-0 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3',
	},
};

const NAME_CLASS: Record<FlowIndexLayout, string> = {
	cards: 'block truncate font-mono text-lg font-semibold text-primary hover:underline',
	list: 'block truncate font-mono text-sm font-semibold text-primary hover:underline',
};

function renderCounts(flow: FlowIndexRow) {
	return (
		<span className="text-xs text-muted">
			{flow.runCount} {flow.runCount === 1 ? 'run' : 'runs'}
			{flow.failedCount > 0 && <span className="text-danger-text"> - {flow.failedCount} failed</span>}
			{' - last run '}
			<RelativeDate date={flow.lastRunAt} />
		</span>
	);
}

function renderActions(flow: FlowIndexRow) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<ButtonLink to={flow.chartPath} label="Open chart" {...FLOW_ACTION_BUTTON_STYLE} />
			<ButtonLink to={flow.lastRunChartPath} label="Latest run chart" {...FLOW_ACTION_BUTTON_STYLE} />
		</div>
	);
}

/**
 * The flows of the index as cards (a grid) or as dense rows. Each flow carries the two targets a reader wants:
 * the chart of the definition (the name and "Open chart") and the chart of the latest run. The DSL cannot repeat
 * a node per row, hence a component.
 */
export function FlowIndexList({
	flows,
	layout,
	emptyMessage,
}: {
	flows: unknown;
	layout: unknown;
	emptyMessage?: unknown;
}) {
	if (layout !== 'cards' && layout !== 'list') {
		throw new Error(`flow-chart:FlowIndexList needs layout: cards or list, got ${JSON.stringify(layout)}.`);
	}
	if (!Array.isArray(flows)) {
		return (
			<div role="alert" className="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-text">
				flow-chart:FlowIndexList did not receive a list of flows (expected flows: $sources.&lt;name&gt;.flows).
				The flows request probably failed: reload the page.
			</div>
		);
	}
	const rows = flows as FlowIndexRow[];
	if (rows.length === 0) {
		return (
			<div role="status" className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
				{typeof emptyMessage === 'string' && emptyMessage !== '' ? emptyMessage : 'No flow to show.'}
			</div>
		);
	}
	const classes = LAYOUT_CLASSES[layout];
	return (
		<ul className={classes.container} aria-label="Flows">
			{rows.map(flow => (
				<li key={flow.flowId} className={classes.item} data-testid={`flow-${flow.flowId}`}>
					{layout === 'cards' ? (
						<>
							<div className="flex min-w-0 items-start justify-between gap-2">
								<Link to={flow.chartPath} className={NAME_CLASS.cards} title={flow.flowId}>
									{flow.flowId}
								</Link>
								<Badge label={flow.lastStatus} variant={statusBadge(flow.lastStatus)} />
							</div>
							{renderCounts(flow)}
							{renderActions(flow)}
						</>
					) : (
						<>
							<div className="flex min-w-0 flex-col gap-1">
								<div className="flex min-w-0 items-center gap-2">
									<Badge label={flow.lastStatus} variant={statusBadge(flow.lastStatus)} />
									<Link to={flow.chartPath} className={NAME_CLASS.list} title={flow.flowId}>
										{flow.flowId}
									</Link>
								</div>
								{renderCounts(flow)}
							</div>
							{renderActions(flow)}
						</>
					)}
				</li>
			))}
		</ul>
	);
}
