import type { TicketsListResponse } from '@shared/api/tickets.contract';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ticketsApi } from './tickets.api';
import { useTickets } from './useTickets';

/**
 * ===========================================================================================
 * USE TICKETS HOOK TESTS
 * ===========================================================================================
 *
 * Tests for the useTickets hook to ensure proper data fetching and state management.
 *
 * ===========================================================================================
 */

vi.mock('./tickets.api', () => ({
	ticketsApi: {
		getTicketsList: vi.fn(),
	},
}));

describe('useTickets', () => {
	it('should fetch tickets on mount', async () => {
		const mockResponse: TicketsListResponse = {
			items: [
				{
					id: '1',
					projectId: 'project-1',
					title: 'Test Ticket',
					description: 'Test description',
					status: 'backlog',
					labels: ['test'],
					fields: {},
					parentId: undefined,
					taskIds: [],
					flowId: undefined,
					order: 1000,
					version: 1,
					createdAt: '2026-01-01T00:00:00Z',
					updatedAt: '2026-01-01T00:00:00Z',
				},
			],
			pagination: {
				page: 1,
				pageSize: 10,
				total: 1,
				totalPages: 1,
			},
		};

		vi.mocked(ticketsApi.getTicketsList).mockResolvedValue(mockResponse);

		const { result } = renderHook(() => useTickets());

		// Initially loading
		expect(result.current.loading).toBe(true);
		expect(result.current.tickets).toEqual([]);

		// Wait for data to load
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.tickets).toEqual(mockResponse.items);
		expect(result.current.error).toBeNull();
		expect(ticketsApi.getTicketsList).toHaveBeenCalledWith(undefined);
	});

	it('should handle errors gracefully', async () => {
		const mockError = new Error('Failed to fetch tickets');
		vi.mocked(ticketsApi.getTicketsList).mockRejectedValue(mockError);

		const { result } = renderHook(() => useTickets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.tickets).toEqual([]);
		expect(result.current.error).toBe('Failed to fetch tickets');
	});

	it('should pass query parameters to API', async () => {
		const mockResponse: TicketsListResponse = {
			items: [],
			pagination: {
				page: 1,
				pageSize: 10,
				total: 0,
				totalPages: 0,
			},
		};

		vi.mocked(ticketsApi.getTicketsList).mockResolvedValue(mockResponse);

		const query = { projectId: 'project-123', status: 'backlog' as const };
		renderHook(() => useTickets(query));

		await waitFor(() => {
			expect(ticketsApi.getTicketsList).toHaveBeenCalledWith(query);
		});
	});

	it('should provide a reload function', async () => {
		const mockResponse: TicketsListResponse = {
			items: [],
			pagination: {
				page: 1,
				pageSize: 10,
				total: 0,
				totalPages: 0,
			},
		};

		vi.mocked(ticketsApi.getTicketsList).mockResolvedValue(mockResponse);

		const { result } = renderHook(() => useTickets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Call reload
		expect(typeof result.current.reload).toBe('function');

		vi.mocked(ticketsApi.getTicketsList).mockClear();
		await result.current.reload();

		expect(ticketsApi.getTicketsList).toHaveBeenCalledTimes(1);
	});
});
