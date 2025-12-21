import type { Meta, StoryObj } from '@storybook/react';

import { ErrorAlert } from './ErrorAlert';

/**
 * ErrorAlert component stories demonstrating error display patterns.
 * Pure presentation component for displaying error messages with optional dismiss action.
 */
const meta = {
	title: 'UI/ErrorAlert',
	component: ErrorAlert,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		message: {
			control: 'text',
			description: 'Error message to display',
		},
		onDismiss: {
			action: 'dismissed',
			description: 'Optional callback when alert is dismissed',
		},
	},
} satisfies Meta<typeof ErrorAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default error alert
export const Default: Story = {
	args: {
		message: 'An error occurred while processing your request.',
	},
};

// With dismiss button
export const Dismissible: Story = {
	args: {
		message: 'Unable to save changes. Please try again.',
		onDismiss: () => console.log('Alert dismissed'),
	},
};

// Short error message
export const ShortMessage: Story = {
	args: {
		message: 'Invalid input',
		onDismiss: () => {},
	},
};

// Long error message
export const LongMessage: Story = {
	args: {
		message:
			'Failed to connect to the server. This could be due to a network issue or the server being temporarily unavailable. Please check your internet connection and try again in a few moments.',
		onDismiss: () => {},
	},
};

// Network error
export const NetworkError: Story = {
	args: {
		message: 'Network error: Unable to reach the server. Please check your connection.',
		onDismiss: () => {},
	},
};

// Validation error
export const ValidationError: Story = {
	args: {
		message: 'Validation failed: Email address is required and must be valid.',
		onDismiss: () => {},
	},
};

// Permission error
export const PermissionError: Story = {
	args: {
		message: 'Permission denied: You do not have access to this resource.',
		onDismiss: () => {},
	},
};

// Multiple errors in context
export const MultipleErrors: Story = {
	args: undefined as any,
	render: () => (
		<div className="max-w-2xl space-y-4">
			<ErrorAlert message="Failed to load user profile" onDismiss={() => {}} />
			<ErrorAlert message="Session expired. Please log in again." />
			<ErrorAlert message="Network timeout. Retrying..." onDismiss={() => {}} />
		</div>
	),
};

// In form context
export const InFormContext: Story = {
	args: undefined as any,
	render: () => (
		<div className="max-w-md space-y-4">
			<h2 className="text-xl font-semibold">Create Account</h2>
			<ErrorAlert message="Email is already registered. Please use a different email or log in." />
			<form className="space-y-4">
				<div>
					<label className="mb-1 block text-sm font-medium">Email</label>
					<input
						type="email"
						className="w-full rounded-md border border-input px-3 py-2"
						placeholder="your@email.com"
					/>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Password</label>
					<input
						type="password"
						className="w-full rounded-md border border-input px-3 py-2"
						placeholder="••••••••"
					/>
				</div>
				<button
					type="submit"
					className={`
      w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
    `}
				>
					Create Account
				</button>
			</form>
		</div>
	),
};
