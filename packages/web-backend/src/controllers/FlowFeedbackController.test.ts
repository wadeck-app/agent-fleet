import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	CreateFlowFeedback,
	CreateFlowRetrospective,
	FlowFeedback,
	FlowRetrospective,
} from '@app/shared/api/flow-feedback.contract';

import type { FlowFeedbackService } from '../services/FlowFeedbackService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import FlowFeedbackController from './FlowFeedbackController';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(): FlowFeedbackService {
	return {
		submitFeedback: vi.fn(),
		submitRetrospective: vi.fn(),
		getRetrospective: vi.fn(),
		getFeedbackForFlow: vi.fn(),
	} as unknown as FlowFeedbackService;
}

/**
 * Capture a registered route handler by method + path.
 * Returns a function that simulates calling the route with a request object.
 */
function captureHandler(
	controller: FlowFeedbackController,
	method: string,
	path: string
): (req: { params?: Record<string, string>; body?: unknown }) => Promise<unknown> {
	let captured: ((req: any) => Promise<unknown>) | undefined;

	const mockAdd = vi.fn((m: string, p: string, handler: (req: any) => Promise<unknown>) => {
		if (m === method && p === path) {
			captured = handler;
		}
	});

	controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

	if (!captured) {
		throw new Error(`No handler registered for ${method} ${path}`);
	}

	return captured;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TICKET_ID = 'ticket-abc';
const FLOW_ID = 'flow-xyz';
const TASK_ID = 'task-123';

const sampleFeedback: FlowFeedback = {
	id: 'fb-1',
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	rating: 4,
	wentWell: ['Good step 1'],
	wentWrong: [],
	submittedAt: '2024-01-01T00:00:00.000Z',
	author: 'tester',
};

const sampleRetrospective: FlowRetrospective = {
	id: 'retro-1',
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	wentWell: ['step A'],
	wentWrong: ['step B'],
	suggestions: ['improvement'],
	executionSummary: 'Flow ran successfully.',
	generatedAt: '2024-01-01T00:00:00.000Z',
};

const createFeedbackBody: CreateFlowFeedback = {
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	rating: 4,
	wentWell: ['Good step 1'],
	wentWrong: [],
	author: 'tester',
};

const createRetroBody: CreateFlowRetrospective = {
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	wentWell: ['step A'],
	wentWrong: ['step B'],
	suggestions: ['improvement'],
	executionSummary: 'Flow ran successfully.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowFeedbackController', () => {
	let mockService: FlowFeedbackService;
	let controller: FlowFeedbackController;

	beforeEach(() => {
		mockService = makeService();
		controller = new FlowFeedbackController(mockService);
	});

	// -------------------------------------------------------------------------
	// configureRoutes — route registration
	// -------------------------------------------------------------------------

	describe('configureRoutes - route registration', () => {
		it('registers POST /api/tickets/:ticketId/feedback', () => {
			const mockAdd = vi.fn();
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			expect(mockAdd).toHaveBeenCalledWith('POST', '/api/tickets/:ticketId/feedback', expect.any(Function));
		});

		it('registers POST /api/tickets/:ticketId/retrospective', () => {
			const mockAdd = vi.fn();
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			expect(mockAdd).toHaveBeenCalledWith('POST', '/api/tickets/:ticketId/retrospective', expect.any(Function));
		});

		it('registers GET /api/tickets/:ticketId/retrospective', () => {
			const mockAdd = vi.fn();
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			expect(mockAdd).toHaveBeenCalledWith('GET', '/api/tickets/:ticketId/retrospective', expect.any(Function));
		});
	});

	// -------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/feedback
	// -------------------------------------------------------------------------

	describe('POST /api/tickets/:ticketId/feedback', () => {
		it('delegates to service.submitFeedback with ticketId and body', async () => {
			vi.mocked(mockService.submitFeedback).mockResolvedValue(sampleFeedback);

			const handler = captureHandler(controller, 'POST', '/api/tickets/:ticketId/feedback');
			const result = await handler({ params: { ticketId: TICKET_ID }, body: createFeedbackBody });

			expect(mockService.submitFeedback).toHaveBeenCalledOnce();
			expect(mockService.submitFeedback).toHaveBeenCalledWith(TICKET_ID, createFeedbackBody);
			expect(result).toEqual(sampleFeedback);
		});

		it('propagates errors thrown by the service', async () => {
			vi.mocked(mockService.submitFeedback).mockRejectedValue(new Error('ticket not found'));

			const handler = captureHandler(controller, 'POST', '/api/tickets/:ticketId/feedback');

			await expect(handler({ params: { ticketId: 'missing' }, body: createFeedbackBody })).rejects.toThrow(
				'ticket not found'
			);
		});
	});

	// -------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/retrospective
	// -------------------------------------------------------------------------

	describe('POST /api/tickets/:ticketId/retrospective', () => {
		it('delegates to service.submitRetrospective with ticketId and body', async () => {
			vi.mocked(mockService.submitRetrospective).mockResolvedValue(sampleRetrospective);

			const handler = captureHandler(controller, 'POST', '/api/tickets/:ticketId/retrospective');
			const result = await handler({ params: { ticketId: TICKET_ID }, body: createRetroBody });

			expect(mockService.submitRetrospective).toHaveBeenCalledOnce();
			expect(mockService.submitRetrospective).toHaveBeenCalledWith(TICKET_ID, createRetroBody);
			expect(result).toEqual(sampleRetrospective);
		});

		it('propagates errors thrown by the service', async () => {
			vi.mocked(mockService.submitRetrospective).mockRejectedValue(new Error('ticket not found'));

			const handler = captureHandler(controller, 'POST', '/api/tickets/:ticketId/retrospective');

			await expect(handler({ params: { ticketId: 'ghost' }, body: createRetroBody })).rejects.toThrow(
				'ticket not found'
			);
		});
	});

	// -------------------------------------------------------------------------
	// GET /api/tickets/:ticketId/retrospective
	// -------------------------------------------------------------------------

	describe('GET /api/tickets/:ticketId/retrospective', () => {
		it('delegates to service.getRetrospective with ticketId', async () => {
			vi.mocked(mockService.getRetrospective).mockResolvedValue(sampleRetrospective);

			const handler = captureHandler(controller, 'GET', '/api/tickets/:ticketId/retrospective');
			const result = await handler({ params: { ticketId: TICKET_ID } });

			expect(mockService.getRetrospective).toHaveBeenCalledOnce();
			expect(mockService.getRetrospective).toHaveBeenCalledWith(TICKET_ID);
			expect(result).toEqual(sampleRetrospective);
		});

		it('propagates NotFoundException when service throws (no retrospective found)', async () => {
			const notFound = new Error('No retrospective found for ticket no-ticket');
			vi.mocked(mockService.getRetrospective).mockRejectedValue(notFound);

			const handler = captureHandler(controller, 'GET', '/api/tickets/:ticketId/retrospective');

			await expect(handler({ params: { ticketId: 'no-ticket' } })).rejects.toThrow(
				'No retrospective found for ticket no-ticket'
			);
		});
	});
});
