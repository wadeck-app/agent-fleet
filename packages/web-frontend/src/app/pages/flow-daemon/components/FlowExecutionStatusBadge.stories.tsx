import type { Meta, StoryObj } from '@storybook/react';

import { FlowExecutionStatusBadge } from './FlowExecutionStatusBadge';

const meta = {
	title: 'Flow Daemon/FlowExecutionStatusBadge',
	component: FlowExecutionStatusBadge,
	tags: ['autodocs'],
} satisfies Meta<typeof FlowExecutionStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = { args: { status: 'completed' } };
export const Failed: Story = { args: { status: 'failed' } };
export const Running: Story = { args: { status: 'running' } };
export const Queued: Story = { args: { status: 'queued' } };
export const ReQueued: Story = { args: { status: 're-queued' } };
