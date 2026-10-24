import { act, renderHook, waitFor } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { flowDaemonService } from '../FlowDaemonService';
import { DEFAULT_LOG_LINES, useFlowLogs } from './useFlowLogs';

vi.mock('../FlowDaemonService', () => ({
	flowDaemonService: {
		getLogs: vi.fn(),
	},
}));

const FIXED_NOW = () => new Date('2026-05-06T22:30:00.000Z');

describe('useFlowLogs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(flowDaemonService.getLogs as Mock).mockResolvedValue({
			filePath: '/logs/2026-05-06.log',
			exists: true,
			text: '12:00:00.000 [INFO] started',
			size: 28,
		});
	});

	it('defaults to the current UTC day and the default number of lines', async () => {
		const { result } = renderHook(() => useFlowLogs(FIXED_NOW));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.date).toBe('2026-05-06');
		expect(result.current.lines).toBe(DEFAULT_LOG_LINES);
		expect(flowDaemonService.getLogs).toHaveBeenCalledWith({ date: '2026-05-06', lines: DEFAULT_LOG_LINES });
		expect(result.current.logs?.text).toBe('12:00:00.000 [INFO] started');
	});

	it('refetches when the day or the number of lines changes', async () => {
		const { result } = renderHook(() => useFlowLogs(FIXED_NOW));
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => {
			result.current.setDate('2026-05-01');
		});
		await waitFor(() =>
			expect(flowDaemonService.getLogs).toHaveBeenLastCalledWith({ date: '2026-05-01', lines: DEFAULT_LOG_LINES })
		);

		act(() => {
			result.current.setLines(1000);
		});
		await waitFor(() =>
			expect(flowDaemonService.getLogs).toHaveBeenLastCalledWith({ date: '2026-05-01', lines: 1000 })
		);
	});

	it('exposes the backend error', async () => {
		(flowDaemonService.getLogs as Mock).mockRejectedValue(new Error('Log directory is not readable'));

		const { result } = renderHook(() => useFlowLogs(FIXED_NOW));

		await waitFor(() => expect(result.current.error).toBe('Log directory is not readable'));
		expect(result.current.logs).toBeNull();
	});
});
