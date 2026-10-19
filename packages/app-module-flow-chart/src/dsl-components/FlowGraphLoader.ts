import { useEffect, useState } from 'react';

import type { FlowGraphResult } from 'flow-core';

/** What to draw: one run (with step states) or a flow definition alone. */
export type GraphTarget = { executionId: string } | { flowId: string };

export type FetchFunction = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type GraphState =
	| { state: 'loading' }
	| { state: 'error'; message: string }
	| { state: 'ready'; result: FlowGraphResult; refreshError: string | undefined };

/** A run still going is redrawn at this pace, so its steps turn green as they finish. */
export const REFRESH_INTERVAL_MS = 4000;
const LIVE_STATUSES = new Set(['running', 'queued', 're-queued']);

const GRAPH_ENDPOINT = '/api/modules/flow-chart/graph';

export function graphUrl(target: GraphTarget): string {
	const [name, value] = Object.entries(target)[0]!;
	return `${GRAPH_ENDPOINT}?${name}=${encodeURIComponent(value)}`;
}

function isGraphResult(value: unknown): value is FlowGraphResult {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const graph = (value as { graph?: unknown }).graph as { nodes?: unknown; edges?: unknown } | undefined;
	return graph !== undefined && Array.isArray(graph.nodes) && Array.isArray(graph.edges);
}

export async function loadFlowGraph(
	target: GraphTarget,
	fetchFunction: FetchFunction,
	signal?: AbortSignal
): Promise<FlowGraphResult> {
	const url = graphUrl(target);
	let response: Response;
	try {
		response = await fetchFunction(url, { signal });
	} catch (err) {
		if (signal?.aborted) {
			throw err;
		}
		throw new Error(
			`Cannot reach ${url}: ${(err as Error).message}. Check that app-core is running and that the flow and flow-chart modules are loaded.`
		);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		body = undefined;
	}
	if (!response.ok) {
		const message = (body as { error?: unknown } | undefined)?.error;
		throw new Error(typeof message === 'string' ? message : `HTTP ${response.status} from ${url}.`);
	}
	if (!isGraphResult(body)) {
		throw new Error(
			`The answer of ${url} is not a flow graph (no graph.nodes / graph.edges). Is the flow-chart module up to date?`
		);
	}
	return body;
}

/**
 * Loads the graph and, for a run that is still going, reloads it every few seconds. A failed reload keeps the
 * last graph on screen and reports its message next to it.
 */
export function useFlowGraph(
	target: GraphTarget,
	fetchFunction: FetchFunction = (url, init) => fetch(url, init)
): GraphState {
	const [state, setState] = useState<GraphState>({ state: 'loading' });
	const key = graphUrl(target);

	useEffect(() => {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		setState({ state: 'loading' });

		// Whether the last good answer was a run still going: only then is a (re)load worth scheduling.
		let shownLive = false;
		let hasGraph = false;
		const schedule = (): void => {
			timer = setTimeout(() => void load(), REFRESH_INTERVAL_MS);
		};

		const load = async (): Promise<void> => {
			try {
				const result = await loadFlowGraph(target, fetchFunction, controller.signal);
				if (controller.signal.aborted) {
					return;
				}
				hasGraph = true;
				shownLive = result.execution !== undefined && LIVE_STATUSES.has(result.execution.status);
				setState({ state: 'ready', result, refreshError: undefined });
				if (shownLive) {
					schedule();
				}
			} catch (err) {
				if (controller.signal.aborted) {
					return;
				}
				const message = (err as Error).message;
				if (!hasGraph) {
					setState({ state: 'error', message });
					return;
				}
				setState(previous => (previous.state === 'ready' ? { ...previous, refreshError: message } : previous));
				// The daemon may just be busy: a live run is tried again.
				if (shownLive) {
					schedule();
				}
			}
		};
		void load();

		return () => {
			controller.abort();
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		};
		// `target` is represented by `key`; the fetch function is stable by contract.
	}, [key]);

	return state;
}
