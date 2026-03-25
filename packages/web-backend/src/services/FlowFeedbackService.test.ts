import { describe, expect, it, vi } from 'vitest';

import type { FlowFeedback, FlowRetrospective } from '@app/shared/api/flow-feedback.contract';
import { NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { FlowFeedbackRepository } from '../repositories/FlowFeedbackRepository';
import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { FlowFeedbackService } from './FlowFeedbackService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicketsRepoStub(tickets: Record<string, any> = {}) {
	return {
		findById: vi.fn(async (id: string) => tickets[id] ?? null),
		update: vi.fn(async (_id: string, _data: any) => ({})),
		addHistoryEntry: vi.fn(async () => ({
			id: 'hist-1',
			ticketId: 'any',
			event: 'flow.feedback_submitted',
			timestamp: new Date().toISOString(),
			data: {},
		})),
	} as unknown as TicketsRepository;
}

function makeFlowFeedbackRepoStub(existingFeedback?: FlowFeedback) {
	return {
		create: vi.fn(async (f: FlowFeedback) => ({ ...f, id: f.id ?? 'generated-id' })),
		findById: vi.fn(async (id: string) => (existingFeedback?.id === id ? existingFeedback : null)),
		findByTicketId: vi.fn(async () => []),
		findByFlowId: vi.fn(async () => []),
		update: vi.fn(async (id: string, data: Partial<FlowFeedback>) => ({ ...existingFeedback, ...data, id })),
		delete: vi.fn(async () => undefined),
		createRetrospective: vi.fn(async (r: FlowRetrospective) => ({
			...r,
			id: r.id ?? 'generated-retro-id',
		})),
		findRetrospectiveByTicketId: vi.fn(async () => null),
	} as unknown as FlowFeedbackRepository;
}

function makeEventBroadcasterStub(): EventBroadcaster {
	return { broadcast: vi.fn() } as unknown as EventBroadcaster;
}

function makeService(
	feedbackRepo: FlowFeedbackRepository,
	ticketsRepo: TicketsRepository,
	eventBroadcaster: EventBroadcaster = makeEventBroadcasterStub()
) {
	return new FlowFeedbackService(feedbackRepo, ticketsRepo, eventBroadcaster);
}

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const TICKET_ID = 'ticket-abc';
const FLOW_ID = 'flow-xyz';
const TASK_ID = 'task-123';

const existingTicket = {
	id: TICKET_ID,
	projectId: 'proj-1',
	title: 'Test ticket',
	status: 'in_progress',
};

const createFeedbackData = {
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	rating: 4,
	wentWell: ['Good step 1'],
	wentWrong: [],
	author: 'tester',
};

