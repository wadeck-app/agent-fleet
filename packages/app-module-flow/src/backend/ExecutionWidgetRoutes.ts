import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, ellipsize, requireTimestamp, statusTag } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

export const WIDGET_ROW_COUNT = 5;
/** Rows of the dense variant of the widget (`compact`); the first {@link WIDGET_ROW_COUNT} are also `items`. */
export const WIDGET_COMPACT_ROW_COUNT = 8;
/**
 * Longest row title: "tag name". A 240px card holds about 25 characters on one line; the start time (a separate
 * column the shell formats) takes the rest and wraps at its space, so the title is cut short. The dsl-ui DataTable
 * ignores a column's width/truncate before 122 and breaks a cell anywhere, so the only lever is a short title.
 */
export const MAX_WIDGET_TITLE_LENGTH = 16;

/**
 * `GET /widgets/executions`: what the dashboard widget shows in a narrow cell, precomputed so the view needs no
 * formatting the DSL cannot do (status mark in front of the flow name). Times are ISO 8601: the view formats them.
 * The executions page keeps using `GET /executions`, whose contract this does not touch.
 */
export function registerExecutionWidgetRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/widgets/executions', (_req, reply) => {
		try {
			const recent = service.listExecutions({ limit: WIDGET_COMPACT_ROW_COUNT });
			const starts = recent.items.map(record => requireTimestamp(record.startedAt));
			const counts = service.countByStatus();
			const body = {
				total: recent.total,
				viewAllLabel: recent.total === 0 ? 'View all executions' : `View all ${recent.total} executions`,
				running: counts.running,
				failed: counts.failed,
				// Start of the newest run as the one row of a table (empty when nothing ran): a tile cannot format a timestamp.
				lastRun: starts.slice(0, 1).map(startedAt => ({ startedAt })),
				items: recent.items.slice(0, WIDGET_ROW_COUNT).map((record, index) => ({
					executionId: record.executionId,
					flowId: record.flowId,
					status: record.status,
					title: widgetTitle(record.status, record.flowId),
					startedAt: starts[index],
				})),
				// Columns instead of one precomputed title: for the dense table variant, which truncates the name itself.
				compact: recent.items.map((record, index) => ({
					executionId: record.executionId,
					flowId: record.flowId,
					statusLabel: statusTag(record.status),
					startedAt: starts[index],
				})),
			};
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}

/** "ok build_task": the flow name is cut (with "...") so the whole title fits; `flowId` keeps the full name. */
export function widgetTitle(status: string, flowId: string): string {
	const prefix = `${statusTag(status)} `;
	return `${prefix}${ellipsize(flowId, MAX_WIDGET_TITLE_LENGTH - prefix.length)}`;
}
