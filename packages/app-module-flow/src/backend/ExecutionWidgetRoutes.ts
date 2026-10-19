import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, ellipsize, statusTag } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

export const WIDGET_ROW_COUNT = 5;
/**
 * Longest row title: "tag name - age" must fit one line of the narrowest widget (a 240px card leaves about 190px,
 * 25-27 characters at 14px). The dsl-ui DataTable ignores a column's width/truncate and breaks a cell anywhere, so the
 * only way to keep one line per run is to send a title that is short enough.
 */
export const MAX_WIDGET_TITLE_LENGTH = 28;
const TITLE_SEPARATOR = ' - ';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_HORIZON_DAYS = 30;

/** "now", "5m", "3h", "2d", then the ISO date: short enough for a one-line row of a narrow widget. */
export function formatRelativeTime(iso: string, now: Date): string {
	const started = new Date(iso).getTime();
	if (Number.isNaN(started)) {
		throw new Error(`Cannot show a relative time for '${iso}': not a valid timestamp (corrupt execution file?).`);
	}
	// A clock slightly behind the writer of the record gives a negative age: treat it as "now".
	const age = Math.max(0, now.getTime() - started);
	if (age < MINUTE_MS) {
		return 'now';
	}
	if (age < HOUR_MS) {
		return `${Math.floor(age / MINUTE_MS)}m`;
	}
	if (age < DAY_MS) {
		return `${Math.floor(age / HOUR_MS)}h`;
	}
	if (age < RELATIVE_HORIZON_DAYS * DAY_MS) {
		return `${Math.floor(age / DAY_MS)}d`;
	}
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
				items: recent.items.map(record => {
					const age = formatRelativeTime(record.startedAt, reference);
					return {
						executionId: record.executionId,
						flowId: record.flowId,
						status: record.status,
						title: widgetTitle(record.status, record.flowId, age),
						when: age,
					};
				}),
			};
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}

/** "ok build_task - 1d": the flow name is cut (with "...") so the whole title fits; `flowId` keeps the full name. */
export function widgetTitle(status: string, flowId: string, age: string): string {
	const prefix = `${statusTag(status)} `;
	const suffix = `${TITLE_SEPARATOR}${age}`;
	return `${prefix}${ellipsize(flowId, MAX_WIDGET_TITLE_LENGTH - prefix.length - suffix.length)}${suffix}`;
}
