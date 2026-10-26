import { Link } from 'react-router-dom';

import { Badge } from '@wadeck-app/dsl-ui';

import { formatMedium, isoTitle } from '../commons/DateText.js';
import { RUN_LIST_KEYS, type RunListProps, parseRunListRows, runLink, runStatusVariant } from './RunListProps.js';

function refusal(children: string) {
	return (
		<span role="alert" className="text-xs text-danger-text">
			{children}
		</span>
	);
}

/**
 * The latest runs of the dashboard card, one line per run: status badge, flow name, start time. The name takes the room
 * the badge and the time leave and ends with an ellipsis only when it does not fit (a table cannot do it: its columns
 * never shrink under their content, so the card scrolled sideways). Nothing here scrolls horizontally.
 *
 * Local stand-in for a dsl-ui list node: when one ships, change `$type: flow:RunList` in the view and delete this
 * component. Props are closed (runs, to, emptyMessage): anything else renders an error, so nobody restyles it.
 */
export function RunList({ runs, to, emptyMessage, unexpectedKeys }: RunListProps) {
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow:RunList does not accept ${unexpectedKeys.join(', ')}: its style is fixed. Keep only ${RUN_LIST_KEYS.join(', ')}.`
		);
	}
	if (typeof to !== 'string' || typeof emptyMessage !== 'string') {
		return refusal(
			`flow:RunList needs text for to and emptyMessage, got to ${JSON.stringify(to) ?? 'nothing'} and emptyMessage ${JSON.stringify(emptyMessage) ?? 'nothing'}.`
		);
	}
	let rows;
	try {
		rows = parseRunListRows(runs);
		// Checked for every row before drawing: a status the badge cannot colour is a message, not a half list.
		for (const row of rows) {
			runStatusVariant(row.statusLabel);
		}
		runLink(to, 'check');
	} catch (err) {
		return refusal((err as Error).message);
	}
	if (rows.length === 0) {
		return <p className="px-3 py-2 text-sm text-muted">{emptyMessage}</p>;
	}
	return (
		<ul className="min-w-0 divide-y divide-border overflow-hidden rounded-md border border-border">
			{rows.map(row => (
				<li key={row.executionId} className="min-w-0">
					<Link
						to={runLink(to, row.executionId)}
						className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm hover:bg-surface-hover"
					>
						<span className="shrink-0">
							<Badge
								label={row.statusLabel}
								variant={runStatusVariant(row.statusLabel)}
								tone="subtle"
								size="sm"
							/>
						</span>
						<span className="min-w-0 flex-1 truncate" title={row.flowId}>
							{row.flowId}
						</span>
						<time
							className="shrink-0 whitespace-nowrap text-xs text-muted"
							dateTime={row.startedAt.toISOString()}
							title={isoTitle(row.startedAt)}
						>
							{formatMedium(row.startedAt)}
						</time>
					</Link>
				</li>
			))}
		</ul>
	);
}
