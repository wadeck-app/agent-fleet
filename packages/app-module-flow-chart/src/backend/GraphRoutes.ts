import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	type FlowGraphTarget,
	type FlowQueryService,
	type FlowSummary,
	InvalidQueryError,
	type QueryParams,
	chartPathOfExecution,
	chartPathOfFlow,
	filterFlowSummaries,
	flowHealth,
	groupByHealth,
	optionalInteger,
	optionalString,
	readFlowIndexFilter,
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

/** One flow of the index: the raw summary plus what the variants of the page read (dates stay ISO: the shell formats them). */
function toIndexRow(flow: FlowSummary) {
	const { lastExecutionId, ...rest } = flow;
	return {
		...rest,
		runCount: flow.executionCount,
		lastRunId: lastExecutionId,
		lastRunAt: flow.lastStartedAt,
		lastStartedLabel: shortStarted(flow.lastStartedAt),
		health: flowHealth(flow),
		// The DSL cannot concatenate an id into a path.
		chartPath: chartPathOfFlow(flow.flowId),
		lastRunChartPath: chartPathOfExecution(lastExecutionId),
	};
}

function titleOf(health: string, count: number): string {
	return `${health.charAt(0).toUpperCase()}${health.slice(1)} (${count})`;
}

/**
 * `GET /graph?executionId=` or `?flowId=` (the graph flow-core builds from the flow file, with the step
 * states of the run when there is one), `GET /flows?page&limit&q&health` (a page of the flows that ran, to pick one to
 * draw; q = text in the flow id, health = failing | running | healthy) and `GET /flows/health?q` (the same flows grouped
 * by health, worst first). Read-only.
 */
export function registerGraphRoutes(
	ctx: ModuleContext,
	service: FlowQueryService,
	maxBoardFlows: number = MAX_FLOWS_LIMIT
): void {
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
			const all = filterFlowSummaries(service.listFlows(), readFlowIndexFilter(query));
			const flows = all.slice(offset, offset + limit).map(toIndexRow);
			return reply.code(200).send({ flows, total: all.length, limit, offset });
		} catch (err) {
			return replyWithError(reply, err);
		}
	});

	ctx.registerRoute('GET', '/flows/health', (req, reply) => {
		const query = (req as { query?: QueryParams }).query ?? {};
		try {
			const matching = filterFlowSummaries(service.listFlows(), { q: readFlowIndexFilter(query).q });
			const shown = matching.slice(0, maxBoardFlows);
			const groups = groupByHealth(shown);
			const counts = groups.map(group => `${group.flows.length} ${group.health}`).join(', ');
			const truncated =
				matching.length > shown.length ? ` (showing the first ${shown.length} of ${matching.length})` : '';
			const summary =
				matching.length === 0
					? 'No flow matches'
					: `${shown.length} ${shown.length === 1 ? 'flow' : 'flows'}: ${counts}${truncated}`;
			const body: Record<string, unknown> = { total: matching.length, summary };
			for (const group of groups) {
				body[group.health] = {
					title: titleOf(group.health, group.flows.length),
					flows: group.flows.map(toIndexRow),
				};
			}
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
