import type { Ticket } from '@shared/api/tickets.contract';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TicketDetailLayoutG } from './TicketDetailLayoutG';
import { useTicketActivityCount } from './useTicketActivityCount';
import { useTicketAuditCount } from './useTicketAuditCount';
import { useTicketCommentsCount } from './useTicketCommentsCount';
import { useTriggeredTasksCount } from './useTriggeredTasksCount';

// Mock all external dependencies to isolate TicketDetailLayoutG

vi.mock('./tickets.api', () => ({
	ticketsApi: {
		getComments: vi.fn().mockResolvedValue({ comments: [] }),
		getHistory: vi.fn().mockResolvedValue({ entries: [] }),
		updateTicket: vi.fn(),
	},
}));

vi.mock('../tasks/tasks.api', () => ({
	tasksApi: {
		getTasksList: vi.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }),
	},
}));

const mockUseProjectStatusConfig = vi.fn((_projectId?: string) => ({
	config: {
		statuses: [
			{ id: 'backlog', label: 'Backlog', terminal: false },
			{ id: 'todo', label: 'To Do', terminal: false },
			{ id: 'in_progress', label: 'In Progress', terminal: false },
		],
		transitions: [],
	},
	isLoading: false,
	error: null,
}));

vi.mock('./useProjectStatusConfig', () => ({
	useProjectStatusConfig: (projectId: string) => mockUseProjectStatusConfig(projectId),
}));

vi.mock('./useTicketCommentsCount', () => ({
	useTicketCommentsCount: vi.fn(() => ({
		count: 0,
		loading: true,
		error: null,
		refresh: vi.fn(),
	})),
}));

vi.mock('./useTriggeredTasksCount', () => ({
	useTriggeredTasksCount: vi.fn(() => ({
		count: 0,
		loading: true,
		error: null,
		refresh: vi.fn(),
	})),
}));

vi.mock('./useTicketAuditCount', () => ({
	useTicketAuditCount: vi.fn(() => ({
		count: 0,
		loading: true,
	})),
}));

vi.mock('./useTicketActivityCount', () => ({
	useTicketActivityCount: vi.fn(() => ({
		count: 0,
		loading: true,
	})),
}));

vi.mock('./TicketCommentsSection', () => ({
	TicketCommentsSection: () => <div data-testid="comments-section" />,
}));

vi.mock('./TriggeredTasksSection', () => ({
	TriggeredTasksSection: () => <div data-testid="tasks-section" />,
}));

vi.mock('./TicketAuditLogSection', () => ({
	TicketAuditLogSection: () => <div data-testid="audit-section" />,
}));

vi.mock('./FlowProposalSection', () => ({
	FlowProposalSection: () => <div data-testid="flow-section" />,
}));

vi.mock('./FlowFeedbackSection', () => ({
	FlowFeedbackSection: () => <div data-testid="feedback-section" />,
}));

vi.mock('@/transport', () => ({
	useTransport: vi.fn(() => ({
		transport: {
			subscribe: vi.fn(() => vi.fn()),
			registerLocalHandler: vi.fn(() => vi.fn()),
		},
	})),
}));

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
	Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock('@framework/components/primitives/TabsWithUrlState', () => ({
	TabsWithUrlState: ({ children }: any) => <div>{children}</div>,
	TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
	TabsTrigger: ({ children, value }: any) => (
		<button role="tab" data-value={value}>
			{children}
		</button>
	),
	TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@framework/hooks2/form/useListItems', () => ({
	useListItems: () => ({
		fstate: { items: [] },
		actions: {
			set: vi.fn(),
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
		},
	}),
}));

vi.mock('@framework/components2/list/RemoveItemButton', () => ({
	RemoveItemButton: () => null,
}));

vi.mock('./components/CommentPermalink', () => ({
	CommentPermalink: () => null,
}));

