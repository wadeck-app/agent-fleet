import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	type FlowGraphTarget,
	type FlowQueryService,
	InvalidQueryError,
	type QueryParams,
	optionalInteger,
	optionalString,
	readPageOffset,
	shortStarted,
} from 'flow-core';

import { replyWithError } from './ErrorReply.js';

export const MAX_FLOWS_LIMIT = 500;

function readTarget(query: QueryParams): FlowGraphTarget {
	const executionId = optionalString(query, 'executionId');
	const flowId = optionalString(query, 'flowId');
	if (executionId !== undefined && flowId !== undefined) {
		throw new InvalidQueryError(
			"Give only one of 'executionId' (a run, with its step states) or 'flowId' (the definition)."
		);
	}
	if (executionId !== undefined) {
		return { executionId };
	}
	if (flowId !== undefined) {
		return { flowId };
	}
	throw new InvalidQueryError("Give 'executionId' (a run, with its step states) or 'flowId' (the definition alone).");
}

/**
 * `GET /graph?executionId=` or `?flowId=` (the graph flow-core builds from the flow file, with the step
 * states of the run when there is one) and `GET /flows?page&limit` (a page of the flows that ran, to pick one to draw).
 * Read-only.
 */
export function registerGraphRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/graph', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const result = service.getFlowGraph(readTarget(query));
			return reply.code(200).send(result);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	ctx.registerRoute('GET', '/flows', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const limit = optionalInteger(query, 'limit', { min: 1, max: MAX_FLOWS_LIMIT }) ?? DEFAULT_HISTORY_LIMIT;
			const offset = readPageOffset(query, limit) ?? 0;
			const all = service.listFlows();
			const flows = all
				.slice(offset, offset + limit)
				.map(flow => ({ ...flow, lastStartedLabel: shortStarted(flow.lastStartedAt) }));
			return reply.code(200).send({ flows, total: all.length, limit, offset });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
