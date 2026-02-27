import { describe, expect, it } from 'vitest';

import { ticketsApi } from './tickets.api';

/**
 * ===========================================================================================
 * TICKETS API TESTS
 * ===========================================================================================
 *
 * Basic smoke tests for the tickets API client.
 * More comprehensive tests should be added as features are implemented.
 *
 * ===========================================================================================
 */

describe('ticketsApi', () => {
	describe('structure', () => {
		it('should export all required methods', () => {
			expect(ticketsApi).toHaveProperty('getTicketsList');
			expect(ticketsApi).toHaveProperty('getTicketById');
			expect(ticketsApi).toHaveProperty('createTicket');
			expect(ticketsApi).toHaveProperty('updateTicket');
			expect(ticketsApi).toHaveProperty('deleteTicket');
			expect(ticketsApi).toHaveProperty('reorderTicket');
			expect(ticketsApi).toHaveProperty('getLabels');
			expect(ticketsApi).toHaveProperty('analyzeTicket');
			expect(ticketsApi).toHaveProperty('createFromPlan');
		});

		it('should have all methods as functions', () => {
			expect(typeof ticketsApi.getTicketsList).toBe('function');
			expect(typeof ticketsApi.getTicketById).toBe('function');
			expect(typeof ticketsApi.createTicket).toBe('function');
			expect(typeof ticketsApi.updateTicket).toBe('function');
			expect(typeof ticketsApi.deleteTicket).toBe('function');
			expect(typeof ticketsApi.reorderTicket).toBe('function');
			expect(typeof ticketsApi.getLabels).toBe('function');
			expect(typeof ticketsApi.analyzeTicket).toBe('function');
			expect(typeof ticketsApi.createFromPlan).toBe('function');
		});
	});

	// TODO: Add integration tests once MSW/mock server is set up
	// TODO: Add tests for error handling
	// TODO: Add tests for request/response validation
});
