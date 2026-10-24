import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';

/** The keys a `flow:RunList` node may carry: nothing that styles the list. */
export const RUN_LIST_KEYS = ['runs', 'to', 'emptyMessage'] as const;

export interface RunListProps {
	runs: unknown;
	to: unknown;
	emptyMessage: unknown;
	/** Keys of the node outside the contract (the platform checks only the root $type, never the props). */
	unexpectedKeys: string[];
}

export interface RunListRow {
	executionId: string;
	flowId: string;
	statusLabel: string;
	startedAt: Date;
}

export type RunStatusVariant = 'success' | 'danger' | 'info' | 'default' | 'warning';

// The tags of flow-core CellText (statusTag): the first word of a status label ("ok, 3 tries" is an "ok").
const STATUS_VARIANTS: Record<string, RunStatusVariant> = {
	ok: 'success',
	FAILED: 'danger',
	running: 'info',
	waiting: 'default',
	retry: 'warning',
};

/** Reads the node: the declared values resolved against the context, and the undeclared keys. */
export function readRunListProps(node: Record<string, unknown>, ctx: Record<string, unknown>): RunListProps {
	const declared: readonly string[] = RUN_LIST_KEYS;
	return {
		runs: resolveExpressionValue(node['runs'], ctx),
		to: resolveExpressionValue(node['to'], ctx),
		emptyMessage: resolveExpressionValue(node['emptyMessage'], ctx),
		// "$type", "$if" and the like belong to the engine, not to the node.
		unexpectedKeys: Object.keys(node)
			.filter(key => !key.startsWith('$') && !declared.includes(key))
			.sort(),
	};
}

/** The rows of the `runs` list, or an error that names the row and the field that is wrong. */
export function parseRunListRows(runs: unknown): RunListRow[] {
	if (!Array.isArray(runs)) {
		throw new Error(
			`flow:RunList runs must be a list of runs (for example runs: $sources.recent.latest), got ${JSON.stringify(runs) ?? 'nothing'}.`
		);
	}
	return runs.map((run: unknown, index) => {
		const text = (field: string): string => {
			const value: unknown = typeof run === 'object' && run !== null ? Reflect.get(run, field) : undefined;
			if (typeof value !== 'string') {
				throw new Error(
					`flow:RunList row ${index} needs a text ${field}, got ${JSON.stringify(value) ?? 'nothing'}.`
				);
			}
			return value;
		};
		const startedAt = new Date(text('startedAt'));
		if (Number.isNaN(startedAt.getTime())) {
			throw new Error(
				`flow:RunList row ${index} startedAt must be an ISO 8601 time, got "${text('startedAt')}".`
			);
		}
		return {
			executionId: text('executionId'),
			flowId: text('flowId'),
			statusLabel: text('statusLabel'),
			startedAt,
		};
	});
}

/** The badge colour of a status label. */
export function runStatusVariant(statusLabel: string): RunStatusVariant {
	const tag = statusLabel.split(',')[0]!;
	const variant = STATUS_VARIANTS[tag];
	if (variant === undefined) {
		throw new Error(
			`flow:RunList does not know the status "${statusLabel}". Known: ${Object.keys(STATUS_VARIANTS).join(', ')}.`
		);
	}
	return variant;
}

/** The address of a run: `to` with its `{executionId}` replaced. */
export function runLink(to: string, executionId: string): string {
	if (!to.includes('{executionId}')) {
		throw new Error(
			`flow:RunList to must contain {executionId} (for example /modules/flow/executions/{executionId}), got "${to}".`
		);
	}
	return to.replace('{executionId}', encodeURIComponent(executionId));
}
