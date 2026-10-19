import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import type { ExecutionStatus, FlowQueryService } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

export const WIDGET_ROW_COUNT = 5;
/** Longest flow name shown whole: the widget cell is about 260px, and the DataTable wraps rather than truncates a cell. */
export const MAX_FLOW_NAME_LENGTH = 21;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_HORIZON_DAYS = 30;

// Typed against ExecutionStatus so a status added to flow-core fails the build here instead of rendering without a mark.
// @formatter:off
const STATUS_MARKS: Record<ExecutionStatus, string> = {
	queued: '…',
	running: '▶',
	completed: '✓',
	failed: '✗',
	're-queued': '↻',
};
// @formatter:on

/** "now", "5m", "3h", "2d", then the ISO date: short enough for a one-line row of a narrow widget. */
export function formatRelativeTime(iso: string, now: Date): string {
	const started = new Date(iso).getTime();
	if (Number.isNaN(started)) {
		throw new Error(`Cannot show a relative time for '${iso}': not a valid timestamp (corrupt execution file?).`);
	}
	// A clock slightly behind the writer of the record gives a negative age: treat it as "now".
	const age = Math.max(0, now.getTime() - started);
	if (age < MINUTE_MS) return 'now';
	if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m`;
	if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h`;
	if (age < RELATIVE_HORIZON_DAYS * DAY_MS) return `${Math.floor(age / DAY_MS)}d`;
	return new Date(started).toISOString().slice(0, 10);
}

/**
 * `GET /widgets/executions`: what the dashboard widget shows in a narrow cell, precomputed so the view needs no
 * formatting the DSL cannot do (status mark in front of the flow name, relative time). The executions page keeps using
 * `GET /executions`, whose contract this does not touch.
 */
export function registerExecutionWidgetRoutes(
	ctx: ModuleContext,
	service: FlowQueryService,
	now: () => Date = () => new Date()
): void {
	ctx.registerRoute('GET', '/widgets/executions', (_req, reply) => {
		try {
			const recent = service.listExecutions({ limit: WIDGET_ROW_COUNT });
			const reference = now();
			const body = {
				total: recent.total,
				viewAllLabel: recent.total === 0 ? 'View all executions' : `View all ${recent.total} executions`,
				running: service.listExecutions({ status: 'running', limit: 1 }).total,
				failed: service.listExecutions({ status: 'failed', limit: 1 }).total,
				items: recent.items.map(record => ({
					executionId: record.executionId,
					flowId: record.flowId,
					status: record.status,
					title: `${STATUS_MARKS[record.status]} ${truncateFlowName(record.flowId)}`,
					when: formatRelativeTime(record.startedAt, reference),
				})),
			};
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}

/** The full name stays in `flowId`; only the display title is shortened. */
export function truncateFlowName(flowId: string): string {
	return flowId.length <= MAX_FLOW_NAME_LENGTH ? flowId : `${flowId.slice(0, MAX_FLOW_NAME_LENGTH - 1)}…`;
}
