import { act, renderHook, waitFor } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { flowDaemonService } from '../FlowDaemonService';
import { buildExecutionLogs } from '../flowDaemonFixtures';
import { useFlowExecutionLogs } from './useFlowExecutionLogs';

vi.mock('../FlowDaemonService', () => ({
	flowDaemonService: {
		getExecutionLogs: vi.fn(),
	},
}));

const baseParams = { executionId: 'e1', step: undefined, level: undefined, q: '', page: 0, limit: 100 };

describe('useFlowExecutionLogs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(flowDaemonService.getExecutionLogs as Mock).mockResolvedValue(buildExecutionLogs({ total: 5 }));
	});

	it('loads the tail without filter', async () => {
		const { result } = renderHook(() => useFlowExecutionLogs('e1'));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(flowDaemonService.getExecutionLogs).toHaveBeenCalledWith(baseParams);
		expect(result.current.hasActiveFilter).toBe(false);
		expect(result.current.logs?.total).toBe(5);
	});

	it('starts on the requested step', async () => {
		const { result } = renderHook(() => useFlowExecutionLogs('e1', 'compile'));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(flowDaemonService.getExecutionLogs).toHaveBeenCalledWith({ ...baseParams, step: 'compile' });
		expect(result.current.hasActiveFilter).toBe(true);
	});

	it('refetches with the step and level filters', async () => {
		const { result } = renderHook(() => useFlowExecutionLogs('e1'));
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => {
			result.current.setStep('__execution');
			result.current.setLevel('error');
		});

		await waitFor(() =>
			expect(flowDaemonService.getExecutionLogs).toHaveBeenLastCalledWith({
				...baseParams,
				step: '__execution',
				level: 'error',
			})
		);
	});

	it('sends the text filter only once typing paused, and never with the stale page', async () => {
		const { result } = renderHook(() => useFlowExecutionLogs('e1'));
		await waitFor(() => expect(result.current.loading).toBe(false));
		act(() => {
			result.current.setPage(2);
		});
		await waitFor(() =>
			expect(flowDaemonService.getExecutionLogs).toHaveBeenLastCalledWith({ ...baseParams, page: 2 })
		);
		const callsBefore = (flowDaemonService.getExecutionLogs as Mock).mock.calls.length;

		act(() => {
			result.current.setSearchText('time');
			result.current.setSearchText('timeout');
		});

		// Typing alone does not request anything
		expect(result.current.searchText).toBe('timeout');
		expect(flowDaemonService.getExecutionLogs).toHaveBeenCalledTimes(callsBefore);
		await waitFor(() =>
			expect(flowDaemonService.getExecutionLogs).toHaveBeenLastCalledWith({ ...baseParams, q: 'timeout' })
		);
		expect(flowDaemonService.getExecutionLogs).toHaveBeenCalledTimes(callsBefore + 1);
		expect(result.current.page).toBe(0);
	});

	it('goes back to the tail when a filter changes', async () => {
		const { result } = renderHook(() => useFlowExecutionLogs('e1'));
		await waitFor(() => expect(result.current.loading).toBe(false));
		act(() => {
			result.current.setPage(3);
		});
		expect(result.current.page).toBe(3);

		act(() => {
			result.current.setLevel('warning');
		});

		expect(result.current.page).toBe(0);
		await waitFor(() =>
			expect(flowDaemonService.getExecutionLogs).toHaveBeenLastCalledWith({
				...baseParams,
				level: 'warning',
				page: 0,
			})
		);
	});

	it('exposes the backend error', async () => {
		(flowDaemonService.getExecutionLogs as Mock).mockRejectedValue(new Error('Execution log directory unreadable'));

		const { result } = renderHook(() => useFlowExecutionLogs('e1'));

		await waitFor(() => expect(result.current.error).toBe('Execution log directory unreadable'));
		expect(result.current.logs).toBeNull();
	});
});
