import { act, renderHook, waitFor } from '@testing-library/react';
import type { FlowGraphResult } from 'flow-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REFRESH_INTERVAL_MS, graphUrl, loadFlowGraph, useFlowGraph } from './FlowGraphLoader.js';
import { BUILD_GRAPH } from './testing/GraphFixtures.js';

function result(status: string): FlowGraphResult {
	return {
		graph: BUILD_GRAPH,
		flowId: 'build',
		flowName: 'Build',
		flowFile: '/f.yml',
		definition: { source: 'flow-file' },
		execution: { executionId: 'e1', status, startedAt: '2026-08-16T12:00:00.000Z', completedAt: null },
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.useRealTimers());

describe('graphUrl', () => {
	it('targets the flow-chart API of the same origin, encoding the id', () => {
		expect(graphUrl({ executionId: 'a/b c' })).toBe('/api/modules/flow-chart/graph?executionId=a%2Fb%20c');
		expect(graphUrl({ flowId: 'deploy' })).toBe('/api/modules/flow-chart/graph?flowId=deploy');
	});
});

describe('loadFlowGraph', () => {
	it('returns the parsed result', async () => {
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, result('completed')));
		expect((await loadFlowGraph({ executionId: 'e1' }, fetchFn)).flowId).toBe('build');
	});

	it('throws the API own message, which already says what to do', async () => {
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, { error: "Flow file '/x.yml' no longer exists." }));
		await expect(loadFlowGraph({ executionId: 'e1' }, fetchFn)).rejects.toThrow(
			"Flow file '/x.yml' no longer exists."
		);
	});

	it('names the status and the url when the answer is not the JSON error the API sends', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('<html>nope</html>', { status: 502 }));
		await expect(loadFlowGraph({ flowId: 'f' }, fetchFn)).rejects.toThrow(
			/HTTP 502.*\/api\/modules\/flow-chart\/graph/
		);
	});

	it('explains an unreachable server', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(loadFlowGraph({ flowId: 'f' }, fetchFn)).rejects.toThrow(/Cannot reach.*Failed to fetch/);
	});

	it('refuses a 200 that is not a graph instead of drawing nothing', async () => {
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }));
		await expect(loadFlowGraph({ flowId: 'f' }, fetchFn)).rejects.toThrow(/not a flow graph/);
	});
});

describe('useFlowGraph', () => {
	it('goes from loading to ready', async () => {
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, result('completed')));
		const { result: hook } = renderHook(() => useFlowGraph({ executionId: 'e1' }, fetchFn));
		expect(hook.current.state).toBe('loading');
		await waitFor(() => expect(hook.current.state).toBe('ready'));
		expect(hook.current.state === 'ready' && hook.current.result.flowName).toBe('Build');
	});

	it('goes to error with the message', async () => {
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Execution zzz not found.' }));
		const { result: hook } = renderHook(() => useFlowGraph({ executionId: 'zzz' }, fetchFn));
		await waitFor(() => expect(hook.current.state).toBe('error'));
		expect(hook.current.state === 'error' && hook.current.message).toBe('Execution zzz not found.');
	});

	it('does not refresh a finished run', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, result('completed')));
		const { result: hook } = renderHook(() => useFlowGraph({ executionId: 'e1' }, fetchFn));
		await waitFor(() => expect(hook.current.state).toBe('ready'));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('refreshes a running execution until it finishes, then stops', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const fetchFn = vi
			.fn()
			.mockImplementationOnce(async () => jsonResponse(200, result('running')))
			.mockImplementation(async () => jsonResponse(200, result('completed')));
		const { result: hook } = renderHook(() => useFlowGraph({ executionId: 'e1' }, fetchFn));
		await waitFor(() => expect(hook.current.state).toBe('ready'));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 50);
		});
		await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);
		});
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('keeps the last graph on screen when a refresh fails', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const fetchFn = vi
			.fn()
			.mockImplementationOnce(async () => jsonResponse(200, result('running')))
			.mockImplementation(async () => jsonResponse(500, { error: 'disk full' }));
		const { result: hook } = renderHook(() => useFlowGraph({ executionId: 'e1' }, fetchFn));
		await waitFor(() => expect(hook.current.state).toBe('ready'));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 50);
		});
		await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
		expect(hook.current.state).toBe('ready');
		expect(hook.current.state === 'ready' && hook.current.refreshError).toBe('disk full');
	});
});
