import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { Meta, StoryObj } from '@storybook/react';

import { ErrorBoundary } from './ErrorBoundary';

/**
 * ErrorBoundary component stories demonstrating error catching and recovery.
 * React Error Boundary for catching JavaScript errors in component tree.
 */
const meta = {
	title: 'UI/ErrorBoundary',
	component: ErrorBoundary,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

// Component that throws an error when button is clicked
const BuggyComponent = () => {
	const [shouldThrow, setShouldThrow] = useState(false);

	if (shouldThrow) {
		throw new Error('This is a simulated error for testing the ErrorBoundary');
	}

	return (
		<div className="space-y-4">
			<h3 className="text-lg font-semibold">Normal Component</h3>
			<p className="text-muted-foreground">This component works fine until you trigger an error.</p>
			<Button variant="destructive" onClick={() => setShouldThrow(true)}>
				Trigger Error
			</Button>
		</div>
	);
};

// Component that throws immediately
const ImmediateErrorComponent = () => {
	throw new Error('Component failed to render');
};

// Default error boundary catching an error
export const WithError: Story = {
	args: undefined as any,
	render: () => (
		<ErrorBoundary>
			<ImmediateErrorComponent />
		</ErrorBoundary>
	),
};

// Interactive error triggering
export const Interactive: Story = {
	args: undefined as any,
	render: () => (
		<div className="space-y-6">
			<div className="rounded-lg border border-border bg-card p-6">
				<h2 className="mb-4 text-xl font-semibold">Click the button to trigger an error</h2>
				<ErrorBoundary>
					<BuggyComponent />
				</ErrorBoundary>
			</div>
			<p className="text-sm text-muted-foreground">
				Note: The error boundary will catch the error and display a fallback UI. You can reset it using the "Try
				Again" button.
			</p>
		</div>
	),
};

// With custom fallback
export const CustomFallback: Story = {
	args: undefined as any,
	render: () => (
		<ErrorBoundary
			fallback={
				<div className="rounded-lg border border-border bg-card p-8 text-center">
					<h2 className="mb-2 text-xl font-semibold">Custom Error UI</h2>
					<p className="text-muted-foreground">This is a custom fallback component.</p>
				</div>
			}
		>
			<ImmediateErrorComponent />
		</ErrorBoundary>
	),
};

// With error handler
export const WithErrorHandler: Story = {
	args: undefined as any,
	render: () => (
		<ErrorBoundary
			onError={(error, errorInfo) => {
				console.error('Error caught by boundary:', error);
				console.error('Error info:', errorInfo);
				// In a real app, you might send this to an error tracking service
			}}
		>
			<ImmediateErrorComponent />
		</ErrorBoundary>
	),
};

// Normal working component (no error)
export const NoError: Story = {
	args: undefined as any,
	render: () => (
		<ErrorBoundary>
			<div className="rounded-lg border border-border bg-card p-6">
				<h3 className="mb-2 text-lg font-semibold">Everything is working fine</h3>
				<p className="text-muted-foreground">
					The ErrorBoundary wraps this component but doesn't interfere when there's no error.
				</p>
				<div className="mt-4 flex gap-2">
					<Button variant="default">Primary Action</Button>
					<Button variant="outline">Secondary Action</Button>
				</div>
			</div>
		</ErrorBoundary>
	),
};

// Multiple boundaries
export const MultipleBoundaries: Story = {
	args: undefined as any,
	render: () => (
		<div
			className={`
     grid gap-6
     md:grid-cols-2
   `}
		>
			<div>
				<h3 className="mb-4 text-lg font-semibold">Section 1 - Working</h3>
				<ErrorBoundary>
					<div className="rounded-lg border border-border bg-card p-6">
						<p>This section works fine.</p>
						<Button className="mt-4">Click me</Button>
					</div>
				</ErrorBoundary>
			</div>
			<div>
				<h3 className="mb-4 text-lg font-semibold">Section 2 - Error</h3>
				<ErrorBoundary>
					<ImmediateErrorComponent />
				</ErrorBoundary>
			</div>
		</div>
	),
};

// Nested error boundaries
export const NestedBoundaries: Story = {
	args: undefined as any,
	render: () => (
		<ErrorBoundary>
			<div className="space-y-4">
				<h2 className="text-xl font-semibold">Outer Boundary</h2>
				<div className="rounded-lg border border-border bg-card p-6">
					<p className="mb-4">This content is protected by the outer boundary.</p>
					<ErrorBoundary>
						<div className="rounded-lg border border-muted bg-muted p-4">
							<h3 className="mb-2 font-semibold">Inner Boundary</h3>
							<ImmediateErrorComponent />
						</div>
					</ErrorBoundary>
				</div>
			</div>
		</ErrorBoundary>
	),
};