vi.mock('react-markdown', () => ({
	default: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('remark-gfm', () => ({ default: () => {} }));

const mockTicket: Ticket = {
	id: 'ticket-1',
	projectId: 'project-1',
	title: 'Test Ticket',
	description: 'Test Description',
	status: 'backlog',
	labels: [],
	fields: {},
	taskIds: [],
	order: 1000,
	version: 1,
	createdAt: '2024-01-01T00:00:00Z',
	updatedAt: '2024-01-01T00:00:00Z',
};

const defaultProps = {
	ticket: mockTicket,
	ticketId: 'ticket-1',
	onUpdate: vi.fn(),
	onRefresh: vi.fn(),
};

describe('TicketDetailLayoutG', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUseProjectStatusConfig.mockReturnValue({
			config: {
				statuses: [
					{ id: 'backlog', label: 'Backlog', terminal: false },
					{ id: 'todo', label: 'To Do', terminal: false },
					{ id: 'in_progress', label: 'In Progress', terminal: false },
				],
				transitions: [],
			},
			isLoading: false,
			error: null,
		});

		(useTicketCommentsCount as any).mockReturnValue({
			count: 0,
			loading: true,
			error: null,
			refresh: vi.fn(),
		});

		(useTriggeredTasksCount as any).mockReturnValue({
			count: 0,
			loading: true,
			error: null,
			refresh: vi.fn(),
		});

		vi.mocked(useTicketAuditCount).mockReturnValue({ count: 0, loading: true });
		vi.mocked(useTicketActivityCount).mockReturnValue({ count: 0, loading: true });
	});

	describe('bug #3 — comments count real-time via hooks', () => {
		it('should use useTicketCommentsCount hook for comments tab badge', () => {
			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(useTicketCommentsCount).toHaveBeenCalledWith('ticket-1');
		});

		it('should use useTriggeredTasksCount hook for tasks tab badge', () => {
			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(useTriggeredTasksCount).toHaveBeenCalledWith('ticket-1');
		});

		it('should display "?" in comments tab when count is loading', () => {
			(useTicketCommentsCount as any).mockReturnValue({
				count: 0,
				loading: true,
				error: null,
				refresh: vi.fn(),
			});

			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(screen.getByText(/Comments \(\?/)).toBeInTheDocument();
		});

		it('should display comment count from hook in tab badge', () => {
			(useTicketCommentsCount as any).mockReturnValue({
				count: 5,
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			// All count hooks must be done loading for countsLoading to be false
			(useTriggeredTasksCount as any).mockReturnValue({
				count: 0,
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			vi.mocked(useTicketAuditCount).mockReturnValue({ count: 0, loading: false });
			vi.mocked(useTicketActivityCount).mockReturnValue({ count: 0, loading: false });

			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(screen.getByText('Comments (5)')).toBeInTheDocument();
		});

		it('should update comments count badge when hook updates', () => {
			// Start with both loading
			const { rerender } = render(<TicketDetailLayoutG {...defaultProps} />);

			// Now all loaded with new values
			(useTicketCommentsCount as any).mockReturnValue({
				count: 3,
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			(useTriggeredTasksCount as any).mockReturnValue({
				count: 0,
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			vi.mocked(useTicketAuditCount).mockReturnValue({ count: 0, loading: false });
			vi.mocked(useTicketActivityCount).mockReturnValue({ count: 0, loading: false });

			rerender(<TicketDetailLayoutG {...defaultProps} />);
			expect(screen.getByText('Comments (3)')).toBeInTheDocument();
		});
	});

	describe('bug #5 — status select fallback when config loading', () => {
		it('should show the raw status value in select when no matching config label is available', () => {
			// Config has no statuses (or statuses don't include the ticket's status)
			mockUseProjectStatusConfig.mockReturnValue({
				config: { statuses: [], transitions: [] },
				isLoading: true,
				error: null,
			});

			const ticket = { ...mockTicket, status: 'in_progress' };
			render(<TicketDetailLayoutG {...defaultProps} ticket={ticket} />);

			// The status combobox should render (not crash, not show empty)
			const combobox = screen.getByRole('combobox');
			expect(combobox).toBeInTheDocument();
			// The displayed text in the trigger should show the raw status value as fallback
			expect(combobox).toHaveTextContent('in_progress');
		});

		it('should show the config label when config is loaded', () => {
			mockUseProjectStatusConfig.mockReturnValue({
				config: {
					statuses: [{ id: 'in_progress', label: 'In Progress', terminal: false }],
					transitions: [],
				},
				isLoading: false,
				error: null,
			});

			const ticket = { ...mockTicket, status: 'in_progress' };
			render(<TicketDetailLayoutG {...defaultProps} ticket={ticket} />);

			const combobox = screen.getByRole('combobox');
			expect(combobox).toHaveTextContent('In Progress');
		});
	});
});
