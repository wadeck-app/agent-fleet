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
	},
}));

// vi.hoisted ensures mockShowToast is available inside the vi.mock factory (which is hoisted)
const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }));

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: mockShowToast }),
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
		it('should show "Feedback has been submitted" badge and no form', async () => {
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
				expect(screen.getByText('Feedback has been submitted for this ticket.')).toBeInTheDocument();
			});
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

			// Should go back to submitted state
			expect(screen.getByText('Feedback has been submitted for this ticket.')).toBeInTheDocument();
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
});
