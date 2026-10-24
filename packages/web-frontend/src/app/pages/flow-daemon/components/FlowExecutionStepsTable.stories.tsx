import type { Meta, StoryObj } from '@storybook/react';

import { buildStep } from '../flowDaemonFixtures';
import { FlowExecutionStepsTable } from './FlowExecutionStepsTable';

const meta = {
	title: 'Flow Daemon/FlowExecutionStepsTable',
	component: FlowExecutionStepsTable,
	parameters: { layout: 'padded' },
	tags: ['autodocs'],
} satisfies Meta<typeof FlowExecutionStepsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		steps: [
			buildStep({
				stepId: 'compile',
				attempts: 1,
				model: 'sonnet',
				costUsd: 0.0421,
				sourceId: 'local',
				workerId: 'worker-1',
			}),
			buildStep({
				stepId: 'test',
				status: 'failed',
				attempts: 3,
				error: 'Tests failed:\n  3 failing\n  see output below',
				relaunches: [{ at: '2026-05-06T10:03:00.000Z', feedback: 'Fix the flaky test' }],
			}),
			buildStep({ stepId: 'notify', status: 'queued', injected: true }),
		],
	},
};

export const NoStep: Story = {
	args: { steps: [] },
};
