import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	FLOW_CHART_INDEX_PATH,
	FLOW_HEALTHS,
	FLOW_HEALTH_ANY,
	type FlowGraphTarget,
	type FlowHealth,
	type FlowIndexFilter,
	type FlowQueryService,
	type FlowSummary,
	InvalidQueryError,
	type QueryParams,
	chartPathOfExecution,
	chartPathOfFlow,
	countByHealth,
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

function capitalized(word: string): string {
	return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * What the flows table says when it has no row. The three causes need three words: a page past the end (flows exist,
 * `total` says so), a filter that matches nothing, and an install where nothing ever ran.
 */
function emptyMessageOf(total: number, filtered: boolean): string {
	if (total > 0) {
		return 'No flows on this page';
	}
	return filtered
		? 'No flow matches the filters'
		: 'No flow has run yet: run a flow (flow run <file>) and it shows here';
}

interface HealthChip {
	label: string;
	/** The index page with this health (and the text and page size of the request); never a page: a new filter starts on page 1. */
	to: string;
	/** The active chip is primary, the others secondary: the DSL has no conditional, so the route decides. */
	variant: 'primary' | 'secondary';
}

/**
 * The health toggles of the index, with the number of flows each one would show for the current text filter. The DSL
 * cannot repeat a node, so they are four named objects (`any`, then FLOW_HEALTHS), each rendered by one ButtonLink.
 */
function healthChips(
	flows: Parameters<typeof countByHealth>[0],
	filter: FlowIndexFilter,
	pageSize: number | undefined
): Record<typeof FLOW_HEALTH_ANY | FlowHealth, HealthChip> {
	const counts = countByHealth(flows);
	const chip = (health: typeof FLOW_HEALTH_ANY | FlowHealth, label: string, count: number): HealthChip => {
		const params = new URLSearchParams();
		if (filter.q !== undefined) {
			params.set('q', filter.q);
		}
		if (health !== FLOW_HEALTH_ANY) {
			params.set('health', health);
		}
		if (pageSize !== undefined) {
			params.set('size', String(pageSize));
		}
		const search = params.toString();
		return {
			label: `${label} (${count})`,
			to: search === '' ? FLOW_CHART_INDEX_PATH : `${FLOW_CHART_INDEX_PATH}?${search}`,
			variant: (filter.health ?? FLOW_HEALTH_ANY) === health ? 'primary' : 'secondary',
		};
	};
	return {
		any: chip(FLOW_HEALTH_ANY, capitalized(FLOW_HEALTH_ANY), flows.length),
		...(Object.fromEntries(
			FLOW_HEALTHS.map(health => [health, chip(health, capitalized(health), counts[health])])
		) as Record<FlowHealth, HealthChip>),
	};
}

function titleOf(health: string, count: number): string {
	return `${capitalized(health)} (${count})`;
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
			const filter = readFlowIndexFilter(query);
			const everything = service.listFlows();
			const all = filterFlowSummaries(everything, filter);
			const flows = all.slice(offset, offset + limit).map(toIndexRow);
			const sizeAsked = optionalInteger(query, 'limit', { min: 1, max: MAX_FLOWS_LIMIT });
			return reply.code(200).send({
				flows,
				total: all.length,
				limit,
				offset,
				emptyMessage: emptyMessageOf(all.length, filter.q !== undefined || filter.health !== undefined),
				// Counts follow the text filter only: a chip says how many flows it would show if clicked.
				chips: healthChips(filterFlowSummaries(everything, { q: filter.q }), filter, sizeAsked),
			});
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
