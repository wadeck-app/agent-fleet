import { useDialogParam } from '@framework/hooks/useDialogParam';
import type { Project } from '@shared/api/projects.contract';
import type { Ticket } from '@shared/api/tickets.contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectsApi } from '../projects/projects.api';
import { TicketsPage } from './TicketsPage';
import { useTickets } from './useTickets';

// Mock dependencies
vi.mock('./useTickets', () => ({
	useTickets: vi.fn(),
}));

vi.mock('../projects/projects.api', () => ({
	projectsApi: {
		getProjectsList: vi.fn(),
	},
}));

vi.mock('@framework/hooks/useDialogParam', () => ({
	useDialogParam: vi.fn(),
}));

vi.mock('./TicketCreateDialog', () => ({
	TicketCreateDialog: () => null,
}));

describe('TicketsPage', () => {
	const mockTickets: Ticket[] = [
		{
			id: 'ticket-1',
			projectId: 'project-1',
			title: 'Test Ticket 1',
			description: 'Description 1',
			status: 'todo',
			labels: ['bug', 'urgent'],
			fields: {},
			taskIds: [],
			order: 1000,
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		{
			id: 'ticket-2',
			projectId: 'project-1',
			title: 'Test Ticket 2',
			description: 'Description 2',
			status: 'in_progress',
			labels: [],
			fields: {},
			taskIds: [],
			order: 2000,
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	];

	const mockProjects: Project[] = [
		{
			id: 'project-1',
			name: 'Project 1',
			description: 'Description 1',
			icon: 'FolderKanban',
			iconColor: '#6366F1',
			workspaceIds: [],
			taskCount: 0,
			archived: false,
			pinned: false,
			order: 0,
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		{
			id: 'project-2',
			name: 'Project 2',
			description: 'Description 2',
			icon: 'FolderKanban',
			iconColor: '#6366F1',
			workspaceIds: [],
			taskCount: 0,
			archived: false,
			pinned: false,
			order: 1,
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();

		// Default mock implementations
		(useTickets as any).mockReturnValue({
			tickets: [],
			loading: false,
			error: null,
			reload: vi.fn(),
		});

		(projectsApi.getProjectsList as any).mockResolvedValue({
			projects: [],
		});

		(useDialogParam as any).mockReturnValue({
			isOpen: false,
			open: vi.fn(),
			close: vi.fn(),
			onOpenChange: vi.fn(),
		});
	});

	describe('rendering', () => {
		it('should render without crashing', async () => {
			render(<TicketsPage />);

			expect(screen.getByText('Tickets')).toBeInTheDocument();
		});

		it('should not have empty string as SelectItem value', () => {
			// Regression test: Radix UI crashes when SelectItem value=""
			// The component uses value="__all__" instead
			render(<TicketsPage />);

			// If this renders without crashing, the bug is fixed
			expect(screen.getByText('Tickets')).toBeInTheDocument();
		});

		it('should render tickets list', () => {
			(useTickets as any).mockReturnValue({
				tickets: mockTickets,
				loading: false,
				error: null,
				reload: vi.fn(),
			});

			render(<TicketsPage />);

			expect(screen.getByText('Test Ticket 1')).toBeInTheDocument();
			expect(screen.getByText('Test Ticket 2')).toBeInTheDocument();
			expect(screen.getByText('Description 1')).toBeInTheDocument();
			expect(screen.getByText('Description 2')).toBeInTheDocument();
		});

		it('should show loading state', () => {
			(useTickets as any).mockReturnValue({
				tickets: [],
				loading: true,
				error: null,
				reload: vi.fn(),
			});

			render(<TicketsPage />);

			expect(screen.getByText('Loading tickets...')).toBeInTheDocument();
		});

		it('should render project filter dropdown with All Projects option', async () => {
			(projectsApi.getProjectsList as any).mockResolvedValue({
				projects: mockProjects,
			});

			render(<TicketsPage />);

			// Wait for projects to load and check for "All Projects" option
			await screen.findByText('All Projects');
			expect(screen.getByText('All Projects')).toBeInTheDocument();
		});

		it('should render New Ticket button', () => {
			render(<TicketsPage />);

			const newTicketButton = screen.getByRole('button', { name: /New Ticket/i });
			expect(newTicketButton).toBeInTheDocument();
		});

		it('should show empty state when no tickets', () => {
			(useTickets as any).mockReturnValue({
				tickets: [],
				loading: false,
				error: null,
				reload: vi.fn(),
			});

			render(<TicketsPage />);

			expect(screen.getByText('No tickets found')).toBeInTheDocument();
			expect(screen.getByText('Create your first ticket to get started')).toBeInTheDocument();
		});
	});

	describe('interactions', () => {
		it('should open create dialog when New Ticket button is clicked', async () => {
			const user = userEvent.setup();
			const mockOpen = vi.fn();

			(useDialogParam as any).mockReturnValue({
				isOpen: false,
				open: mockOpen,
				close: vi.fn(),
				onOpenChange: vi.fn(),
			});

			render(<TicketsPage />);

			const newTicketButton = screen.getByRole('button', { name: /New Ticket/i });
			await user.click(newTicketButton);

			expect(mockOpen).toHaveBeenCalledTimes(1);
		});
	});

	describe('projects API handling', () => {
		it('should handle projects API response with "projects" field', async () => {
			// Regression test: API returns { projects: [...] }
			(projectsApi.getProjectsList as any).mockResolvedValue({
				projects: mockProjects,
			});

			render(<TicketsPage />);

			await screen.findByText('All Projects');
			expect(projectsApi.getProjectsList).toHaveBeenCalledWith({ archived: false });
			// Should not crash with undefined.map()
			expect(screen.getByText('Tickets')).toBeInTheDocument();
		});

		it('should handle projects API response with "items" field', async () => {
			// Regression test: Some endpoints return { items: [...] }
			(projectsApi.getProjectsList as any).mockResolvedValue({
				items: mockProjects,
			});

			render(<TicketsPage />);

			await screen.findByText('All Projects');
			expect(projectsApi.getProjectsList).toHaveBeenCalledWith({ archived: false });
			// Should not crash with undefined.map()
			expect(screen.getByText('Tickets')).toBeInTheDocument();
		});

		it('should handle projects API error gracefully', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			(projectsApi.getProjectsList as any).mockRejectedValue(new Error('Failed to load'));

			render(<TicketsPage />);

			// Should still render the page
			expect(screen.getByText('Tickets')).toBeInTheDocument();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('ticket status display', () => {
		it('should display ticket status badges with correct formatting', () => {
			const ticketsWithDifferentStatuses: Ticket[] = [
				{
					...mockTickets[0],
					id: 'ticket-1',
					status: 'in_progress',
					title: 'In Progress Ticket',
				},
				{
					...mockTickets[0],
					id: 'ticket-2',
					status: 'pending_integration',
					title: 'Pending Integration Ticket',
				},
			];

			(useTickets as any).mockReturnValue({
				tickets: ticketsWithDifferentStatuses,
				loading: false,
				error: null,
				reload: vi.fn(),
			});

			render(<TicketsPage />);

			expect(screen.getByText('In Progress')).toBeInTheDocument();
			expect(screen.getByText('Pending Integration')).toBeInTheDocument();
		});

		it('should display ticket labels', () => {
			(useTickets as any).mockReturnValue({
				tickets: mockTickets,
				loading: false,
				error: null,
				reload: vi.fn(),
			});

			render(<TicketsPage />);

			expect(screen.getByText('bug')).toBeInTheDocument();
			expect(screen.getByText('urgent')).toBeInTheDocument();
		});
	});
});
