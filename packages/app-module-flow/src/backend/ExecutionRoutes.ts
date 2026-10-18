import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	DEFAULT_TAIL_CHARS,
	type ExecutionStatus,
	type FlowQueryService,
	InvalidQueryError,
	renderExecutionDetail,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { toExecutionDetail, toExecutionSummary } from './ExecutionView.js';
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
	if (page === undefined) return offset;
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

/** `GET /executions` (history) and `GET /executions/:id` (detail): `flow history` and `flow show`. */
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
				items: page.items.map(toExecutionSummary),
				total: page.total,
				limit: limit ?? DEFAULT_HISTORY_LIMIT,
				offset: offset ?? 0,
			};
			return reply.code(200).send(body);
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
			return reply.code(200).send(detail);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
