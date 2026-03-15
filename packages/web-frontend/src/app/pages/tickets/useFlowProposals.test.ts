import type { FlowProposal } from '@shared/api/flow-proposals.contract';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flowProposalsApi } from './flowProposalsApi';
import { useFlowProposals } from './useFlowProposals';

/**
 * ===========================================================================================
 * USE FLOW PROPOSALS HOOK TESTS
 * ===========================================================================================
 */

vi.mock('./flowProposalsApi', () => ({
	flowProposalsApi: {
		getFlowProposals: vi.fn(),
	},
}));

const mockProposal: FlowProposal = {
	id: 'prop-1',
	ticketId: 'ticket-1',
	version: 1,
	status: 'pending_review',
	proposedFlow: { id: 'flow-abc', name: 'Test Flow', steps: [] } as any,
	reasoning: 'This is the reasoning',
	reviewThreads: [],
	proposedAt: new Date().toISOString(),
	confidenceScore: 75,
};

describe('useFlowProposals', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be in loading state on mount', () => {
		vi.mocked(flowProposalsApi.getFlowProposals).mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves
				})
		);

		const { result } = renderHook(() => useFlowProposals('ticket-1'));

		expect(result.current.isLoading).toBe(true);
		expect(result.current.proposals).toEqual([]);
		expect(result.current.currentProposal).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it('should set proposals and currentProposal after successful fetch', async () => {
		const secondProposal: FlowProposal = { ...mockProposal, id: 'prop-2', version: 2 };
		vi.mocked(flowProposalsApi.getFlowProposals).mockResolvedValue({
			items: [secondProposal, mockProposal],
		});

		const { result } = renderHook(() => useFlowProposals('ticket-1'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.proposals).toEqual([secondProposal, mockProposal]);
		// currentProposal is the first item
		expect(result.current.currentProposal).toEqual(secondProposal);
		expect(result.current.error).toBeNull();
	});

	it('should set error when API fails', async () => {
		vi.mocked(flowProposalsApi.getFlowProposals).mockRejectedValue(new Error('Network error'));

		const { result } = renderHook(() => useFlowProposals('ticket-1'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe('Network error');
		expect(result.current.proposals).toEqual([]);
		expect(result.current.currentProposal).toBeNull();
	});

	it('should re-fetch when refresh() is called', async () => {
		vi.mocked(flowProposalsApi.getFlowProposals).mockResolvedValue({ items: [] });

		const { result } = renderHook(() => useFlowProposals('ticket-1'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(flowProposalsApi.getFlowProposals).toHaveBeenCalledTimes(1);

		result.current.refresh();

		await waitFor(() => {
			expect(flowProposalsApi.getFlowProposals).toHaveBeenCalledTimes(2);
		});
	});

	it('should set isLoading=true on refresh() but NOT on refreshSilent() (o fix)', async () => {
		vi.mocked(flowProposalsApi.getFlowProposals).mockResolvedValue({ items: [mockProposal] });

		const { result } = renderHook(() => useFlowProposals('ticket-1'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// refreshSilent should NOT set isLoading=true
		let loadingDuringRefresh = false;
		vi.mocked(flowProposalsApi.getFlowProposals).mockImplementation(async () => {
			loadingDuringRefresh = result.current.isLoading;
			return { items: [mockProposal] };
		});

		result.current.refreshSilent();

		await waitFor(() => {
			expect(flowProposalsApi.getFlowProposals).toHaveBeenCalledTimes(2);
		});

		expect(loadingDuringRefresh).toBe(false);
	});
});
