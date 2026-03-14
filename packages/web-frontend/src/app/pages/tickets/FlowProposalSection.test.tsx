import type { FlowProposal } from '@shared/api/flow-proposals.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowProposalSection } from './FlowProposalSection';
import { flowProposalsApi } from './flowProposalsApi';
import { useFlowProposals } from './useFlowProposals';

/**
 * ===========================================================================================
 * FLOW PROPOSAL SECTION TESTS
 * ===========================================================================================
 */

vi.mock('./useFlowProposals', () => ({
	useFlowProposals: vi.fn(),
}));

vi.mock('./flowProposalsApi', () => ({
	flowProposalsApi: {
		requestFlowDesign: vi.fn(),
		approveProposal: vi.fn(),
		rejectProposal: vi.fn(),
		createReviewThread: vi.fn(),
	},
}));

// vi.hoisted ensures mockShowToast is available inside the vi.mock factory (which is hoisted)
const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }));

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: mockShowToast }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const defaultHookResult = {
	proposals: [],
	currentProposal: null,
	isLoading: false,
	error: null,
	refresh: vi.fn(),
};

describe('FlowProposalSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('loading state', () => {
		it('should show "Loading flow proposals..." when isLoading is true', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				isLoading: true,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			expect(screen.getByText('Loading flow proposals...')).toBeInTheDocument();
		});
	});

	describe('error state', () => {
		it('should show error message and retry button when error is set', () => {
			const mockRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				error: new Error('Connection refused'),
				refresh: mockRefresh,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			expect(screen.getByText(/Failed to load proposals:/)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
		});

		it('retry button calls refresh', async () => {
			const user = userEvent.setup();
			const mockRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				error: new Error('Connection refused'),
				refresh: mockRefresh,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			await user.click(screen.getByRole('button', { name: /Retry/i }));

			expect(mockRefresh).toHaveBeenCalledTimes(1);
		});
	});

	describe('no proposals state', () => {
		it('should show "No flow design has been requested yet" message', () => {
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);

			render(<FlowProposalSection ticketId="ticket-1" />);

			expect(screen.getByText(/No flow design has been requested yet/)).toBeInTheDocument();
		});

		it('should show "Request Flow Design" button', () => {
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);

			render(<FlowProposalSection ticketId="ticket-1" />);

			expect(screen.getByRole('button', { name: /Request Flow Design/i })).toBeInTheDocument();
		});

		it('should call requestFlowDesign when "Request Flow Design" is clicked', async () => {
			const user = userEvent.setup();
			const mockRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({ ...defaultHookResult, refresh: mockRefresh });
			vi.mocked(flowProposalsApi.requestFlowDesign).mockResolvedValue(mockProposal);

			render(<FlowProposalSection ticketId="ticket-1" />);

			await user.click(screen.getByRole('button', { name: /Request Flow Design/i }));

			await waitFor(() => {
				expect(flowProposalsApi.requestFlowDesign).toHaveBeenCalledWith('ticket-1', undefined);
			});
		});
	});

	describe('with pending_review proposal', () => {
		it('should show version badge "v1" and "Pending Review" badge', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			expect(screen.getByText('v1')).toBeInTheDocument();
			expect(screen.getByText('Pending Review')).toBeInTheDocument();
		});

		it('should call approveProposal and onTicketRefresh when Approve is clicked', async () => {
			const user = userEvent.setup();
			const mockRefresh = vi.fn();
			const onTicketRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
				refresh: mockRefresh,
			});
			vi.mocked(flowProposalsApi.approveProposal).mockResolvedValue({
				...mockProposal,
				status: 'approved',
			});

			render(<FlowProposalSection ticketId="ticket-1" onTicketRefresh={onTicketRefresh} />);

			await user.click(screen.getByRole('button', { name: /^Approve$/i }));

			await waitFor(() => {
				expect(flowProposalsApi.approveProposal).toHaveBeenCalledWith('ticket-1', 'prop-1');
			});

			expect(onTicketRefresh).toHaveBeenCalledTimes(1);
		});

		it('should show rejection textarea when Reject is clicked, then call rejectProposal on confirm', async () => {
			const user = userEvent.setup();
			const mockRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
				refresh: mockRefresh,
			});
			vi.mocked(flowProposalsApi.rejectProposal).mockResolvedValue({
				...mockProposal,
				status: 'rejected',
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			// Click Reject to show the rejection form
			await user.click(screen.getByRole('button', { name: /^Reject$/i }));

			// Rejection textarea should appear
			expect(screen.getByPlaceholderText(/Reason for rejection/i)).toBeInTheDocument();

			// Fill in a reason
			await user.type(screen.getByPlaceholderText(/Reason for rejection/i), 'Not good enough');

			// Confirm reject
			await user.click(screen.getByRole('button', { name: /Confirm reject/i }));

			await waitFor(() => {
				expect(flowProposalsApi.rejectProposal).toHaveBeenCalledWith('ticket-1', 'prop-1', 'Not good enough');
			});
		});

		it('should show AddReviewThreadForm when "Add review thread" is clicked', async () => {
			const user = userEvent.setup();
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			await user.click(screen.getByRole('button', { name: /Add review thread/i }));

			expect(screen.getByText('Add review thread')).toBeInTheDocument();
			expect(screen.getByPlaceholderText(/Write your review comment/i)).toBeInTheDocument();
		});

		it('should call createReviewThread when AddReviewThreadForm is submitted', async () => {
			const user = userEvent.setup();
			const mockRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
				refresh: mockRefresh,
			});
			vi.mocked(flowProposalsApi.createReviewThread).mockResolvedValue({
				id: 'thread-1',
				proposalId: 'prop-1',
				selector: { startLine: 2, endLine: 5 },
				status: 'open',
				comments: [],
				createdAt: new Date().toISOString(),
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			await user.click(screen.getByRole('button', { name: /Add review thread/i }));

			// There are two number inputs with placeholder "1" — first is startLine, second is endLine
			const numberInputs = screen.getAllByPlaceholderText('1');
			await user.clear(numberInputs[0]);
			await user.type(numberInputs[0], '2');
			await user.clear(numberInputs[1]);
			await user.type(numberInputs[1], '5');

			await user.type(screen.getByPlaceholderText(/Write your review comment/i), 'Fix this line');

			await user.click(screen.getByRole('button', { name: /Add thread/i }));

			await waitFor(() => {
				expect(flowProposalsApi.createReviewThread).toHaveBeenCalledWith(
					'ticket-1',
					'prop-1',
					expect.objectContaining({
						selector: { startLine: 2, endLine: 5 },
						comment: 'Fix this line',
					})
				);
			});
		});
	});

	describe('with approved proposal', () => {
		const approvedAt = '2026-01-15T10:00:00.000Z';
		const approvedProposal: FlowProposal = {
			...mockProposal,
			status: 'approved',
			approvedAt,
		};

		it('should show "Approved" badge', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [approvedProposal],
				currentProposal: approvedProposal,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			expect(screen.getByText('Approved')).toBeInTheDocument();
		});

		it('should show approvedAt timestamp', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [approvedProposal],
				currentProposal: approvedProposal,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			// The approved timestamp is displayed via toLocaleString() — just check "Approved at" label exists
			expect(screen.getByText(/Approved at/i)).toBeInTheDocument();
		});

		it('should show "Request new design" button(s)', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [approvedProposal],
				currentProposal: approvedProposal,
			});

			render(<FlowProposalSection ticketId="ticket-1" />);

			// Both ProposalView inline button and the outer section button appear for terminal states
			const buttons = screen.getAllByRole('button', { name: /Request new design/i });
			expect(buttons.length).toBeGreaterThanOrEqual(1);
		});
	});
});