const createRetroData = {
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	wentWell: ['step A'],
	wentWrong: ['step B'],
	suggestions: ['improvement'],
	executionSummary: 'Flow ran successfully with minor issues.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowFeedbackService', () => {
	describe('submitFeedback', () => {
		it('creates feedback, adds history entry, and updates ticket', async () => {
			const ticketsRepo = makeTicketsRepoStub({ [TICKET_ID]: existingTicket });
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const service = makeService(feedbackRepo, ticketsRepo);

			const result = await service.submitFeedback(TICKET_ID, createFeedbackData);

			// Feedback was persisted
			expect(feedbackRepo.create).toHaveBeenCalledOnce();
			// Should contain the submitted data
			expect(result.rating).toBe(4);
			expect(result.wentWell).toEqual(['Good step 1']);
			// ID and timestamp auto-generated
			expect(result.id).toBeTruthy();
			expect(result.submittedAt).toBeTruthy();

			// History entry appended with full feedback content and author (items AA+AB)
			expect(ticketsRepo.addHistoryEntry).toHaveBeenCalledWith(
				TICKET_ID,
				'flow.feedback_submitted',
				expect.objectContaining({
					feedbackId: expect.any(String),
					rating: 4,
					wentWell: ['Good step 1'],
					wentWrong: [],
					suggestions: [],
				}),
				'tester'
			);

			// Ticket updated with feedbackId
			expect(ticketsRepo.update).toHaveBeenCalledWith(
				TICKET_ID,
				expect.objectContaining({ flowFeedbackId: expect.any(String) })
			);
		});

		it('emits b2f:ticket:feedback_submitted event after saving feedback', async () => {
			const ticketsRepo = makeTicketsRepoStub({ [TICKET_ID]: existingTicket });
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const broadcaster = makeEventBroadcasterStub();
			const service = makeService(feedbackRepo, ticketsRepo, broadcaster);

			const result = await service.submitFeedback(TICKET_ID, createFeedbackData);

			expect(broadcaster.broadcast).toHaveBeenCalledOnce();
			expect(broadcaster.broadcast).toHaveBeenCalledWith('b2f:ticket:feedback_submitted', {
				ticketId: TICKET_ID,
				feedbackId: result.id,
				rating: result.rating,
			});
		});

		it('throws NotFoundException when ticket does not exist', async () => {
			const ticketsRepo = makeTicketsRepoStub({});
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const service = makeService(feedbackRepo, ticketsRepo);

			await expect(service.submitFeedback('missing', createFeedbackData)).rejects.toThrow(NotFoundException);

			// Nothing should have been persisted
			expect(feedbackRepo.create).not.toHaveBeenCalled();
		});
	});

	describe('submitRetrospective', () => {
		it('creates retrospective, adds history entry, and updates ticket', async () => {
			const ticketsRepo = makeTicketsRepoStub({ [TICKET_ID]: existingTicket });
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const service = makeService(feedbackRepo, ticketsRepo);

			const result = await service.submitRetrospective(TICKET_ID, createRetroData);

			// Retrospective was persisted
			expect(feedbackRepo.createRetrospective).toHaveBeenCalledOnce();
			expect(result.executionSummary).toBe('Flow ran successfully with minor issues.');
			// Auto-generated fields
			expect(result.id).toBeTruthy();
			expect(result.generatedAt).toBeTruthy();

			// History entry
			expect(ticketsRepo.addHistoryEntry).toHaveBeenCalledWith(
				TICKET_ID,
				'flow.retrospective_generated',
				expect.objectContaining({ retroId: expect.any(String) })
			);

			// Ticket updated
			expect(ticketsRepo.update).toHaveBeenCalledWith(
				TICKET_ID,
				expect.objectContaining({ flowRetrospectiveId: expect.any(String) })
			);
		});

		it('throws NotFoundException when ticket does not exist', async () => {
			const ticketsRepo = makeTicketsRepoStub({});
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const service = makeService(feedbackRepo, ticketsRepo);

			await expect(service.submitRetrospective('ghost', createRetroData)).rejects.toThrow(NotFoundException);

			expect(feedbackRepo.createRetrospective).not.toHaveBeenCalled();
		});
	});

	describe('getFeedbackForFlow', () => {
		it('returns items from repository', async () => {
			const mockFeedback = [{ id: 'fb-1', flowId: FLOW_ID } as FlowFeedback];
			const ticketsRepo = makeTicketsRepoStub({});
			const feedbackRepo = makeFlowFeedbackRepoStub();
			(feedbackRepo.findByFlowId as ReturnType<typeof vi.fn>).mockResolvedValue(mockFeedback);
			const service = makeService(feedbackRepo, ticketsRepo);

			const result = await service.getFeedbackForFlow(FLOW_ID);

			expect(result.items).toEqual(mockFeedback);
			expect(feedbackRepo.findByFlowId).toHaveBeenCalledWith(FLOW_ID);
		});

		it('returns empty items array when no feedback exists', async () => {
			const service = makeService(makeFlowFeedbackRepoStub(), makeTicketsRepoStub({}));

			const result = await service.getFeedbackForFlow('no-flow');
			expect(result).toEqual({ items: [] });
		});
	});

	describe('getRetrospective', () => {
		it('returns retrospective when it exists', async () => {
			const mockRetro: FlowRetrospective = {
				id: 'retro-1',
				ticketId: TICKET_ID,
				flowId: FLOW_ID,
				taskId: TASK_ID,
				wentWell: [],
				wentWrong: [],
				suggestions: [],
				executionSummary: 'OK',
				generatedAt: new Date().toISOString(),
			};
			const feedbackRepo = makeFlowFeedbackRepoStub();
			(feedbackRepo.findRetrospectiveByTicketId as ReturnType<typeof vi.fn>).mockResolvedValue(mockRetro);
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}));

			const result = await service.getRetrospective(TICKET_ID);

			expect(result).toEqual(mockRetro);
		});

		it('throws NotFoundException when no retrospective exists', async () => {
			const service = makeService(makeFlowFeedbackRepoStub(), makeTicketsRepoStub({}));

			await expect(service.getRetrospective('no-ticket')).rejects.toThrow(NotFoundException);
		});
	});

	describe('updateFeedback', () => {
		const existingFeedback: FlowFeedback = {
			id: 'fb-1',
			ticketId: TICKET_ID,
			flowId: FLOW_ID,
			taskId: TASK_ID,
			rating: 3,
			wentWell: ['old'],
			wentWrong: [],
			submittedAt: '2024-01-01T00:00:00.000Z',
			author: 'tester',
		};

		it('updates the feedback and returns the updated record', async () => {
			const feedbackRepo = makeFlowFeedbackRepoStub(existingFeedback);
			const broadcaster = makeEventBroadcasterStub();
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}), broadcaster);

			const result = await service.updateFeedback('fb-1', { rating: 5, wentWell: ['new'] });

			expect(feedbackRepo.findById).toHaveBeenCalledWith('fb-1');
			expect(feedbackRepo.update).toHaveBeenCalledWith('fb-1', { rating: 5, wentWell: ['new'] });
			expect(result).toMatchObject({ id: 'fb-1', rating: 5, wentWell: ['new'] });
		});

		it('emits b2f:ticket:feedback_submitted event after update', async () => {
			const feedbackRepo = makeFlowFeedbackRepoStub(existingFeedback);
			const broadcaster = makeEventBroadcasterStub();
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}), broadcaster);

			await service.updateFeedback('fb-1', { rating: 5 });

			expect(broadcaster.broadcast).toHaveBeenCalledOnce();
			expect(broadcaster.broadcast).toHaveBeenCalledWith('b2f:ticket:feedback_submitted', {
				ticketId: TICKET_ID,
				feedbackId: 'fb-1',
				rating: 5,
			});
		});

		it('throws NotFoundException when feedback does not exist', async () => {
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}));

			await expect(service.updateFeedback('missing', { rating: 5 })).rejects.toThrow(NotFoundException);
			expect(feedbackRepo.update).not.toHaveBeenCalled();
		});
	});

	describe('deleteFeedback', () => {
		const existingFeedback: FlowFeedback = {
			id: 'fb-1',
			ticketId: TICKET_ID,
			flowId: FLOW_ID,
			taskId: TASK_ID,
			rating: 4,
			wentWell: ['step 1'],
			wentWrong: [],
			submittedAt: '2024-01-01T00:00:00.000Z',
			author: 'tester',
		};

		it('deletes the feedback by ID', async () => {
			const feedbackRepo = makeFlowFeedbackRepoStub(existingFeedback);
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}));

			await service.deleteFeedback('fb-1');

			expect(feedbackRepo.findById).toHaveBeenCalledWith('fb-1');
			expect(feedbackRepo.delete).toHaveBeenCalledWith('fb-1');
		});

		it('emits b2f:ticket:feedback_submitted event after delete', async () => {
			const feedbackRepo = makeFlowFeedbackRepoStub(existingFeedback);
			const broadcaster = makeEventBroadcasterStub();
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}), broadcaster);

			await service.deleteFeedback('fb-1');

			expect(broadcaster.broadcast).toHaveBeenCalledOnce();
			expect(broadcaster.broadcast).toHaveBeenCalledWith('b2f:ticket:feedback_submitted', {
				ticketId: TICKET_ID,
				feedbackId: 'fb-1',
				rating: 4,
				deleted: true,
			});
		});

		it('throws NotFoundException when feedback does not exist', async () => {
			const feedbackRepo = makeFlowFeedbackRepoStub();
			const service = makeService(feedbackRepo, makeTicketsRepoStub({}));

			await expect(service.deleteFeedback('missing')).rejects.toThrow(NotFoundException);
			expect(feedbackRepo.delete).not.toHaveBeenCalled();
		});
	});
});
