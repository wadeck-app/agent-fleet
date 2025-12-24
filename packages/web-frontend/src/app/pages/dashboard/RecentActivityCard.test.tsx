import type { ActivityEntry } from '@shared/api/dashboard.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecentActivityCard } from './RecentActivityCard';

describe('RecentActivityCard', () => {
	const sampleActivities: ActivityEntry[] = [
		{
			timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
			type: 'task_completed',
			message: 'Completed flow execution',
			taskId: 'task-123',
			workerId: 'worker-1',
		},
		{
			timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
			type: 'task_started',
			message: 'Started deployment',
			taskId: 'task-124',
			workerId: 'worker-2',
		},
		{
			timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
			type: 'worker_connected',
			message: 'Worker connected (DEV)',
			workerId: 'worker-3',
		},
	];

	it('should render recent activity title', () => {
		render(<RecentActivityCard activities={sampleActivities} />);

		expect(screen.getByText('Recent Activity')).toBeInTheDocument();
	});

	it('should render all activity entries', () => {
		render(<RecentActivityCard activities={sampleActivities} />);

		expect(screen.getByText('Completed flow execution')).toBeInTheDocument();
		expect(screen.getByText('Started deployment')).toBeInTheDocument();
		expect(screen.getByText('Worker connected (DEV)')).toBeInTheDocument();
	});

	it('should display task and worker IDs when present', () => {
		render(<RecentActivityCard activities={sampleActivities} />);

		expect(screen.getByText('Task: task-123')).toBeInTheDocument();
		expect(screen.getByText('Worker: worker-1')).toBeInTheDocument();
		expect(screen.getByText('Task: task-124')).toBeInTheDocument();
		expect(screen.getByText('Worker: worker-2')).toBeInTheDocument();
	});

	it('should display relative time', () => {
		render(<RecentActivityCard activities={sampleActivities} />);

		// Should show relative times like "2m ago", "5m ago", etc.
		const relativeTimesRegex = /\d+[mh] ago|just now/;
		const relativeTimeElements = screen.getAllByText(relativeTimesRegex);
		expect(relativeTimeElements.length).toBeGreaterThan(0);
	});

	it('should show empty state when no activities', () => {
		render(<RecentActivityCard activities={[]} />);

		expect(screen.getByText('No recent activity')).toBeInTheDocument();
	});

	it('should render different activity type icons', () => {
		const activities: ActivityEntry[] = [
			{
				timestamp: new Date().toISOString(),
				type: 'task_completed',
				message: 'Task completed',
			},
			{
				timestamp: new Date().toISOString(),
				type: 'task_failed',
				message: 'Task failed',
			},
			{
				timestamp: new Date().toISOString(),
				type: 'worker_disconnected',
				message: 'Worker disconnected',
			},
		];

		const { container } = render(<RecentActivityCard activities={activities} />);

		// Check that icons are rendered (SVG elements)
		const svgElements = container.querySelectorAll('svg');
		expect(svgElements.length).toBeGreaterThanOrEqual(3);
	});

	it('should handle activity without task or worker ID', () => {
		const activities: ActivityEntry[] = [
			{
				timestamp: new Date().toISOString(),
				type: 'task_started',
				message: 'Started task',
			},
		];

		render(<RecentActivityCard activities={activities} />);

		expect(screen.getByText('Started task')).toBeInTheDocument();
		// Should not show Task: or Worker: labels
		expect(screen.queryByText(/^Task:/)).not.toBeInTheDocument();
		expect(screen.queryByText(/^Worker:/)).not.toBeInTheDocument();
	});
});
