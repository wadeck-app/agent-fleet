import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowRetrospective } from '@app/shared/api/flow-feedback.contract';
import type { Ticket } from '@app/shared/api/tickets.contract';

import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { FlowFeedbackService } from './FlowFeedbackService';
import { FlowKnowledgeService } from './FlowKnowledgeService';
import type { FlowsService } from './FlowsService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides?: Partial<Ticket>): Ticket {
	return {
		id: 'ticket-1',
		projectId: 'proj-1',
		title: 'Example ticket',
		description: 'Do something',
		status: 'done',
		labels: [],
		fields: {},
		taskIds: [],
		order: 1000,
		version: 1,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function makeRetro(flowId: string): FlowRetrospective {
	return {
		id: 'retro-1',
		ticketId: 'ticket-1',
		flowId,
		taskId: 'task-1',
		wentWell: ['fast execution'],
		wentWrong: [],
		suggestions: [],
		executionSummary: 'Flow ran to completion.',
		generatedAt: '2026-01-01T00:00:00Z',
	};
}

function makeStubs() {
	const flowsService: FlowsService = {
		getFlowsList: vi.fn().mockResolvedValue([]),
	} as unknown as FlowsService;

	const feedbackService: FlowFeedbackService = {
		getRetrospective: vi.fn(),
	} as unknown as FlowFeedbackService;

	const ticketsRepository: TicketsRepository = {
		findByProject: vi.fn().mockResolvedValue([]),
	} as unknown as TicketsRepository;

	return { flowsService, feedbackService, ticketsRepository };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowKnowledgeService', () => {
	let service: FlowKnowledgeService;
	let stubs: ReturnType<typeof makeStubs>;

	beforeEach(() => {
		stubs = makeStubs();
		service = new FlowKnowledgeService(stubs.flowsService, stubs.feedbackService, stubs.ticketsRepository);
	});

	describe('buildKnowledgeContext - empty state', () => {
		it('returns empty arrays and objects when no data is available', async () => {
			const ctx = await service.buildKnowledgeContext('proj-1', 'some ticket description');

			expect(ctx.availableFlows).toEqual([]);
			expect(ctx.reusableSubFlows).toEqual([]);
			expect(ctx.feedbackByFlow).toEqual({});
			expect(ctx.recentRetrospectives).toEqual([]);
			expect(ctx.similarTickets).toEqual([]);
		});
	});

	describe('buildKnowledgeContext - flows', () => {
		it('maps FlowListItem to FlowSummary', async () => {
			vi.mocked(stubs.flowsService.getFlowsList).mockResolvedValue([
				{ id: 'dev-full', name: 'Full Dev Cycle', description: 'Analysis to review', version: '1.0.0' },
				{ id: 'simple-qa', name: 'Simple QA', description: 'Question answering', version: '1.0.0' },
			]);

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.availableFlows).toHaveLength(2);
			expect(ctx.availableFlows[0]).toMatchObject({ id: 'dev-full', name: 'Full Dev Cycle', isReusable: false });
			expect(ctx.availableFlows[1]).toMatchObject({ id: 'simple-qa', name: 'Simple QA', isReusable: false });
		});

		it('handles FlowsService failure gracefully', async () => {
			vi.mocked(stubs.flowsService.getFlowsList).mockRejectedValue(new Error('Service unavailable'));

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.availableFlows).toEqual([]);
		});
	});

	describe('buildKnowledgeContext - similar tickets', () => {
		it('includes tickets that have a flowId set', async () => {
			vi.mocked(stubs.ticketsRepository.findByProject).mockResolvedValue([
				makeTicket({ id: 't-1', title: 'Deploy service', flowId: 'dev-full', status: 'done' }),
				makeTicket({ id: 't-2', title: 'Fix bug', status: 'todo' }), // no flowId
			]);

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.similarTickets).toHaveLength(1);
			expect(ctx.similarTickets[0]).toMatchObject({
				ticketId: 't-1',
				title: 'Deploy service',
				flowId: 'dev-full',
				status: 'done',
			});
		});

		it('limits to 10 similar tickets', async () => {
			const manyTickets = Array.from({ length: 15 }, (_, i) =>
				makeTicket({ id: `t-${i}`, title: `Ticket ${i}`, flowId: `flow-${i}` })
			);
			vi.mocked(stubs.ticketsRepository.findByProject).mockResolvedValue(manyTickets);

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.similarTickets).toHaveLength(10);
		});

		it('handles TicketsRepository failure gracefully', async () => {
			vi.mocked(stubs.ticketsRepository.findByProject).mockRejectedValue(new Error('DB error'));

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.similarTickets).toEqual([]);
		});
	});

	describe('buildKnowledgeContext - retrospectives', () => {
		it('fetches retrospectives for tickets with flowRetrospectiveId', async () => {
			const ticket = makeTicket({ id: 't-1', flowRetrospectiveId: 'retro-1' });
			vi.mocked(stubs.ticketsRepository.findByProject).mockResolvedValue([ticket]);
			vi.mocked(stubs.feedbackService.getRetrospective).mockResolvedValue(makeRetro('dev-full'));

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.recentRetrospectives).toHaveLength(1);
			expect(ctx.recentRetrospectives[0]?.flowId).toBe('dev-full');
		});

		it('ignores retrospective fetch errors silently', async () => {
			const ticket = makeTicket({ id: 't-1', flowRetrospectiveId: 'retro-bad' });
			vi.mocked(stubs.ticketsRepository.findByProject).mockResolvedValue([ticket]);
			vi.mocked(stubs.feedbackService.getRetrospective).mockRejectedValue(new Error('Not found'));

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.recentRetrospectives).toEqual([]);
		});

		it('limits retrospectives to 5', async () => {
			const tickets = Array.from({ length: 8 }, (_, i) =>
				makeTicket({ id: `t-${i}`, flowRetrospectiveId: `retro-${i}` })
			);
			vi.mocked(stubs.ticketsRepository.findByProject).mockResolvedValue(tickets);
			vi.mocked(stubs.feedbackService.getRetrospective).mockResolvedValue(makeRetro('dev-full'));

			const ctx = await service.buildKnowledgeContext('proj-1', 'desc');

			expect(ctx.recentRetrospectives).toHaveLength(5);
		});
	});
});
