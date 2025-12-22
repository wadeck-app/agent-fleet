// @ts-nocheck - Example code, not compiled
// Storybook Interaction Tests Pattern
// Test user flows within Storybook
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';

import { TaskCard } from './TaskCard';

const meta: Meta<typeof TaskCard> = {
	title: 'Features/TaskCard',
	component: TaskCard,
};

export default meta;
type Story = StoryObj<typeof TaskCard>;

/**
 * Test completing a task
 */
export const CompleteTask: Story = {
	args: {
		taskId: '1',
		title: 'Test Task',
		status: 'todo',
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);

		// Find complete button
		const completeButton = canvas.getByRole('button', { name: /complete/i });

		// Click button
		await userEvent.click(completeButton);

		// Verify callback was called
		expect(args.onStatusChange).toHaveBeenCalledWith('1', 'done');
	},
};

/**
 * Test reopening a completed task
 */
export const ReopenTask: Story = {
	args: {
		taskId: '1',
		title: 'Completed Task',
		status: 'done',
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);

		// Find reopen button
		const reopenButton = canvas.getByRole('button', { name: /reopen/i });

		// Click button
		await userEvent.click(reopenButton);

		// Verify callback was called
		expect(args.onStatusChange).toHaveBeenCalledWith('1', 'todo');
	},
};
