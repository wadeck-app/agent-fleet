import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	DEFAULT_TAIL_CHARS,
	type ExecutionStatus,
	type FlowQueryService,
	InvalidQueryError,
	renderExecutionDetail,
	toExecutionDetail,
	toExecutionSummary,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { toExecutionDetailRow, toExecutionRow, toFlowRow } from './ExecutionDisplay.js';
import { type QueryParams, optionalBoolean, optionalInteger, optionalString } from './QueryParameters.js';

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

/** `offset`, or `page` (zero-based, what the DSL Pagination component sends) converted with the page size. */
function readOffset(query: QueryParams, pageSize: number): number | undefined {
	const offset = optionalInteger(query, 'offset', { min: 0 });
	const page = optionalInteger(query, 'page', { min: 0 });
	if (page === undefined) {
		return offset;
	}
	if (offset !== undefined) {
		throw new InvalidQueryError(
			"'page' and 'offset' cannot be combined: use page (with limit) or offset, not both."
		);
	}
	const fromPage = page * pageSize;
	if (!Number.isSafeInteger(fromPage)) {
		throw new InvalidQueryError(`'page' is too large: page ${page} of ${pageSize} rows is not a valid offset.`);
	}
	return fromPage;
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
			const offset = readOffset(query, limit ?? DEFAULT_HISTORY_LIMIT);
			const page = service.listExecutions({
				limit,
				offset,
				status: readStatus(query),
				flow: optionalString(query, 'flow'),
				id: optionalString(query, 'id'),
			});
			const body = {
				items: page.items.map(record => toExecutionRow(toExecutionSummary(record))),
				total: page.total,
				// Execution files that could not be read: the list is incomplete by this many, so a client can say so.
				skipped: page.skipped.length,
				limit: limit ?? DEFAULT_HISTORY_LIMIT,
				offset: offset ?? 0,
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
