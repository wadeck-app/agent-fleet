import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuickActions } from './QuickActions';

describe('QuickActions', () => {
	it('should render all action buttons', () => {
		render(<QuickActions />);

		expect(screen.getByText('New Task')).toBeInTheDocument();
		expect(screen.getByText('Manage Workers')).toBeInTheDocument();
		expect(screen.getByText('Workspaces')).toBeInTheDocument();
		expect(screen.getByText('Review Queue')).toBeInTheDocument();
	});

	it('should call onNewTask when New Task button is clicked', async () => {
		const user = userEvent.setup();
		const onNewTask = vi.fn();

		render(<QuickActions onNewTask={onNewTask} />);

		await user.click(screen.getByText('New Task'));
		expect(onNewTask).toHaveBeenCalledOnce();
	});

	it('should call onManageWorkers when Manage Workers button is clicked', async () => {
		const user = userEvent.setup();
		const onManageWorkers = vi.fn();

		render(<QuickActions onManageWorkers={onManageWorkers} />);

		await user.click(screen.getByText('Manage Workers'));
		expect(onManageWorkers).toHaveBeenCalledOnce();
	});

	it('should call onWorkspaces when Workspaces button is clicked', async () => {
		const user = userEvent.setup();
		const onWorkspaces = vi.fn();

		render(<QuickActions onWorkspaces={onWorkspaces} />);

		await user.click(screen.getByText('Workspaces'));
		expect(onWorkspaces).toHaveBeenCalledOnce();
	});

	it('should call onReviewQueue when Review Queue button is clicked', async () => {
		const user = userEvent.setup();
		const onReviewQueue = vi.fn();

		render(<QuickActions onReviewQueue={onReviewQueue} />);

		await user.click(screen.getByText('Review Queue'));
		expect(onReviewQueue).toHaveBeenCalledOnce();
	});

	it('should not show review queue count badge when count is 0', () => {
		render(<QuickActions reviewQueueCount={0} />);

		// Badge should not be visible
		const button = screen.getByText('Review Queue').closest('button');
		expect(button?.textContent).not.toMatch(/\d+/);
	});

	it('should show review queue count badge when count > 0', () => {
		render(<QuickActions reviewQueueCount={5} />);

		expect(screen.getByText('5')).toBeInTheDocument();
	});

	it('should show correct count in review queue badge', () => {
		render(<QuickActions reviewQueueCount={12} />);

		expect(screen.getByText('12')).toBeInTheDocument();
	});

	it('should render buttons without handlers without errors', () => {
		render(<QuickActions />);

		// Should render without errors
		expect(screen.getByText('New Task')).toBeInTheDocument();
	});
});
