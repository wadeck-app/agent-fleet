import { MemoryRouter } from 'react-router-dom';

import type { Meta, StoryObj } from '@storybook/react';

import { buildExecutionSummary } from '../flowDaemonFixtures';
import { FlowExecutionsTable } from './FlowExecutionsTable';

const meta = {
	title: 'Flow Daemon/FlowExecutionsTable',
	component: FlowExecutionsTable,
	parameters: { layout: 'padded' },
	tags: ['autodocs'],
	// Rows contain router links
	decorators: [
		Story => (
			<MemoryRouter>
				<Story />
			</MemoryRouter>
		),
	],
	args: {
		items: [],
		total: 0,
		page: 0,
		limit: 20,
		initialLoading: false,
		refreshing: false,
		onPageChange: () => {},
		onLimitChange: () => {},
		onOpenExecution: () => {},
	},
} satisfies Meta<typeof FlowExecutionsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Loading: Story = {
	args: { initialLoading: true },
};

export const WithExecutions: Story = {
	args: {
		total: 3,
		items: [
			buildExecutionSummary({ executionId: 'exec-0001', status: 'completed' }),
			buildExecutionSummary({
				executionId: 'exec-0002',
				flowId: 'deploy',
				status: 'failed',
				failedStepCount: 1,
				lastError: 'Step deploy exited with code 2',
			}),
			buildExecutionSummary({
				executionId: 'exec-0003',
				flowId: 'deploy',
				status: 'running',
				completedAt: null,
				lastError: 'Step lint failed once',
				lastErrorRecovered: true,
			}),
		],
	},
};

export const SecondPage: Story = {
	args: {
		total: 45,
		page: 1,
		items: [buildExecutionSummary({ executionId: 'exec-0021' })],
	},
};
