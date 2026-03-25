import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowFeedbackSection } from './FlowFeedbackSection';
import { feedbackApi } from './feedbackApi';

/**
 * ===========================================================================================
 * FLOW FEEDBACK SECTION TESTS
 * ===========================================================================================
 */

vi.mock('./feedbackApi', () => ({
	feedbackApi: {
		submitFeedback: vi.fn(),
		getRetrospective: vi.fn(),
		getFeedbackByFlow: vi.fn(),
		updateFeedback: vi.fn(),
		deleteFeedback: vi.fn(),
	},
}));

// vi.hoisted ensures mockShowToast is available inside the vi.mock factory (which is hoisted)
const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }));

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: mockShowToast }),
}));

// Capture the WS subscribe callback so tests can fire simulated WS events.
// The outer variable is reassigned each time useTransport() is called during render.
let capturedWsHandler: (() => void) | null = null;
const mockSubscribe = vi.fn((_, handler: () => void) => {
	capturedWsHandler = handler;
	return () => {};
});

// FlowFeedbackSection subscribes to B2F_TICKET_FEEDBACK_SUBMITTED via useTransport
vi.mock('@/transport', () => ({
	useTransport: () => ({
		transport: {
			subscribe: mockSubscribe,
		},
	}),
}));

const SAMPLE_FEEDBACK_ITEM = {
	id: 'fb-1',
	ticketId: 'ticket-1',
	flowId: 'proposal-123',
	taskId: '',
	rating: 4,
	wentWell: [],
	wentWrong: [],
	author: 'user',
	submittedAt: new Date().toISOString(),
};

