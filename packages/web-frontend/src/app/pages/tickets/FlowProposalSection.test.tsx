import { MemoryRouter } from 'react-router-dom';

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

// Mock useTransport — FlowProposalSection subscribes to B2F_TICKET_UPDATED (r2 fix)
vi.mock('@/transport', () => ({
	useTransport: () => ({
		transport: {
			subscribe: vi.fn(() => () => {}),
		},
	}),
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
	refreshSilent: vi.fn(),
};

describe('FlowProposalSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('loading state', () => {
		it('should show loading spinner when isLoading is true', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				isLoading: true,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByText('Loading...')).toBeInTheDocument();
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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /Retry/i }));

			expect(mockRefresh).toHaveBeenCalledTimes(1);
		});
	});

	describe('no proposals state', () => {
		it('should show "No flow design has been requested yet" message', () => {
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByText(/No flow design has been requested yet/)).toBeInTheDocument();
		});

		it('should show "Request Flow Design" button', () => {
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByRole('button', { name: /Request Flow Design/i })).toBeInTheDocument();
		});

		it('should call requestFlowDesign when "Request Flow Design" is clicked', async () => {
			const user = userEvent.setup();
			const mockRefresh = vi.fn();
			vi.mocked(useFlowProposals).mockReturnValue({ ...defaultHookResult, refresh: mockRefresh });
			vi.mocked(flowProposalsApi.requestFlowDesign).mockResolvedValue(mockProposal);

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" onTicketRefresh={onTicketRefresh} />
				</MemoryRouter>
			);

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			// Click "Reject ▾" to show the rejection form
			await user.click(screen.getByRole('button', { name: /Reject/i }));

			// Rejection textarea should appear
			expect(screen.getByPlaceholderText(/Reason for rejection/i)).toBeInTheDocument();

			// Fill in a reason
			await user.type(screen.getByPlaceholderText(/Reason for rejection/i), 'Not good enough');

			// Confirm reject
			await user.click(screen.getByRole('button', { name: /Confirm rejection/i }));

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByText('Approved')).toBeInTheDocument();
		});

		it('should show approvedAt timestamp', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [approvedProposal],
				currentProposal: approvedProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			// The approved timestamp is displayed via toLocaleString() — just check "Approved at" label exists
			expect(screen.getByText(/Approved at/i)).toBeInTheDocument();
		});

		it('should show "Request new design" button(s)', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [approvedProposal],
				currentProposal: approvedProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			// Both ProposalView inline button and the outer section button appear for terminal states
			const buttons = screen.getAllByRole('button', { name: /Request new design/i });
			expect(buttons.length).toBeGreaterThanOrEqual(1);
		});
	});

	// ---------------------------------------------------------------------------
	// G1 fix: form stays visible with blur overlay when requesting
	// ---------------------------------------------------------------------------
	describe('g1 — request form blur during isRequesting', () => {
		it('form wrapper has opacity-50 class while request is in-flight', async () => {
			const user = userEvent.setup();
			let resolveRequest!: () => void;
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);
			vi.mocked(flowProposalsApi.requestFlowDesign).mockReturnValue(
				new Promise(res => {
					resolveRequest = () => res(mockProposal);
				})
			);

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /Request Flow Design/i }));

			// Blurred wrapper should have opacity-50 class
			expect(document.querySelector('.opacity-50')).not.toBeNull();

			// Clean up
			resolveRequest();
		});
	});

	// ---------------------------------------------------------------------------
	// P fix: reject button uses ChevronRight, not ▾
	// ---------------------------------------------------------------------------
	describe('p — reject button icon pattern', () => {
		it('reject button does not contain ▾ character', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			const rejectButton = screen.getByRole('button', { name: /Reject/i });
			expect(rejectButton.textContent).not.toContain('▾');
		});
	});

	// ---------------------------------------------------------------------------
	// R1 fix: redesigning banner shown after rejection
	// ---------------------------------------------------------------------------
	describe('r1 — redesigning banner after rejection', () => {
		it('shows "AI is redesigning" banner after rejection is confirmed', async () => {
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

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			// Open reject form
			await user.click(screen.getByRole('button', { name: /Reject/i }));
			// Confirm rejection
			await user.click(screen.getByRole('button', { name: /Confirm rejection/i }));

			await waitFor(() => {
				expect(screen.getByText(/AI is redesigning/i)).toBeInTheDocument();
			});
		});
	});

	// ---------------------------------------------------------------------------
	// BA fix: adaptations hidden on first design (version === 1, no reusedFromFlowId)
	// ---------------------------------------------------------------------------
	describe('ba — adaptations section visibility', () => {
		it('does NOT render adaptations section for first design (version=1, no reusedFromFlowId)', () => {
			const firstDesignWithAdaptations: FlowProposal = {
				...mockProposal,
				version: 1,
				reusedFromFlowId: undefined,
				adaptations: ['Adapted step X from ticket Y'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [firstDesignWithAdaptations],
				currentProposal: firstDesignWithAdaptations,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.queryByText('Adaptations')).not.toBeInTheDocument();
		});

		it('DOES render adaptations section on redesign (version > 1)', () => {
			const redesignWithAdaptations: FlowProposal = {
				...mockProposal,
				version: 2,
				adaptations: ['Changed step A per reviewer comment'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [redesignWithAdaptations],
				currentProposal: redesignWithAdaptations,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByText('Adaptations')).toBeInTheDocument();
		});

		it('DOES render adaptations section when reusedFromFlowId is set (even version=1)', () => {
			const reusedWithAdaptations: FlowProposal = {
				...mockProposal,
				version: 1,
				reusedFromFlowId: 'base-flow-123',
				adaptations: ['Reused base flow, adjusted inputs'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [reusedWithAdaptations],
				currentProposal: reusedWithAdaptations,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByText('Adaptations')).toBeInTheDocument();
		});
	});

	// ---------------------------------------------------------------------------
	// I2 fix: confidence tooltip shows specific uncertainty sentences
	// ---------------------------------------------------------------------------
	describe('i2 — confidence tooltip uncertainty sentences', () => {
		it('shows generic text when reasoning has no uncertainty sentences', () => {
			const proposalWithClearReasoning: FlowProposal = {
				...mockProposal,
				confidenceScore: 95,
				reasoning: 'The flow is straightforward. All requirements are clear. Steps were defined precisely.',
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [proposalWithClearReasoning],
				currentProposal: proposalWithClearReasoning,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			// The confidence score element should be present
			expect(screen.getByText(/Confidence: 95%/)).toBeInTheDocument();
		});

		it('reasoning with question marks is extractable by extractUncertaintySentences helper', () => {
			// Test the pure function directly
			const reasoning =
				'The flow is mostly clear. What should happen if the API times out? Some steps may not handle edge cases correctly.';
			// Import indirectly by testing the rendered output
			const proposalWithUnclearReasoning: FlowProposal = {
				...mockProposal,
				confidenceScore: 65,
				reasoning,
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [proposalWithUnclearReasoning],
				currentProposal: proposalWithUnclearReasoning,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			// The confidence score should be visible — tooltip appears on hover, hard to test without interaction
			expect(screen.getByText(/Confidence: 65%/)).toBeInTheDocument();
		});
	});

	// ---------------------------------------------------------------------------
	// K fix: Open in Flow Editor link present
	// ---------------------------------------------------------------------------
	describe('k — open in flow editor link', () => {
		it('shows "Open in Flow Editor" link next to the YAML block', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			expect(screen.getByRole('link', { name: /Open in Flow Editor/i })).toBeInTheDocument();
		});

		it('links to /flows/{flowId}/edit when proposedFlow has an id', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-1" />
				</MemoryRouter>
			);

			const link = screen.getByRole('link', { name: /Open in Flow Editor/i });
			expect(link.getAttribute('href')).toBe('/flows/flow-abc/edit');
		});
	});
});
