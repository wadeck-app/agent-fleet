import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import type { FlowExecutionsResponse } from '@shared/api/flow-daemon.contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { flowDaemonService } from '../FlowDaemonService';
import { useFlowExecutions } from './useFlowExecutions';

vi.mock('../FlowDaemonService', () => ({
	flowDaemonService: {
		listExecutions: vi.fn(),
		listFlowIds: vi.fn(),
	},
}));

function emptyResponse(total: number, limit: number, offset: number): FlowExecutionsResponse {
	return { items: [], total, limit, offset };
}

function renderUseFlowExecutions(initialUrl: string) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
	);
	return renderHook(() => useFlowExecutions(), { wrapper });
}

describe('useFlowExecutions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(flowDaemonService.listFlowIds as Mock).mockResolvedValue(['alpha', 'beta']);
	});

	it('loads the first page with the default size and exposes the flow options', async () => {
		(flowDaemonService.listExecutions as Mock).mockResolvedValue(emptyResponse(0, 20, 0));

		const { result } = renderUseFlowExecutions('/flow/executions');

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(flowDaemonService.listExecutions).toHaveBeenCalledWith({
			page: 0,
			limit: 20,
			status: undefined,
			flow: undefined,
		});
		await waitFor(() => expect(result.current.flowOptions).toEqual(['alpha', 'beta']));
		expect(result.current.executions?.total).toBe(0);
	});

	it('queries with the filters found in the URL', async () => {
		(flowDaemonService.listExecutions as Mock).mockResolvedValue(emptyResponse(100, 10, 20));

		const { result } = renderUseFlowExecutions('/flow/executions?status=failed&flow=alpha&page=2&limit=10');

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(flowDaemonService.listExecutions).toHaveBeenCalledWith({
			page: 2,
			limit: 10,
			status: 'failed',
			flow: 'alpha',
		});
	});

	it('refetches when a filter changes', async () => {
		(flowDaemonService.listExecutions as Mock).mockResolvedValue(emptyResponse(0, 20, 0));
		const { result } = renderUseFlowExecutions('/flow/executions');
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => {
			result.current.setStatus('running');
		});

		await waitFor(() =>
			expect(flowDaemonService.listExecutions).toHaveBeenLastCalledWith({
				page: 0,
				limit: 20,
				status: 'running',
				flow: undefined,
			})
		);
	});

	it('goes back to the last page when the current page is beyond the total', async () => {
		(flowDaemonService.listExecutions as Mock).mockResolvedValue(emptyResponse(25, 10, 50));

		const { result } = renderUseFlowExecutions('/flow/executions?page=5&limit=10');

		await waitFor(() => expect(result.current.filters.page).toBe(2));
	});

	it('exposes the backend error and keeps the flow options error separate', async () => {
		(flowDaemonService.listExecutions as Mock).mockRejectedValue(new Error('History directory is unreadable'));
		(flowDaemonService.listFlowIds as Mock).mockRejectedValue(new Error('Flows index is corrupted'));

		const { result } = renderUseFlowExecutions('/flow/executions');

		await waitFor(() => expect(result.current.loading).toBe(false));
		await waitFor(() => expect(result.current.flowOptionsError).toBe('Flows index is corrupted'));
		expect(result.current.error).toBe('History directory is unreadable');
		expect(result.current.executions).toBeNull();
		expect(result.current.flowOptions).toEqual([]);
	});

	it('refresh reloads both the executions and the flow options', async () => {
		(flowDaemonService.listExecutions as Mock).mockResolvedValue(emptyResponse(0, 20, 0));
		const { result } = renderUseFlowExecutions('/flow/executions');
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => {
			result.current.refresh();
		});

		await waitFor(() => expect(flowDaemonService.listExecutions).toHaveBeenCalledTimes(2));
		expect(flowDaemonService.listFlowIds).toHaveBeenCalledTimes(2);
	});
});
