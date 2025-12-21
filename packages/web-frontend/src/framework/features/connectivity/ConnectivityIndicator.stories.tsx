import type { Meta, StoryObj } from '@storybook/react';

import { createCircuitBreaker } from './CircuitBreakerService';
import { ConnectivityProvider } from './ConnectivityContext';
import { ConnectivityIndicator } from './ConnectivityIndicator';

// Mock the connectivity context for Storybook
const MockConnectivityProvider = ({
	children,
	status,
	retryIn,
	queueSize,
}: {
	children: React.ReactNode;
	status: 'connected' | 'degraded' | 'disconnected';
	retryIn: number;
	queueSize: number;
}) => {
	// Create a mock context that provides the specified values
	const _mockValue = { status, retryIn, queueSize };

	return (
		<div style={{ padding: '20px' }}>
			{/* We can't easily mock useContext in Storybook, so we'll document the states */}
			{children}
			<div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
				<strong>Mock State:</strong> {status} | Retry in: {retryIn}ms | Queue: {queueSize}
			</div>
		</div>
	);
};

const meta = {
	title: 'Components/ConnectivityIndicator',
	component: ConnectivityIndicator,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof ConnectivityIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

// Note: These stories show the visual appearance, but the actual connectivity state
// is managed by the CircuitBreakerService in the real application.

// Create a mock circuit breaker for Storybook
const mockCircuitBreaker = createCircuitBreaker({
	healthCheckEndpoint: 'http://mock-api/health',
});

export const Connected: Story = {
	args: {
		showWhenConnected: true,
	},
	render: args => (
		<ConnectivityProvider circuitBreakerService={mockCircuitBreaker}>
			<ConnectivityIndicator {...args} />
		</ConnectivityProvider>
	),
};

export const ConnectedHidden: Story = {
	args: {
		showWhenConnected: false,
	},
	render: args => (
		<ConnectivityProvider circuitBreakerService={mockCircuitBreaker}>
			<div>
				<ConnectivityIndicator {...args} />
				<p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
					(Indicator is hidden when connected by default)
				</p>
			</div>
		</ConnectivityProvider>
	),
};

// For the disconnected states, we'll show mockups since we can't easily
// inject mock context values in Storybook
export const Degraded: Story = {
	render: () => (
		<MockConnectivityProvider status="degraded" retryIn={2000} queueSize={0}>
			<div style={{ padding: '20px', border: '1px dashed #ccc', borderRadius: '8px' }}>
				<p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
					This is a visual representation. In the real app, this state occurs when the circuit breaker is
					testing backend recovery.
				</p>
				{/* Mock visual representation */}
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '4px',
						padding: '4px 8px',
						borderRadius: '16px',
						backgroundColor: '#fef3c7',
						color: '#92400e',
						fontSize: '12px',
						fontWeight: 500,
					}}
				>
					<span>◐</span>
					<span>Reconnecting</span>
					<span style={{ opacity: 0.75, fontSize: '11px' }}>(2s)</span>
				</div>
			</div>
		</MockConnectivityProvider>
	),
};

export const Disconnected: Story = {
	render: () => (
		<MockConnectivityProvider status="disconnected" retryIn={5000} queueSize={3}>
			<div style={{ padding: '20px', border: '1px dashed #ccc', borderRadius: '8px' }}>
				<p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
					This is a visual representation. In the real app, this state occurs when the backend is unreachable
					and requests are queued.
				</p>
				{/* Mock visual representation */}
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '4px',
						padding: '4px 8px',
						borderRadius: '16px',
						backgroundColor: '#fee2e2',
						color: '#991b1b',
						fontSize: '12px',
						fontWeight: 500,
					}}
				>
					<span>○</span>
					<span>Offline</span>
					<span style={{ opacity: 0.75, fontSize: '11px' }}>(retry in 5s)</span>
					<span
						style={{
							marginLeft: '4px',
							borderRadius: '9999px',
							backgroundColor: 'rgba(153, 27, 27, 0.2)',
							padding: '2px 6px',
							fontSize: '11px',
						}}
					>
						3
					</span>
				</div>
			</div>
		</MockConnectivityProvider>
	),
};

export const DisconnectedLongRetry: Story = {
	render: () => (
		<MockConnectivityProvider status="disconnected" retryIn={30000} queueSize={15}>
			<div style={{ padding: '20px', border: '1px dashed #ccc', borderRadius: '8px' }}>
				<p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
					After multiple failed retries, the delay increases (exponential backoff).
				</p>
				{/* Mock visual representation */}
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '4px',
						padding: '4px 8px',
						borderRadius: '16px',
						backgroundColor: '#fee2e2',
						color: '#991b1b',
						fontSize: '12px',
						fontWeight: 500,
					}}
				>
					<span>○</span>
					<span>Offline</span>
					<span style={{ opacity: 0.75, fontSize: '11px' }}>(retry in 30s)</span>
					<span
						style={{
							marginLeft: '4px',
							borderRadius: '9999px',
							backgroundColor: 'rgba(153, 27, 27, 0.2)',
							padding: '2px 6px',
							fontSize: '11px',
						}}
					>
						15
					</span>
				</div>
			</div>
		</MockConnectivityProvider>
	),
};
