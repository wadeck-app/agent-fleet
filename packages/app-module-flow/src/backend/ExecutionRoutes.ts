import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	DEFAULT_TAIL_CHARS,
	type ExecutionStatus,
	type FlowQueryService,
	InvalidQueryError,
	type QueryParams,
	optionalBoolean,
	optionalInteger,
	optionalString,
	readPageOffset,
	renderExecutionDetail,
	toExecutionDetail,
	toExecutionSummary,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { toExecutionDetailRow, toExecutionRow, toFlowRow, toStatusFilters } from './ExecutionDisplay.js';

export const MAX_EXECUTIONS_LIMIT = 500;
export const MAX_TAIL_CHARS = 1_000_000;

// Typed against ExecutionStatus so a status added to flow-core fails the build here instead of being refused at runtime.
const EXECUTION_STATUSES = [
	'queued',
	'running',
	'completed',
	'failed',
	're-queued',
] as const satisfies readonly ExecutionStatus[];

function readStatus(query: QueryParams): string | undefined {
	const status = optionalString(query, 'status');
	if (status !== undefined && !(EXECUTION_STATUSES as readonly string[]).includes(status)) {
		throw new InvalidQueryError(`'status' must be one of ${EXECUTION_STATUSES.join(', ')}, got '${status}'.`);
	}
	return status;
}

/** What the flows table says about itself: it is the only place the DSL can show that the list was cut. */
function flowsCaption(shown: number, total: number): string {
	if (total === 0) {
		return 'No flow has run yet';
	}
	if (shown < total) {
		return `${shown} most recent of ${total} flows. Click one to see only its executions, or open ?flow=<flowId>.`;
	}
	return `${total} ${total === 1 ? 'flow' : 'flows'}, most recent first. Click one to see only its executions.`;
}

/**
 * `GET /executions` (history), `GET /executions/:id` (detail) and `GET /flows` (distinct flows, to filter the history by):
 * `flow history` and `flow show`.
 */
export function registerExecutionRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/executions', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const limit = optionalInteger(query, 'limit', { min: 1, max: MAX_EXECUTIONS_LIMIT });
			const offset = readPageOffset(query, limit ?? DEFAULT_HISTORY_LIMIT);
			const status = readStatus(query);
			const flow = optionalString(query, 'flow');
			const page = service.listExecutions({
				limit,
				offset,
				status,
				flow,
				id: optionalString(query, 'id'),
			});
			const counts = service.countByStatus(flow);
			const body = {
				items: page.items.map(record => toExecutionRow(toExecutionSummary(record))),
				total: page.total,
				// Execution files that could not be read: the list is incomplete by this many, so a client can say so.
				skipped: page.skipped.length,
				limit: limit ?? DEFAULT_HISTORY_LIMIT,
				offset: offset ?? 0,
				// Labels of the status links, the active one marked: the DSL cannot style a link.
				statusFilters: toStatusFilters(status),
				// Same links with the number of executions each shows (for the flow filter, if any).
				statusFiltersCounted: toStatusFilters(status, counts),
				statusCounts: counts,
			};
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	ctx.registerRoute('GET', '/flows', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const limit = optionalInteger(query, 'limit', { min: 1, max: MAX_EXECUTIONS_LIMIT });
			const all = service.listFlows();
			const shown = limit === undefined ? all : all.slice(0, limit);
			return reply.code(200).send({
				flows: shown.map(toFlowRow),
				total: all.length,
				caption: flowsCaption(shown.length, all.length),
			});
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	ctx.registerRoute('GET', '/executions/:id', (req, reply) => {
		const { id } = req.params as { id: string };
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const tail = optionalInteger(query, 'tail', { min: 1, max: MAX_TAIL_CHARS }) ?? DEFAULT_TAIL_CHARS;
			const full = optionalBoolean(query, 'full', false);
			const resolved = service.getExecution(id);
			const detail = toExecutionDetail(resolved, renderExecutionDetail(resolved, { tail, full }));
			return reply.code(200).send(toExecutionDetailRow(detail));
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