describe('FlowFeedbackSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedWsHandler = null;
		// Default: no feedback items, no retrospective
		vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({ items: [] });
		vi.mocked(feedbackApi.getRetrospective).mockRejectedValue(new Error('no retro'));
	});

	describe('when no feedback and no retrospective', () => {
		it('should show FlowFeedbackForm with "Submit Flow Execution Feedback" heading', () => {
			render(<FlowFeedbackSection ticketId="ticket-1" flowRetrospectiveId={undefined} />);

			expect(screen.getByText('Submit Flow Execution Feedback')).toBeInTheDocument();
		});
	});

	describe('when feedback already submitted and no retrospective', () => {
		it('should show feedback list and "Add another feedback" button and no form', async () => {
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			// B2 fix: the "Submitted" banner is gone — the list of feedback cards is shown instead
			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Add another feedback/i })).toBeInTheDocument();
			});
			// The new-feedback form must not be visible in the default (list) state
			expect(screen.queryByText('Submit Flow Execution Feedback')).not.toBeInTheDocument();
		});
	});

	describe('when retrospective ID is set', () => {
		it('should call getRetrospective on mount', async () => {
			vi.mocked(feedbackApi.getRetrospective).mockResolvedValue({
				id: 'retro-1',
				ticketId: 'ticket-1',
				flowId: 'flow-abc',
				taskId: 'task-xyz',
				executionSummary: 'All good',
				wentWell: [],
				wentWrong: [],
				suggestions: [],
				generatedAt: new Date().toISOString(),
			});

			render(<FlowFeedbackSection ticketId="ticket-1" flowRetrospectiveId="retro-1" />);

			await waitFor(() => {
				expect(feedbackApi.getRetrospective).toHaveBeenCalledWith('ticket-1');
			});
		});

		it('should show "Agent Retrospective" collapsible when retrospective loads', async () => {
			vi.mocked(feedbackApi.getRetrospective).mockResolvedValue({
				id: 'retro-1',
				ticketId: 'ticket-1',
				flowId: 'flow-abc',
				taskId: 'task-xyz',
				executionSummary: 'Execution was smooth',
				wentWell: ['Step A passed'],
				wentWrong: [],
				suggestions: [],
				generatedAt: new Date().toISOString(),
			});

			render(<FlowFeedbackSection ticketId="ticket-1" flowRetrospectiveId="retro-1" />);

			await waitFor(() => {
				expect(screen.getByText('Agent Retrospective')).toBeInTheDocument();
			});
		});

		it('should show error message when getRetrospective fails', async () => {
			vi.mocked(feedbackApi.getRetrospective).mockRejectedValue(new Error('Server down'));

			render(<FlowFeedbackSection ticketId="ticket-1" flowRetrospectiveId="retro-1" />);

			await waitFor(() => {
				expect(screen.getByText(/Could not load retrospective/)).toBeInTheDocument();
			});
		});
	});

	describe('FlowFeedbackForm submission', () => {
		it('should call submitFeedback with correct args and invoke onFeedbackSubmitted on success', async () => {
			const user = userEvent.setup();
			const onFeedbackSubmitted = vi.fn();

			vi.mocked(feedbackApi.submitFeedback).mockResolvedValue({
				id: 'feedback-new',
				ticketId: 'ticket-1',
				flowId: 'proposal-123',
				taskId: '',
				rating: 4,
				wentWell: [],
				wentWrong: [],
				author: 'user',
				submittedAt: new Date().toISOString(),
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
					onFeedbackSubmitted={onFeedbackSubmitted}
				/>
			);

			// Wait for loading to complete (getFeedbackByFlow returns empty → form shown)
			await waitFor(() => {
				expect(screen.getByText('Submit Flow Execution Feedback')).toBeInTheDocument();
			});

			// Click rating 4 out of 5 (only required field)
			await user.click(screen.getByRole('button', { name: /Rate 4 out of 5/i }));

			// Submit
			await user.click(screen.getByRole('button', { name: /Submit Feedback/i }));

			await waitFor(() => {
				expect(feedbackApi.submitFeedback).toHaveBeenCalledWith(
					'ticket-1',
					expect.objectContaining({
						ticketId: 'ticket-1',
						flowId: 'proposal-123',
						taskId: '',
						rating: 4,
						author: 'user',
					})
				);
			});

			expect(onFeedbackSubmitted).toHaveBeenCalledTimes(1);
		});

		it('should show toast error and NOT call onFeedbackSubmitted when API fails', async () => {
			const user = userEvent.setup();
			const onFeedbackSubmitted = vi.fn();

			vi.mocked(feedbackApi.submitFeedback).mockRejectedValue(new Error('Submit failed'));

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					onFeedbackSubmitted={onFeedbackSubmitted}
				/>
			);

			// Fill only required field: rating
			await user.click(screen.getByRole('button', { name: /Rate 3 out of 5/i }));

			await user.click(screen.getByRole('button', { name: /Submit Feedback/i }));

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith(
					expect.stringContaining('Failed to submit feedback'),
					'error'
				);
			});

			expect(onFeedbackSubmitted).not.toHaveBeenCalled();
		});

		it('should show "Add another feedback" button when feedback already submitted', async () => {
			const user = userEvent.setup();

			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Add another feedback/i })).toBeInTheDocument();
			});

			// Clicking it should reveal the form again
			await user.click(screen.getByRole('button', { name: /Add another feedback/i }));

			expect(screen.getByText('Submit Flow Execution Feedback')).toBeInTheDocument();
		});

		it('should show Cancel button after clicking "Add another feedback" (y1 fix)', async () => {
			const user = userEvent.setup();

			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Add another feedback/i })).toBeInTheDocument();
			});

			// Open the new-feedback form
			await user.click(screen.getByRole('button', { name: /Add another feedback/i }));

			// Cancel button should now be visible
			expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
		});

		it('should hide form and show submitted state when Cancel is clicked (y1 fix)', async () => {
			const user = userEvent.setup();

			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Add another feedback/i })).toBeInTheDocument();
			});

			// Open the form then cancel
			await user.click(screen.getByRole('button', { name: /Add another feedback/i }));
			await user.click(screen.getByRole('button', { name: /Cancel/i }));

			// B2 fix: after cancelling, the list state is restored —
			// the "Add another feedback" button is back and the form is hidden
			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Add another feedback/i })).toBeInTheDocument();
			});
			expect(screen.queryByText('Submit Flow Execution Feedback')).not.toBeInTheDocument();
		});

		it('should NOT show Cancel button on first-time feedback form (y1 fix)', () => {
			render(<FlowFeedbackSection ticketId="ticket-1" flowRetrospectiveId={undefined} />);

			// Cancel button must NOT be present when no feedback exists yet
			expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
		});
	});

	describe('submitted feedback display (z fix)', () => {
		it('should call getFeedbackByFlow and display submitted feedback items', async () => {
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [
					{
						id: 'fb-1',
						ticketId: 'ticket-1',
						flowId: 'proposal-123',
						taskId: '',
						rating: 4,
						wentWell: ['Step A worked'],
						wentWrong: ['Step B failed'],
						suggestions: ['Improve Step B'],
						author: 'user',
						submittedAt: new Date().toISOString(),
					},
				],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					currentFlowProposalId="proposal-123"
					flowRetrospectiveId={undefined}
				/>
			);

			await waitFor(() => {
				expect(feedbackApi.getFeedbackByFlow).toHaveBeenCalledWith('proposal-123');
			});

			await waitFor(() => {
				expect(screen.getByText('Step A worked')).toBeInTheDocument();
				expect(screen.getByText('Step B failed')).toBeInTheDocument();
				expect(screen.getByText('Improve Step B')).toBeInTheDocument();
			});
		});

		it('should not call getFeedbackByFlow when no currentFlowProposalId', () => {
			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId={undefined}
				/>
			);

			expect(feedbackApi.getFeedbackByFlow).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// e2-icons: Edit and Delete icon buttons
	// ---------------------------------------------------------------------------
	describe('e2-icons — edit and delete icon buttons', () => {
		it('should show Edit and Delete icon buttons on each feedback card', async () => {
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Edit feedback/i })).toBeInTheDocument();
				expect(screen.getByRole('button', { name: /Delete feedback/i })).toBeInTheDocument();
			});
		});

		it('should open edit form when Edit icon button is clicked', async () => {
			const user = userEvent.setup();
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Edit feedback/i })).toBeInTheDocument();
			});

			await user.click(screen.getByRole('button', { name: /Edit feedback/i }));

			expect(screen.getByText('Edit Feedback')).toBeInTheDocument();
		});
	});

	// ---------------------------------------------------------------------------
	// e2-save: optimistic update on save
	// ---------------------------------------------------------------------------
	describe('e2-save — optimistic update on save', () => {
		it('should call updateFeedback and show success toast on save', async () => {
			const user = userEvent.setup();
			const updatedItem = { ...SAMPLE_FEEDBACK_ITEM, rating: 5 };
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});
			vi.mocked(feedbackApi.updateFeedback).mockResolvedValue(updatedItem);

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Edit feedback/i })).toBeInTheDocument();
			});

			await user.click(screen.getByRole('button', { name: /Edit feedback/i }));
			await user.click(screen.getByRole('button', { name: /Save/i }));

			await waitFor(() => {
				expect(feedbackApi.updateFeedback).toHaveBeenCalledWith(
					SAMPLE_FEEDBACK_ITEM.id,
					expect.objectContaining({ rating: 4 })
				);
			});

			expect(mockShowToast).toHaveBeenCalledWith('Feedback updated', 'success');
		});

		it('should show error toast and rollback on save failure', async () => {
			const user = userEvent.setup();
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});
			vi.mocked(feedbackApi.updateFeedback).mockRejectedValue(new Error('Update failed'));

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Edit feedback/i })).toBeInTheDocument();
			});

			await user.click(screen.getByRole('button', { name: /Edit feedback/i }));
			await user.click(screen.getByRole('button', { name: /Save/i }));

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith(
					expect.stringContaining('Failed to update feedback'),
					'error'
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// e2-delete-confirmed: optimistic delete
	// ---------------------------------------------------------------------------
	describe('e2-delete-confirmed — optimistic delete', () => {
		it('should call deleteFeedback and show success toast on delete confirm', async () => {
			const user = userEvent.setup();
			vi.mocked(feedbackApi.getFeedbackByFlow).mockResolvedValue({
				items: [SAMPLE_FEEDBACK_ITEM],
			});
			vi.mocked(feedbackApi.deleteFeedback).mockResolvedValue(undefined);

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			// Wait for feedback cards to load
			await waitFor(() => {
				expect(screen.getByRole('button', { name: /Delete feedback/i })).toBeInTheDocument();
			});

			// Click the delete icon button to open the AlertDialogWrapper
			await user.click(screen.getByRole('button', { name: /Delete feedback/i }));

			// Confirm deletion in the AlertDialog
			const confirmButton = await screen.findByRole('button', { name: /^Delete$/i });
			await user.click(confirmButton);

			await waitFor(() => {
				expect(feedbackApi.deleteFeedback).toHaveBeenCalledWith(SAMPLE_FEEDBACK_ITEM.id);
			});

			expect(mockShowToast).toHaveBeenCalledWith('Feedback deleted', 'success');
		});
	});

	// ---------------------------------------------------------------------------
	// gf: WS re-fetch guard — pendingMutations counter
	// ---------------------------------------------------------------------------
	describe('gf — WS re-fetch suppressed while local mutation is in flight', () => {
		it('should NOT call getFeedbackByFlow when WS event fires during a pending submit', async () => {
			const user = userEvent.setup();

			// Delay submitFeedback so the mutation is still in-flight when we fire the WS event
			let resolveSubmit!: (value: {
				id: string;
				ticketId: string;
				flowId: string;
				taskId: string;
				rating: number;
				wentWell: string[];
				wentWrong: string[];
				author: string;
				submittedAt: string;
			}) => void;
			vi.mocked(feedbackApi.submitFeedback).mockReturnValue(
				new Promise(resolve => {
					resolveSubmit = resolve;
				})
			);

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowRetrospectiveId={undefined}
					currentFlowProposalId="proposal-123"
				/>
			);

			// Wait for initial load (1 call for getFeedbackByFlow)
			await waitFor(() => {
				expect(screen.getByText('Submit Flow Execution Feedback')).toBeInTheDocument();
			});

			const initialCallCount = vi.mocked(feedbackApi.getFeedbackByFlow).mock.calls.length;

			// Start the submit (mutation is now in-flight, pendingMutations === 1)
			await user.click(screen.getByRole('button', { name: /Rate 4 out of 5/i }));
			await user.click(screen.getByRole('button', { name: /Submit Feedback/i }));

			// Fire the WS event while the submit is still pending
			expect(capturedWsHandler).not.toBeNull();
			capturedWsHandler!();

			// WS guard should suppress the re-fetch — call count must not increase
			expect(vi.mocked(feedbackApi.getFeedbackByFlow).mock.calls.length).toBe(initialCallCount);

			// Resolve the submit so the mutation completes
			resolveSubmit({
				id: 'new-fb',
				ticketId: 'ticket-1',
				flowId: 'proposal-123',
				taskId: '',
				rating: 4,
				wentWell: [],
				wentWrong: [],
				author: 'user',
				submittedAt: new Date().toISOString(),
			});

			// After the mutation finishes, a new WS event from another user SHOULD trigger re-fetch
			await waitFor(() => {
				// pendingMutations is back to 0 — firing WS event now should call getFeedbackByFlow
				capturedWsHandler!();
				expect(vi.mocked(feedbackApi.getFeedbackByFlow).mock.calls.length).toBeGreaterThan(initialCallCount);
			});
		});
	});
});
