import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowGraphTarget, type FlowQueryService, InvalidQueryError } from 'flow-core';

import { replyWithError } from './ErrorReply.js';

type QueryParams = Record<string, string | string[] | undefined>;

/** A parameter given once. Empty means unset: the DSL sends `?flowId=` when its route value is missing. */
function optionalString(query: QueryParams, name: string): string | undefined {
	const raw = query[name];
	if (Array.isArray(raw)) {
		throw new InvalidQueryError(`'${name}' must be given once, got ${raw.length} values.`);
	}
	return raw === undefined || raw === '' ? undefined : raw;
}

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
 * states of the run when there is one) and `GET /flows` (the flows that ran, to pick one to draw).
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

	ctx.registerRoute('GET', '/flows', (_req, reply) => {
		try {
			const flows = service.listFlows();
			return reply.code(200).send({ flows });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
