import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { feedbackApi } from './feedbackApi';
import { useFlowFeedbackCount } from './useFlowFeedbackCount';

/**
 * ===========================================================================================
 * USE FLOW FEEDBACK COUNT HOOK TESTS
 * ===========================================================================================
 */

vi.mock('./feedbackApi', () => ({
	feedbackApi: {
		getFeedbackByFlow: vi.fn(),
	},
}));

vi.mock('@/hooks/useRealtimeRefresh', () => ({
	useRealtimeRefresh: vi.fn(),
}));

const baseFeedback = {
	id: 'fb-1',
	ticketId: 'ticket-1',
	flowId: 'flow-1',
	taskId: '',
	rating: 4,
	wentWell: [],
	wentWrong: [],
	author: 'user',
	submittedAt: new Date().toISOString(),
};

describe('useFlowFeedbackCount', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return count=0 and loading=false when flowId is undefined', async () => {
		const { result } = renderHook(() => useFlowFeedbackCount(undefined));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.count).toBe(0);
		expect(feedbackApi.getFeedbackByFlow).not.toHaveBeenCalled();
	});

	it('should return count=0 and loading=false when flowId is null', async () => {
		const { result } = renderHook(() => useFlowFeedbackCount(null));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.count).toBe(0);
		expect(feedbackApi.getFeedbackByFlow).not.toHaveBeenCalled();
	});

	it('should fetch feedback and return count=2 when two items exist', async () => {
		vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
			items: [baseFeedback, { ...baseFeedback, id: 'fb-2' }],
		});

		const { result } = renderHook(() => useFlowFeedbackCount('flow-1'));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.count).toBe(2);
		expect(feedbackApi.getFeedbackByFlow).toHaveBeenCalledWith('flow-1');
	});

	it('should set error when API fails', async () => {
		vi.mocked(feedbackApi.getFeedbackByFlow).mockRejectedValue(new Error('Server error'));

		const { result } = renderHook(() => useFlowFeedbackCount('flow-1'));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.count).toBe(0);
	});
});
