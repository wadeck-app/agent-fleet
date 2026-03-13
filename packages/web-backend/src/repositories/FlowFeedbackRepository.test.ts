import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowFeedback, FlowRetrospective } from '@app/shared/api/flow-feedback.contract';

import { InMemoryStorage } from '../storage/InMemoryStorage';
import { BaseRepository } from './BaseRepository';
import { FlowFeedbackRepository } from './FlowFeedbackRepository';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeRepository(): FlowFeedbackRepository {
	const storage = new InMemoryStorage();
	// StoredFlowFeedback / StoredFlowRetrospective are internal types in FlowFeedbackRepository.
	// Casting to `any` here is intentional — InMemoryStorage satisfies the constraint at runtime.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const feedbackBase = new BaseRepository<any>('flow-feedback', storage);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const retroBase = new BaseRepository<any>('flow-retrospectives', storage);
	return new FlowFeedbackRepository(feedbackBase, retroBase);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TICKET_A = 'ticket-aaa';
const TICKET_B = 'ticket-bbb';
const FLOW_1 = 'flow-001';
const FLOW_2 = 'flow-002';
const TASK_1 = 'task-t1';

function makeFeedback(overrides: Partial<FlowFeedback> = {}): FlowFeedback {
	return {
		id: 'fb-1',
		ticketId: TICKET_A,
		flowId: FLOW_1,
		taskId: TASK_1,
		rating: 4,
		wentWell: ['step 1 was great'],
		wentWrong: [],
		submittedAt: '2024-01-01T00:00:00.000Z',
		author: 'tester',
		...overrides,
	};
}

function makeRetrospective(overrides: Partial<FlowRetrospective> = {}): FlowRetrospective {
	return {
		id: 'retro-1',
		ticketId: TICKET_A,
		flowId: FLOW_1,
		taskId: TASK_1,
		wentWell: ['step A'],
		wentWrong: ['step B'],
		suggestions: ['improvement X'],
		executionSummary: 'Flow ran successfully with minor issues.',
		generatedAt: '2024-01-01T00:00:00.000Z',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowFeedbackRepository', () => {
	let repository: FlowFeedbackRepository;

	beforeEach(() => {
		// Fresh storage for each test — no shared state
		repository = makeRepository();
	});

	// -------------------------------------------------------------------------
	// create
	// -------------------------------------------------------------------------

	describe('create - persist a new FlowFeedback entry', () => {
		it('returns the persisted feedback with its id', async () => {
			const feedback = makeFeedback();

			const result = await repository.create(feedback);

			expect(result).toMatchObject({
				id: feedback.id,
				ticketId: TICKET_A,
				flowId: FLOW_1,
				rating: 4,
				author: 'tester',
			});
		});

		it('persists the feedback so it can be retrieved later', async () => {
			const feedback = makeFeedback();
			await repository.create(feedback);

			const found = await repository.findByTicketId(TICKET_A);

			expect(found).toHaveLength(1);
			expect(found[0]).toMatchObject({ id: feedback.id, ticketId: TICKET_A });
		});

		it('stores all provided fields', async () => {
			const feedback = makeFeedback({ suggestions: ['try a different approach'], rating: 5 });
			const result = await repository.create(feedback);

			expect(result.rating).toBe(5);
			expect(result.wentWell).toEqual(['step 1 was great']);
			expect(result.suggestions).toEqual(['try a different approach']);
		});

		it('can persist multiple feedback entries independently', async () => {
			const fb1 = makeFeedback({ id: 'fb-1', ticketId: TICKET_A });
			const fb2 = makeFeedback({ id: 'fb-2', ticketId: TICKET_B });

			await repository.create(fb1);
			await repository.create(fb2);

			const allA = await repository.findByTicketId(TICKET_A);
			const allB = await repository.findByTicketId(TICKET_B);

			expect(allA).toHaveLength(1);
			expect(allB).toHaveLength(1);
		});
	});

	// -------------------------------------------------------------------------
	// findByTicketId
	// -------------------------------------------------------------------------

	describe('findByTicketId - find all feedback for a ticket', () => {
		it('returns an empty array when no feedback exists for the ticket', async () => {
			const result = await repository.findByTicketId('no-such-ticket');

			expect(result).toEqual([]);
		});

		it('returns only feedback matching the given ticketId', async () => {
			await repository.create(makeFeedback({ id: 'fb-a1', ticketId: TICKET_A }));
			await repository.create(makeFeedback({ id: 'fb-b1', ticketId: TICKET_B }));

			const result = await repository.findByTicketId(TICKET_A);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('fb-a1');
		});

		it('returns multiple entries when several feedback items exist for the same ticket', async () => {
			await repository.create(makeFeedback({ id: 'fb-1', ticketId: TICKET_A }));
			await repository.create(makeFeedback({ id: 'fb-2', ticketId: TICKET_A, rating: 3 }));

			const result = await repository.findByTicketId(TICKET_A);

			expect(result).toHaveLength(2);
			const ids = result.map(f => f.id);
			expect(ids).toContain('fb-1');
			expect(ids).toContain('fb-2');
		});

		it('does not return feedback from other tickets', async () => {
			await repository.create(makeFeedback({ id: 'fb-other', ticketId: TICKET_B }));

			const result = await repository.findByTicketId(TICKET_A);

			expect(result).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// findByFlowId
	// -------------------------------------------------------------------------

	describe('findByFlowId - find all feedback for a flow', () => {
		it('returns an empty array when no feedback exists for the flow', async () => {
			const result = await repository.findByFlowId('no-such-flow');

			expect(result).toEqual([]);
		});

		it('returns only feedback matching the given flowId', async () => {
			await repository.create(makeFeedback({ id: 'fb-f1', flowId: FLOW_1 }));
			await repository.create(makeFeedback({ id: 'fb-f2', flowId: FLOW_2 }));

			const result = await repository.findByFlowId(FLOW_1);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('fb-f1');
		});

		it('returns all feedback for a flow regardless of ticket', async () => {
			await repository.create(makeFeedback({ id: 'fb-1', ticketId: TICKET_A, flowId: FLOW_1 }));
			await repository.create(makeFeedback({ id: 'fb-2', ticketId: TICKET_B, flowId: FLOW_1 }));
			await repository.create(makeFeedback({ id: 'fb-3', ticketId: TICKET_A, flowId: FLOW_2 }));

			const result = await repository.findByFlowId(FLOW_1);

			expect(result).toHaveLength(2);
			const ids = result.map(f => f.id);
			expect(ids).toContain('fb-1');
			expect(ids).toContain('fb-2');
		});

		it('does not return feedback from other flows', async () => {
			await repository.create(makeFeedback({ id: 'fb-other', flowId: FLOW_2 }));

			const result = await repository.findByFlowId(FLOW_1);

			expect(result).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// createRetrospective
	// -------------------------------------------------------------------------

	describe('createRetrospective - persist a new FlowRetrospective entry', () => {
		it('returns the persisted retrospective with its id', async () => {
			const retro = makeRetrospective();

			const result = await repository.createRetrospective(retro);

			expect(result).toMatchObject({
				id: retro.id,
				ticketId: TICKET_A,
				flowId: FLOW_1,
				executionSummary: 'Flow ran successfully with minor issues.',
			});
		});

		it('persists the retrospective so it can be retrieved later', async () => {
			const retro = makeRetrospective();
			await repository.createRetrospective(retro);

			const found = await repository.findRetrospectiveByTicketId(TICKET_A);

			expect(found).not.toBeNull();
			expect(found!.id).toBe(retro.id);
		});

		it('stores all provided fields', async () => {
			const retro = makeRetrospective({
				wentWell: ['everything'],
				wentWrong: ['nothing'],
				suggestions: ['keep it up'],
			});
			const result = await repository.createRetrospective(retro);

			expect(result.wentWell).toEqual(['everything']);
			expect(result.wentWrong).toEqual(['nothing']);
			expect(result.suggestions).toEqual(['keep it up']);
		});
	});

	// -------------------------------------------------------------------------
	// findRetrospectiveByTicketId
	// -------------------------------------------------------------------------

	describe('findRetrospectiveByTicketId - find the retrospective for a ticket', () => {
		it('returns null when no retrospective exists for the ticket', async () => {
			const result = await repository.findRetrospectiveByTicketId('no-such-ticket');

			expect(result).toBeNull();
		});

		it('returns the retrospective when one exists', async () => {
			const retro = makeRetrospective({ ticketId: TICKET_A });
			await repository.createRetrospective(retro);

			const result = await repository.findRetrospectiveByTicketId(TICKET_A);

			expect(result).not.toBeNull();
			expect(result!.ticketId).toBe(TICKET_A);
			expect(result!.executionSummary).toBe('Flow ran successfully with minor issues.');
		});

		it('does not return the retrospective of a different ticket', async () => {
			const retro = makeRetrospective({ id: 'retro-b', ticketId: TICKET_B });
			await repository.createRetrospective(retro);

			const result = await repository.findRetrospectiveByTicketId(TICKET_A);

			expect(result).toBeNull();
		});

		it('returns the first retrospective when multiple exist for the same ticket (at-most-one invariant)', async () => {
			// The implementation returns results[0] — verify the first inserted item is returned
			const retro1 = makeRetrospective({ id: 'retro-first', ticketId: TICKET_A });
			const retro2 = makeRetrospective({ id: 'retro-second', ticketId: TICKET_A });

			await repository.createRetrospective(retro1);
			await repository.createRetrospective(retro2);

			const result = await repository.findRetrospectiveByTicketId(TICKET_A);

			// Must return a retrospective (not null), and it must be the first one inserted
			expect(result).not.toBeNull();
			expect(result!.ticketId).toBe(TICKET_A);
			expect(result!.id).toBe('retro-first');
		});

		it('is isolated from feedback entries — retrospective lookup does not cross collections', async () => {
			// Create feedback but no retrospective
			await repository.create(makeFeedback({ ticketId: TICKET_A }));

			const result = await repository.findRetrospectiveByTicketId(TICKET_A);

			expect(result).toBeNull();
		});
	});
});
