import { FlowCoreError } from '../errors.js';
import type { FlowGraph, FlowGraphEdge } from './FlowGraph.js';

// This file is the browser-safe subpath `flow-core/graph-tree` (the package index pulls in node:fs). The page paths
// a chart links to are re-exported here until the package gets a subpath of their own.
export { chartPathOfExecution, chartPathOfFlow } from '../appModule/FlowChartPaths.js';
export { executionStepLogsPath } from '../appModule/FlowExecutionLogsLink.js';
export { executionLogsPath } from '../appModule/FlowModuleContract.js';

/** A parent with more sub-steps than this starts collapsed in a chart. */
export const DEFAULT_MAX_EXPANDED_CHILDREN = 8;

/** One step of the tree reading of a flow graph, in display order. */
export interface GraphTreeRow {
	nodeId: string;
	/** 0 for a top-level step, 1 for a sub-step of a top-level step, and so on. */
	depth: number;
	/** The step this one is a sub-step of (`parent` in the flow file or in the run record); undefined at depth 0. */
	parentId: string | undefined;
	/** Direct sub-steps. */
	childCount: number;
	/** Sub-steps at any depth below. */
	descendantCount: number;
}

function invalid(message: string): FlowCoreError {
	return new FlowCoreError(`The flow graph cannot be shown as a tree: ${message}`, 'invalid-flow-graph');
}

/** Edge kinds that order steps in time; a loop points backwards on purpose and a substep is the tree itself. */
function ordersSteps(edge: FlowGraphEdge): boolean {
	return edge.kind === 'dependency' || edge.kind === 'conditional' || edge.kind === 'sequence';
}

/** The `substep` edges of the graph as child id -> parent id; refuses unknown steps, two parents and cycles. */
function parentsOf(graph: FlowGraph, index: ReadonlyMap<string, number>): Map<string, string> {
	for (const edge of graph.edges) {
		for (const end of [edge.from, edge.to]) {
			if (!index.has(end)) {
				throw invalid(`edge ${edge.from} -> ${edge.to} refers to the unknown step '${end}'.`);
			}
		}
	}
	const parents = new Map<string, string>();
	for (const edge of graph.edges) {
		if (edge.kind !== 'substep') {
			continue;
		}
		const known = parents.get(edge.from);
		if (known !== undefined && known !== edge.to) {
			throw invalid(`step '${edge.from}' has two parents ('${known}' and '${edge.to}'); a step has at most one.`);
		}
		parents.set(edge.from, edge.to);
	}
	for (const start of parents.keys()) {
		const seen = new Set<string>([start]);
		for (let up = parents.get(start); up !== undefined; up = parents.get(up)) {
			if (seen.has(up)) {
				throw invalid(`sub-step cycle through '${up}': a step cannot be its own ancestor.`);
			}
			seen.add(up);
		}
	}
	return parents;
}

/**
 * Orders sibling steps (same parent) by the dependencies between them, keeping the graph order for independent
 * ones. A dependency on a sub-step counts for the sibling that contains it.
 */
function orderSiblings(
	siblings: readonly string[],
	edges: readonly FlowGraphEdge[],
	siblingOf: (id: string) => string | undefined
): string[] {
	const position = new Map(siblings.map((id, i) => [id, i]));
	const waitingFor = new Map<string, Set<string>>(siblings.map(id => [id, new Set<string>()]));
	for (const edge of edges) {
		const from = siblingOf(edge.from);
		const to = siblingOf(edge.to);
		if (from !== undefined && to !== undefined && from !== to) {
			waitingFor.get(to)!.add(from);
		}
	}
	const ordered: string[] = [];
	const remaining = new Set(siblings);
	while (remaining.size > 0) {
		const next = siblings.find(
			id => remaining.has(id) && [...waitingFor.get(id)!].every(dep => !remaining.has(dep))
		);
		if (next === undefined) {
			const stuck = [...remaining].sort((a, b) => position.get(a)! - position.get(b)!);
			throw invalid(`dependency cycle between steps ${stuck.join(', ')}; remove one of the 'depends'.`);
		}
		ordered.push(next);
		remaining.delete(next);
	}
	return ordered;
}

