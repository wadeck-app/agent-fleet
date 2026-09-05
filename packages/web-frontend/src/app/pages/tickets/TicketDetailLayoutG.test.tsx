import type { Ticket } from '@shared/api/tickets.contract';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TicketDetailLayoutG } from './TicketDetailLayoutG';
import { useFlowFeedbackCount } from './useFlowFeedbackCount';
import { useFlowProposals } from './useFlowProposals';
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

vi.mock('./useFlowFeedbackCount', () => ({
	useFlowFeedbackCount: vi.fn(() => ({
		count: 0,
		loading: false,
		error: null,
		refresh: vi.fn(),
	})),
}));

vi.mock('./useFlowProposals', () => ({
	useFlowProposals: vi.fn(() => ({
		proposals: [],
		currentProposal: null,
		isLoading: false,
		error: null,
		refresh: vi.fn(),
		refreshSilent: vi.fn(),
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
	TabsWithUrlState: ({ children, onValueChange }: any) => (
		<div data-testid="tabs" data-on-value-change={!!onValueChange}>
			{children}
		</div>
	),
	TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
	TabsTrigger: ({ children, value }: any) => (
		// violations-suppress: react/no-raw-button test fixture
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
		vi.mocked(useFlowProposals).mockReturnValue({
			proposals: [],
			currentProposal: null,
			isLoading: false,
			error: null,
			refresh: vi.fn(),
			refreshSilent: vi.fn(),
		});
	});

	describe('bug #3 -- comments count real-time via hooks', () => {
		it('should use useTicketCommentsCount hook for comments tab badge', () => {
			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(useTicketCommentsCount).toHaveBeenCalledWith('ticket-1');
		});

		it('should use useTriggeredTasksCount hook for tasks tab badge', () => {
			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(useTriggeredTasksCount).toHaveBeenCalledWith('ticket-1');
		});

		it('should render comments tab trigger while count is loading', () => {
			(useTicketCommentsCount as any).mockReturnValue({
				count: 0,
				loading: true,
				error: null,
				refresh: vi.fn(),
			});

			render(<TicketDetailLayoutG {...defaultProps} />);
			// Tab trigger is present; spinner is shown inline -- check the tab button exists
			expect(screen.getByRole('tab', { name: /Comments/i })).toBeInTheDocument();
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
			// useFlowFeedbackCount loading must also be false for countsLoading to be false
			// (flowProposals.isLoading is independent and does not affect countsLoading)

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
			vi.mocked(useFlowProposals).mockReturnValue({
				proposals: [],
				currentProposal: null,
				isLoading: false,
				error: null,
				refresh: vi.fn(),
				refreshSilent: vi.fn(),
			});

			rerender(<TicketDetailLayoutG {...defaultProps} />);
			expect(screen.getByText('Comments (3)')).toBeInTheDocument();
		});
	});

	describe('ca -- feedback tab loading spinner', () => {
		it('should show the feedback tab trigger when currentFlowProposalId is set', () => {
			const ticket = { ...mockTicket, currentFlowProposalId: 'prop-1' };
			render(<TicketDetailLayoutG {...defaultProps} ticket={ticket} />);
			// Feedback tab is enabled (not disabled) when there is a proposal
			const feedbackTab = screen.getByRole('tab', { name: /Feedback/i });
			expect(feedbackTab).toBeInTheDocument();
			expect(feedbackTab).not.toBeDisabled();
		});

		it('should show feedback count after loading', () => {
			vi.mocked(useFlowFeedbackCount).mockReturnValue({
				count: 3,
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			// All tabs not loading
			(useTicketCommentsCount as any).mockReturnValue({
				count: 0,
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
			vi.mocked(useFlowProposals).mockReturnValue({
				proposals: [],
				currentProposal: null,
				isLoading: false,
				error: null,
				refresh: vi.fn(),
				refreshSilent: vi.fn(),
			});
			const ticket = { ...mockTicket, currentFlowProposalId: 'prop-1' };
			render(<TicketDetailLayoutG {...defaultProps} ticket={ticket} />);
			expect(screen.getByRole('tab', { name: /Feedback \(3\)/i })).toBeInTheDocument();
		});
	});

	describe('cb -- flow design tab count from API (eager fetch)', () => {
		it('should call useFlowProposals with ticketId immediately on mount', () => {
			// Eager fetch: always called with ticketId regardless of which tab is active
			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(useFlowProposals).toHaveBeenCalledWith('ticket-1');
		});

		it('should show spinner in flow design tab while proposals are loading', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				proposals: [],
				currentProposal: null,
				isLoading: true,
				error: null,
				refresh: vi.fn(),
				refreshSilent: vi.fn(),
			});
			render(<TicketDetailLayoutG {...defaultProps} />);
			// Tab trigger shows a spinner (Loader2) while loading
			const flowTab = screen.getByRole('tab', { name: /Flow Design/i });
			expect(flowTab).toBeInTheDocument();
		});

		it('should show "(0)" count in flow design tab when proposals list is empty (a fix: always show count)', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				proposals: [],
				currentProposal: null,
				isLoading: false,
				error: null,
				refresh: vi.fn(),
				refreshSilent: vi.fn(),
			});
			render(<TicketDetailLayoutG {...defaultProps} />);
			// a fix: count badge always shown, even when 0
			expect(screen.getByRole('tab', { name: /Flow Design \(0\)/i })).toBeInTheDocument();
		});

		it('should show proposals count in flow design tab once loaded', () => {
			vi.mocked(useFlowProposals).mockReturnValue({
				proposals: [{ id: 'prop-1' } as any],
				currentProposal: { id: 'prop-1' } as any,
				isLoading: false,
				error: null,
				refresh: vi.fn(),
				refreshSilent: vi.fn(),
			});
			render(<TicketDetailLayoutG {...defaultProps} />);
			expect(screen.getByRole('tab', { name: /Flow Design \(1\)/i })).toBeInTheDocument();
		});
	});

	describe('bug #5 -- status select fallback when config loading', () => {
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
