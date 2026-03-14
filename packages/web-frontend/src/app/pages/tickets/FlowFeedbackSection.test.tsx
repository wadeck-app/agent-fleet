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
	},
}));

// vi.hoisted ensures mockShowToast is available inside the vi.mock factory (which is hoisted)
const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }));

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: mockShowToast }),
}));

describe('FlowFeedbackSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('when no feedback and no retrospective', () => {
		it('should show FlowFeedbackForm with "Submit Flow Execution Feedback" heading', () => {
			render(
				<FlowFeedbackSection ticketId="ticket-1" flowFeedbackId={undefined} flowRetrospectiveId={undefined} />
			);

			expect(screen.getByText('Submit Flow Execution Feedback')).toBeInTheDocument();
		});
	});

	describe('when feedback already submitted and no retrospective', () => {
		it('should show "Feedback has been submitted" badge and no form', () => {
			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowFeedbackId="feedback-123"
					flowRetrospectiveId={undefined}
				/>
			);

			expect(screen.getByText('Feedback has been submitted for this ticket.')).toBeInTheDocument();
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

			render(
				<FlowFeedbackSection ticketId="ticket-1" flowFeedbackId={undefined} flowRetrospectiveId="retro-1" />
			);

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

			render(
				<FlowFeedbackSection ticketId="ticket-1" flowFeedbackId={undefined} flowRetrospectiveId="retro-1" />
			);

			await waitFor(() => {
				expect(screen.getByText('Agent Retrospective')).toBeInTheDocument();
			});
		});

		it('should show error message when getRetrospective fails', async () => {
			vi.mocked(feedbackApi.getRetrospective).mockRejectedValue(new Error('Server down'));

			render(
				<FlowFeedbackSection ticketId="ticket-1" flowFeedbackId={undefined} flowRetrospectiveId="retro-1" />
			);

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
				flowId: 'flow-abc',
				taskId: 'task-xyz',
				rating: 4,
				wentWell: [],
				wentWrong: [],
				author: 'Alice',
				submittedAt: new Date().toISOString(),
			});

			render(
				<FlowFeedbackSection
					ticketId="ticket-1"
					flowFeedbackId={undefined}
					flowRetrospectiveId={undefined}
					onFeedbackSubmitted={onFeedbackSubmitted}
				/>
			);

			// Click rating 4 out of 5
			await user.click(screen.getByRole('button', { name: /Rate 4 out of 5/i }));

			// Fill author
			await user.type(screen.getByRole('textbox', { name: /Author/i }), 'Alice');

			// Fill flow ID
			await user.type(screen.getByRole('textbox', { name: /Flow ID/i }), 'flow-abc');

			// Fill task ID
			await user.type(screen.getByRole('textbox', { name: /Task ID/i }), 'task-xyz');

			// Submit
			await user.click(screen.getByRole('button', { name: /Submit Feedback/i }));

			await waitFor(() => {
				expect(feedbackApi.submitFeedback).toHaveBeenCalledWith(
					'ticket-1',
					expect.objectContaining({
						ticketId: 'ticket-1',
						flowId: 'flow-abc',
						taskId: 'task-xyz',
						rating: 4,
						author: 'Alice',
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
					flowFeedbackId={undefined}
					flowRetrospectiveId={undefined}
					onFeedbackSubmitted={onFeedbackSubmitted}
				/>
			);

			// Fill required fields
			await user.click(screen.getByRole('button', { name: /Rate 3 out of 5/i }));
			await user.type(screen.getByRole('textbox', { name: /Author/i }), 'Bob');
			await user.type(screen.getByRole('textbox', { name: /Flow ID/i }), 'flow-1');
			await user.type(screen.getByRole('textbox', { name: /Task ID/i }), 'task-1');

			await user.click(screen.getByRole('button', { name: /Submit Feedback/i }));

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith(
					expect.stringContaining('Failed to submit feedback'),
					'error'
				);
			});

			expect(onFeedbackSubmitted).not.toHaveBeenCalled();
		});
	});
});
