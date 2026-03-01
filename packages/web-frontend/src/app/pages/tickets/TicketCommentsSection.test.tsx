import type { TicketComment } from '@shared/api/tickets.contract';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TicketCommentsSection } from './TicketCommentsSection';
import { ticketsApi } from './tickets.api';

// Mock dependencies
vi.mock('./tickets.api', () => ({
	ticketsApi: {
		getComments: vi.fn(),
	},
}));

vi.mock('@/hooks/useRealtimeRefresh', () => ({
	useRealtimeRefresh: vi.fn(),
}));

describe('TicketCommentsSection', () => {
	const mockComments: TicketComment[] = [
		{
			id: 'comment-1',
			ticketId: 'ticket-1',
			content: 'First comment',
			author: 'Alice',
			createdAt: new Date(Date.now() - 3600000).toISOString(),
		},
		{
			id: 'comment-2',
			ticketId: 'ticket-1',
			content: 'Second comment without author',
			createdAt: new Date(Date.now() - 1800000).toISOString(),
		},
		{
			id: 'comment-3',
			ticketId: 'ticket-1',
			content: 'Third comment with multiline\ncontent\nhere',
			author: 'Bob',
			createdAt: new Date(Date.now() - 300000).toISOString(),
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should show loading state initially', () => {
			(ticketsApi.getComments as any).mockImplementation(
				() =>
					new Promise(() => {
						// Never resolves
					})
			);

			render(<TicketCommentsSection ticketId="ticket-1" />);

			expect(screen.getByText('Loading comments...')).toBeInTheDocument();
		});

		it('should render comments after loading', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({
				comments: mockComments,
			});

			render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalledWith('ticket-1');
			});

			expect(screen.getByText('First comment')).toBeInTheDocument();
			expect(screen.getByText('Second comment without author')).toBeInTheDocument();
			expect(screen.getByText(/Third comment with multiline/)).toBeInTheDocument();
		});

		it('should render author badges when present', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({
				comments: mockComments,
			});

			render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalled();
			});

			expect(screen.getByText('Alice')).toBeInTheDocument();
			expect(screen.getByText('Bob')).toBeInTheDocument();
		});

		it('should not render when no comments', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({
				comments: [],
			});

			const { container } = render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalled();
			});

			// Component should render nothing (return null)
			expect(container.firstChild).toBeNull();
		});

		it('should show error state when fetch fails', async () => {
			(ticketsApi.getComments as any).mockRejectedValue(new Error('Failed to fetch'));

			render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalled();
			});

			expect(screen.getByText('Failed to load comments')).toBeInTheDocument();
		});
	});

	describe('API calls', () => {
		it('should call getComments with correct ticketId on mount', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({ comments: [] });

			render(<TicketCommentsSection ticketId="ticket-123" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalledWith('ticket-123');
			});
		});

		it('should refetch comments when ticketId changes', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({ comments: [] });

			const { rerender } = render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalledWith('ticket-1');
			});

			vi.clearAllMocks();

			rerender(<TicketCommentsSection ticketId="ticket-2" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalledWith('ticket-2');
			});
		});
	});

	describe('timestamp formatting', () => {
		it('should display relative timestamps for comments', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({
				comments: mockComments,
			});

			render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalled();
			});

			// Comments should show relative time (e.g., "1h ago", "30 min ago")
			// Exact text depends on formatRelativeTime implementation
			const timestampElements = screen.getAllByText(/ago|Just now/);
			expect(timestampElements.length).toBeGreaterThan(0);
		});
	});

	describe('content rendering', () => {
		it('should preserve whitespace in multiline comments', async () => {
			(ticketsApi.getComments as any).mockResolvedValue({
				comments: mockComments,
			});

			render(<TicketCommentsSection ticketId="ticket-1" />);

			await waitFor(() => {
				expect(ticketsApi.getComments).toHaveBeenCalled();
			});

			// Find the multiline comment
			const multilineComment = screen.getByText(/Third comment with multiline/);
			expect(multilineComment).toHaveClass('whitespace-pre-wrap');
		});
	});
});
