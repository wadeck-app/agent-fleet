import { InvalidQueryError } from '../errors.js';
import type { FlowSummary } from '../history/FlowSummaries.js';
import { type QueryParams, optionalString } from './QueryParameters.js';

/** Order matters: it is the order of the groups of a health board (worst first). */
export const FLOW_HEALTHS = ['failing', 'running', 'healthy'] as const;
export type FlowHealth = (typeof FLOW_HEALTHS)[number];

/** The explicit "no health filter" of a request (an empty value means the same). */
export const FLOW_HEALTH_ANY = 'any';

export interface FlowIndexFilter {
	/** Case-insensitive text looked for in the flow id. */
	q?: string;
	health?: FlowHealth;
}

export interface FlowHealthGroup {
	health: FlowHealth;
	flows: FlowSummary[];
}

/** What the last run says: failed is failing, not finished is running, anything else is healthy. */
export function flowHealth(flow: FlowSummary): FlowHealth {
	switch (flow.lastStatus) {
		case 'failed':
			return 'failing';
		case 'queued':
		case 'running':
		case 're-queued':
			return 'running';
		case 'completed':
			return 'healthy';
		default:
			throw new Error(`Unknown execution status '${String(flow.lastStatus)}' on flow '${flow.flowId}'.`);
	}
}

export function filterFlowSummaries(flows: readonly FlowSummary[], filter: FlowIndexFilter): FlowSummary[] {
	const needle = filter.q?.toLowerCase();
	return flows.filter(
		flow =>
			(needle === undefined || flow.flowId.toLowerCase().includes(needle)) &&
			(filter.health === undefined || flowHealth(flow) === filter.health)
	);
}

/** One group per health, in FLOW_HEALTHS order (empty groups included); the order inside a group is kept. */
export function groupByHealth(flows: readonly FlowSummary[]): FlowHealthGroup[] {
	return FLOW_HEALTHS.map(health => ({ health, flows: flows.filter(flow => flowHealth(flow) === health) }));
}

/** How many flows are in each health, every health present (zero included), in FLOW_HEALTHS order. */
export function countByHealth(flows: readonly FlowSummary[]): Record<FlowHealth, number> {
	const counts = { failing: 0, running: 0, healthy: 0 };
	for (const flow of flows) {
		counts[flowHealth(flow)] += 1;
	}
	return counts;
}

/** `q` and `health` of a request (health "any" or empty = no filter); an unknown health is refused with the accepted values. */
export function readFlowIndexFilter(query: QueryParams): FlowIndexFilter {
	const q = optionalString(query, 'q');
	const health = optionalString(query, 'health');
	if (health !== undefined && health !== FLOW_HEALTH_ANY && !(FLOW_HEALTHS as readonly string[]).includes(health)) {
		throw new InvalidQueryError(
			`'health' must be one of ${[FLOW_HEALTH_ANY, ...FLOW_HEALTHS].join(', ')}, got '${health}'.`
		);
	}
	return {
		...(q !== undefined ? { q } : {}),
		...(health !== undefined && health !== FLOW_HEALTH_ANY ? { health: health as FlowHealth } : {}),
	};
}
