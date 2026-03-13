import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import type { Meta, StoryObj } from '@storybook/react';

import { SelectWithSpinner } from './SelectWithSpinner';

/**
 * SelectWithSpinner component stories demonstrating loading states with various value lengths.
 * Tests spinner positioning for both short and long select values.
 */
const meta = {
	title: 'Forms/SelectWithSpinner',
	component: SelectWithSpinner,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		loading: {
			control: 'boolean',
			description: 'Whether the select is loading',
		},
		disabled: {
			control: 'boolean',
			description: 'Whether the select is disabled',
		},
	},
} satisfies Meta<typeof SelectWithSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default story - idle state with long value
export const Default: Story = {
	args: {
		value: 'in_progress',
		loading: false,
	},
	render: args => (
		<SelectWithSpinner {...args}>
			<SelectTrigger className="w-48">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="backlog">Backlog</SelectItem>
				<SelectItem value="todo">Todo</SelectItem>
				<SelectItem value="in_progress">In Progress</SelectItem>
				<SelectItem value="done">Done</SelectItem>
				<SelectItem value="cancelled">Cancelled</SelectItem>
				<SelectItem value="pending_integration">Pending Integration</SelectItem>
				<SelectItem value="integrated">Integrated</SelectItem>
			</SelectContent>
		</SelectWithSpinner>
	),
};

// Loading state with long value
export const Loading: Story = {
	args: {
		value: 'in_progress',
		loading: true,
	},
	render: args => (
		<SelectWithSpinner {...args}>
			<SelectTrigger className="w-48">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="backlog">Backlog</SelectItem>
				<SelectItem value="todo">Todo</SelectItem>
				<SelectItem value="in_progress">In Progress</SelectItem>
				<SelectItem value="done">Done</SelectItem>
				<SelectItem value="cancelled">Cancelled</SelectItem>
				<SelectItem value="pending_integration">Pending Integration</SelectItem>
				<SelectItem value="integrated">Integrated</SelectItem>
			</SelectContent>
		</SelectWithSpinner>
	),
};

// Loading state with short value (problematic case)
export const LoadingShortValue: Story = {
	args: {
		value: 'done',
		loading: true,
	},
	render: args => (
		<SelectWithSpinner {...args}>
			<SelectTrigger className="w-48">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="backlog">Backlog</SelectItem>
				<SelectItem value="todo">Todo</SelectItem>
				<SelectItem value="in_progress">In Progress</SelectItem>
				<SelectItem value="done">Done</SelectItem>
				<SelectItem value="cancelled">Cancelled</SelectItem>
				<SelectItem value="pending_integration">Pending Integration</SelectItem>
				<SelectItem value="integrated">Integrated</SelectItem>
			</SelectContent>
		</SelectWithSpinner>
	),
};

// All states side by side
export const AllStates: Story = {
	args: undefined as any,
	render: () => (
		<div className="flex gap-4">
			<div>
				<p className="mb-2 text-xs text-muted-foreground">Idle</p>
				<SelectWithSpinner value="in_progress" loading={false}>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="backlog">Backlog</SelectItem>
						<SelectItem value="todo">Todo</SelectItem>
						<SelectItem value="in_progress">In Progress</SelectItem>
						<SelectItem value="done">Done</SelectItem>
						<SelectItem value="cancelled">Cancelled</SelectItem>
						<SelectItem value="pending_integration">Pending Integration</SelectItem>
						<SelectItem value="integrated">Integrated</SelectItem>
					</SelectContent>
				</SelectWithSpinner>
			</div>
			<div>
				<p className="mb-2 text-xs text-muted-foreground">Loading (long value)</p>
				<SelectWithSpinner value="pending_integration" loading={true}>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="backlog">Backlog</SelectItem>
						<SelectItem value="todo">Todo</SelectItem>
						<SelectItem value="in_progress">In Progress</SelectItem>
						<SelectItem value="done">Done</SelectItem>
						<SelectItem value="cancelled">Cancelled</SelectItem>
						<SelectItem value="pending_integration">Pending Integration</SelectItem>
						<SelectItem value="integrated">Integrated</SelectItem>
					</SelectContent>
				</SelectWithSpinner>
			</div>
			<div>
				<p className="mb-2 text-xs text-muted-foreground">Loading (short value)</p>
				<SelectWithSpinner value="done" loading={true}>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="backlog">Backlog</SelectItem>
						<SelectItem value="todo">Todo</SelectItem>
						<SelectItem value="in_progress">In Progress</SelectItem>
						<SelectItem value="done">Done</SelectItem>
						<SelectItem value="cancelled">Cancelled</SelectItem>
						<SelectItem value="pending_integration">Pending Integration</SelectItem>
						<SelectItem value="integrated">Integrated</SelectItem>
					</SelectContent>
				</SelectWithSpinner>
			</div>
		</div>
	),
};
