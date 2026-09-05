import { MemoryRouter } from 'react-router-dom';

import type { FlowProposal } from '@shared/api/flow-proposals.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowProposalSection } from './FlowProposalSection';
import { flowProposalsApi } from './flowProposalsApi';
import { useFlowProposals } from './useFlowProposals';

/
  ===========================================================================================
  FLOW PROPOSAL SECTION TESTS
  ===========================================================================================
 /

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

// Mock useTransport -- FlowProposalSection subscribes to BF_TICKET_UPDATED (r fix)
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
	id: 'prop-',
	ticketId: 'ticket-',
	version: ,
	status: 'pending_review',
	proposedFlow: { id: 'flow-abc', name: 'Test Flow', steps: [] } as any,
	reasoning: 'This is the reasoning',
	reviewThreads: [],
	proposedAt: new Date().toISOString(),
	confidenceScore: ,
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
					<FlowProposalSection ticketId="ticket-" />
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
					<FlowProposalSection ticketId="ticket-" />
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /Retry/i }));

			expect(mockRefresh).toHaveBeenCalledTimes();
		});
	});

	describe('no proposals state', () => {
		it('should show "No flow design has been requested yet" message', () => {
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.getByText(/No flow design has been requested yet/)).toBeInTheDocument();
		});

		it('should show "Request Flow Design" button', () => {
			vi.mocked(useFlowProposals).mockReturnValue(defaultHookResult);

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /Request Flow Design/i }));

			await waitFor(() => {
				// c fix: questionsContext is now the third argument (undefined when no answers filled)
				expect(flowProposalsApi.requestFlowDesign).toHaveBeenCalledWith('ticket-', undefined, undefined);
			});
		});
	});

	describe('with pending_review proposal', () => {
		it('should show version badge "v" and "Pending Review" badge', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.getByText('v')).toBeInTheDocument();
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
					<FlowProposalSection ticketId="ticket-" onTicketRefresh={onTicketRefresh} />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /^Approve$/i }));

			await waitFor(() => {
				expect(flowProposalsApi.approveProposal).toHaveBeenCalledWith('ticket-', 'prop-');
			});

			expect(onTicketRefresh).toHaveBeenCalledTimes();
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			// Click "Reject " to show the rejection form
			await user.click(screen.getByRole('button', { name: /Reject/i }));

			// Rejection textarea should appear
			expect(screen.getByPlaceholderText(/Reason for rejection/i)).toBeInTheDocument();

			// Fill in a reason
			await user.type(screen.getByPlaceholderText(/Reason for rejection/i), 'Not good enough');

			// Confirm reject
			await user.click(screen.getByRole('button', { name: /Confirm rejection/i }));

			await waitFor(() => {
				expect(flowProposalsApi.rejectProposal).toHaveBeenCalledWith('ticket-', 'prop-', 'Not good enough');
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
					<FlowProposalSection ticketId="ticket-" />
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
				id: 'thread-',
				proposalId: 'prop-',
				selector: { startLine: , endLine:  },
				status: 'open',
				comments: [],
				createdAt: new Date().toISOString(),
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /Add review thread/i }));

			// There are two number inputs with placeholder "" -- first is startLine, second is endLine
			const numberInputs = screen.getAllByPlaceholderText('');
			await user.clear(numberInputs[]);
			await user.type(numberInputs[], '');
			await user.clear(numberInputs[]);
			await user.type(numberInputs[], '');

			await user.type(screen.getByPlaceholderText(/Write your review comment/i), 'Fix this line');

			await user.click(screen.getByRole('button', { name: /Add thread/i }));

			await waitFor(() => {
				expect(flowProposalsApi.createReviewThread).toHaveBeenCalledWith(
					'ticket-',
					'prop-',
					expect.objectContaining({
						selector: { startLine: , endLine:  },
						comment: 'Fix this line',
					})
				);
			});
		});
	});

	describe('with approved proposal', () => {
		const approvedAt = '--T::.Z';
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
					<FlowProposalSection ticketId="ticket-" />
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			// The approved timestamp is displayed via toLocaleString() -- just check "Approved at" label exists
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			// Both ProposalView inline button and the outer section button appear for terminal states
			const buttons = screen.getAllByRole('button', { name: /Request new design/i });
			expect(buttons.length).toBeGreaterThanOrEqual();
		});
	});

	// ---------------------------------------------------------------------------
	// G fix: form stays visible with blur overlay when requesting
	// ---------------------------------------------------------------------------
	describe('g -- request form blur during isRequesting', () => {
		it('form wrapper has opacity- class while request is in-flight', async () => {
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			await user.click(screen.getByRole('button', { name: /Request Flow Design/i }));

			// Blurred wrapper should have opacity- class
			expect(document.querySelector('.opacity-')).not.toBeNull();

			// Clean up
			resolveRequest();
		});
	});

	// ---------------------------------------------------------------------------
	// P fix: reject button uses ChevronRight, not 
	// ---------------------------------------------------------------------------
	describe('p -- reject button icon pattern', () => {
		it('reject button does not contain  character', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			const rejectButton = screen.getByRole('button', { name: /Reject/i });
			expect(rejectButton.textContent).not.toContain('');
		});
	});

	// ---------------------------------------------------------------------------
	// R fix: redesigning banner shown after rejection
	// ---------------------------------------------------------------------------
	describe('r -- redesigning banner after rejection', () => {
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
					<FlowProposalSection ticketId="ticket-" />
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
	// BA fix: adaptations hidden on first design (version === , no reusedFromFlowId)
	// ---------------------------------------------------------------------------
	describe('ba -- adaptations section visibility', () => {
		it('does NOT render adaptations section for first design (version=, no reusedFromFlowId)', () => {
			const firstDesignWithAdaptations: FlowProposal = {
				...mockProposal,
				version: ,
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
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.queryByText('Adaptations')).not.toBeInTheDocument();
		});

		it('DOES render adaptations section on redesign (version > )', () => {
			const redesignWithAdaptations: FlowProposal = {
				...mockProposal,
				version: ,
				adaptations: ['Changed step A per reviewer comment'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [redesignWithAdaptations],
				currentProposal: redesignWithAdaptations,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.getByText('Adaptations')).toBeInTheDocument();
		});

		it('does NOT render adaptations section when reusedFromFlowId is set but version= (ba/ce fix: version must be > )', () => {
			// ba/ce fix: reusedFromFlowId alone is not enough -- version must be > 
			const reusedVWithAdaptations: FlowProposal = {
				...mockProposal,
				version: ,
				reusedFromFlowId: 'base-flow-',
				adaptations: ['Reused base flow, adjusted inputs'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [reusedVWithAdaptations],
				currentProposal: reusedVWithAdaptations,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.queryByText('Adaptations')).not.toBeInTheDocument();
		});
	});

	// ---------------------------------------------------------------------------
	// C fix: open questions moved from tooltip to inline "Questions from the AI" section
	// ---------------------------------------------------------------------------
	describe('c -- open questions inline section', () => {
		it('confidence trigger is present without showing tooltip open questions', () => {
			const proposalWithClearReasoning: FlowProposal = {
				...mockProposal,
				confidenceScore: ,
				openQuestions: [],
				reasoning: 'The flow is straightforward. All requirements are clear. Steps were defined precisely.',
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [proposalWithClearReasoning],
				currentProposal: proposalWithClearReasoning,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.getByText(/Confidence: %/)).toBeInTheDocument();
			// No inline questions section when openQuestions is empty
			expect(screen.queryByText('Questions from the AI')).not.toBeInTheDocument();
		});

		it('shows "Questions from the AI" collapsible section when openQuestions has items', () => {
			const proposalWithQuestions: FlowProposal = {
				...mockProposal,
				confidenceScore: ,
				openQuestions: ['What auth method is required?', 'What is the expected data volume?'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [proposalWithQuestions],
				currentProposal: proposalWithQuestions,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			// The collapsible toggle must be visible
			expect(screen.getByText('Questions from the AI')).toBeInTheDocument();
		});

		it('expands "Questions from the AI" section and shows questions with answer textareas', async () => {
			const user = userEvent.setup();
			const proposalWithQuestions: FlowProposal = {
				...mockProposal,
				confidenceScore: ,
				openQuestions: ['What auth method is required?', 'What is the expected data volume?'],
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [proposalWithQuestions],
				currentProposal: proposalWithQuestions,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			// Expand the section
			await user.click(screen.getByText('Questions from the AI'));

			await waitFor(() => {
				expect(screen.getByText('What auth method is required?')).toBeInTheDocument();
				expect(screen.getByText('What is the expected data volume?')).toBeInTheDocument();
			});
		});

		it('does not show "Questions from the AI" section when openQuestions is absent', () => {
			const proposalWithNoQuestions: FlowProposal = {
				...mockProposal,
				confidenceScore: ,
				openQuestions: undefined,
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [proposalWithNoQuestions],
				currentProposal: proposalWithNoQuestions,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			expect(screen.queryByText('Questions from the AI')).not.toBeInTheDocument();
		});
	});

	// ---------------------------------------------------------------------------
	// K fix: Open in Flow Editor -- disabled for non-approved, active link when approved
	// ---------------------------------------------------------------------------
	describe('k -- open in flow editor link', () => {
		it('shows enabled "Visualize" button (not a link) for non-approved proposals', () => {
			// D fix: pending_review proposals show a "Visualize" Dialog trigger; "Open in Flow Editor"
			// link is only shown when the proposal is approved (flow registered in registry)
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [mockProposal],
				currentProposal: mockProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			// Enabled "Visualize" button is present for non-approved proposals
			const btn = screen.getByRole('button', { name: /Visualize/i });
			expect(btn).not.toBeDisabled();
			// No "Open in Flow Editor" link or button for non-approved proposals
			expect(screen.queryByRole('link', { name: /Open in Flow Editor/i })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /Open in Flow Editor/i })).not.toBeInTheDocument();
		});

		it('shows active link to /flows/{flowId}/edit when proposal is approved', () => {
			const approvedProposal: FlowProposal = {
				...mockProposal,
				status: 'approved',
				approvedAt: new Date().toISOString(),
			};
			vi.mocked(useFlowProposals).mockReturnValue({
				...defaultHookResult,
				proposals: [approvedProposal],
				currentProposal: approvedProposal,
			});

			render(
				<MemoryRouter>
					<FlowProposalSection ticketId="ticket-" />
				</MemoryRouter>
			);

			const link = screen.getByRole('link', { name: /Open in Flow Editor/i });
			expect(link.getAttribute('href')).toBe('/flows/flow-abc/edit');
		});
	});
});