/**
 * The tree reading of a flow graph: every step once, a parent followed by its sub-steps (`substep` edges, i.e.
 * `parent` in the flow file or in the run record) one level deeper, recursively. Top-level steps and the sub-steps
 * of one parent are each ordered by their dependencies (graph order for independent steps).
 * Throws FlowCoreError('invalid-flow-graph') on an unknown step, a step with two parents, or a cycle.
 */
export function buildGraphTree(graph: FlowGraph): GraphTreeRow[] {
	const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
	const parents = parentsOf(graph, index);
	const children = new Map<string | undefined, string[]>();
	for (const n of graph.nodes) {
		const parent = parents.get(n.id);
		children.set(parent, [...(children.get(parent) ?? []), n.id]);
	}
	const orderingEdges = graph.edges.filter(ordersSteps);

	const rows: GraphTreeRow[] = [];
	const visit = (parentId: string | undefined, depth: number): number => {
		const siblings = children.get(parentId) ?? [];
		// The ancestor of a step that sits directly under `parentId`.
		const siblingOf = (id: string): string | undefined => {
			for (let current: string | undefined = id; current !== undefined; current = parents.get(current)) {
				if (parents.get(current) === parentId) {
					return current;
				}
			}
			return undefined;
		};
		let total = 0;
		for (const id of orderSiblings(siblings, orderingEdges, siblingOf)) {
			const row: GraphTreeRow = {
				nodeId: id,
				depth,
				parentId,
				childCount: children.get(id)?.length ?? 0,
				descendantCount: 0,
			};
			rows.push(row);
			row.descendantCount = visit(id, depth + 1);
			total += 1 + row.descendantCount;
		}
		return total;
	};
	visit(undefined, 0);
	return rows;
}

/** Parents that start collapsed: those with more than `maxExpandedChildren` direct sub-steps. */
export function defaultCollapsedIds(
	rows: readonly GraphTreeRow[],
	maxExpandedChildren: number = DEFAULT_MAX_EXPANDED_CHILDREN
): Set<string> {
	return new Set(rows.filter(r => r.childCount > maxExpandedChildren).map(r => r.nodeId));
}

/** The rows left once the sub-steps of every collapsed parent (at any depth) are hidden. */
export function visibleTreeRows(rows: readonly GraphTreeRow[], collapsed: ReadonlySet<string>): GraphTreeRow[] {
	const hiddenAncestors = new Set<string>();
	const visible: GraphTreeRow[] = [];
	for (const row of rows) {
		// Rows are in preorder: the parent was seen before its sub-steps.
		if (row.parentId !== undefined && (collapsed.has(row.parentId) || hiddenAncestors.has(row.parentId))) {
			hiddenAncestors.add(row.nodeId);
			continue;
		}
		visible.push(row);
	}
	return visible;
}

/**
 * Redraws edges on the steps that are shown: an end hidden in a collapsed parent moves to that parent. Edges that
 * become a loop on one step are dropped, identical ones merged (merged, an edge counts as traversed when any of them
 * was); the order of the first occurrences is kept.
 */
export function liftEdges(
	edges: readonly FlowGraphEdge[],
	rows: readonly GraphTreeRow[],
	visibleIds: ReadonlySet<string>
): FlowGraphEdge[] {
	const parentOf = new Map(rows.map(r => [r.nodeId, r.parentId]));
	const lift = (id: string): string => {
		for (let current: string | undefined = id; current !== undefined; current = parentOf.get(current)) {
			if (visibleIds.has(current)) {
				return current;
			}
		}
		throw invalid(`step '${id}' and all its ancestors are hidden; the visible set must hold every top-level step.`);
	};
	const seen = new Map<string, number>();
	const lifted: FlowGraphEdge[] = [];
	for (const edge of edges) {
		const from = lift(edge.from);
		const to = lift(edge.to);
		const key = `${edge.kind}\u0000${from}\u0000${to}\u0000${edge.label ?? ''}`;
		if (from === to) {
			continue;
		}
		const first = seen.get(key);
		if (first !== undefined) {
			if (edge.traversed === true && lifted[first]!.traversed !== true) {
				lifted[first] = { ...lifted[first]!, traversed: true };
			}
			continue;
		}
		seen.set(key, lifted.length);
		lifted.push(from === edge.from && to === edge.to ? edge : { ...edge, from, to });
	}
	return lifted;
}
