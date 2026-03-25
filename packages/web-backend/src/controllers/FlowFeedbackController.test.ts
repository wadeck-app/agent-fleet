import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowFeedback, UpdateFlowFeedback } from '@app/shared/api/flow-feedback.contract';

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
		updateFeedback: vi.fn(),
		deleteFeedback: vi.fn(),
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

const FEEDBACK_ID = 'fb-1';
const TICKET_ID = 'ticket-abc';
const FLOW_ID = 'flow-xyz';
const TASK_ID = 'task-123';

const sampleFeedback: FlowFeedback = {
	id: FEEDBACK_ID,
	ticketId: TICKET_ID,
	flowId: FLOW_ID,
	taskId: TASK_ID,
	rating: 4,
	wentWell: ['Good step 1'],
	wentWrong: [],
	submittedAt: '2024-01-01T00:00:00.000Z',
	author: 'tester',
};

const updateBody: UpdateFlowFeedback = {
	rating: 5,
	wentWell: ['Even better step 1'],
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
		it('registers PUT /api/flow-feedback/:feedbackId', () => {
			const mockAdd = vi.fn();
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			expect(mockAdd).toHaveBeenCalledWith('PUT', '/api/flow-feedback/:feedbackId', expect.any(Function));
		});

		it('registers DELETE /api/flow-feedback/:feedbackId', () => {
			const mockAdd = vi.fn();
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			expect(mockAdd).toHaveBeenCalledWith('DELETE', '/api/flow-feedback/:feedbackId', expect.any(Function));
		});
	});

	// -------------------------------------------------------------------------
	// PUT /api/flow-feedback/:feedbackId
	// -------------------------------------------------------------------------

	describe('PUT /api/flow-feedback/:feedbackId', () => {
		it('delegates to service.updateFeedback with feedbackId and body', async () => {
			vi.mocked(mockService.updateFeedback).mockResolvedValue({ ...sampleFeedback, ...updateBody });

			const handler = captureHandler(controller, 'PUT', '/api/flow-feedback/:feedbackId');
			const result = await handler({ params: { feedbackId: FEEDBACK_ID }, body: updateBody });

			expect(mockService.updateFeedback).toHaveBeenCalledOnce();
			expect(mockService.updateFeedback).toHaveBeenCalledWith(FEEDBACK_ID, updateBody);
			expect(result).toMatchObject({ id: FEEDBACK_ID, rating: 5 });
		});

		it('propagates errors thrown by the service', async () => {
			vi.mocked(mockService.updateFeedback).mockRejectedValue(new Error('Feedback not found'));

			const handler = captureHandler(controller, 'PUT', '/api/flow-feedback/:feedbackId');

			await expect(handler({ params: { feedbackId: 'missing' }, body: updateBody })).rejects.toThrow(
				'Feedback not found'
			);
		});
	});

	// -------------------------------------------------------------------------
	// DELETE /api/flow-feedback/:feedbackId
	// -------------------------------------------------------------------------

	describe('DELETE /api/flow-feedback/:feedbackId', () => {
		it('delegates to service.deleteFeedback with feedbackId and returns empty object', async () => {
			vi.mocked(mockService.deleteFeedback).mockResolvedValue(undefined);

			const handler = captureHandler(controller, 'DELETE', '/api/flow-feedback/:feedbackId');
			const result = await handler({ params: { feedbackId: FEEDBACK_ID } });

			expect(mockService.deleteFeedback).toHaveBeenCalledOnce();
			expect(mockService.deleteFeedback).toHaveBeenCalledWith(FEEDBACK_ID);
			expect(result).toEqual({});
		});

		it('propagates errors thrown by the service', async () => {
			vi.mocked(mockService.deleteFeedback).mockRejectedValue(new Error('Feedback not found'));

			const handler = captureHandler(controller, 'DELETE', '/api/flow-feedback/:feedbackId');

			await expect(handler({ params: { feedbackId: 'missing' } })).rejects.toThrow('Feedback not found');
		});
	});
});
