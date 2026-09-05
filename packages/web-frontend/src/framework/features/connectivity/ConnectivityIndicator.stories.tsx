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
		<div style={{ padding: 'px' }}>
			{/ We can't easily mock useContext in Storybook, so we'll document the states /}
			{children}
			<div style={{ marginTop: 'px', fontSize: 'px', color: '' }}>
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
				<p style={{ marginTop: 'px', fontSize: 'px', color: '' }}>
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
		<MockConnectivityProvider status="degraded" retryIn={} queueSize={}>
			<div style={{ padding: 'px', border: 'px dashed ccc', borderRadius: 'px' }}>
				<p style={{ margin: '  px ', fontSize: 'px', color: '' }}>
					This is a visual representation. In the real app, this state occurs when the circuit breaker is
					testing backend recovery.
				</p>
				{/ Mock visual representation /}
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'px',
						padding: 'px px',
						borderRadius: 'px',
						backgroundColor: 'fefc',
						color: 'e',
						fontSize: 'px',
						fontWeight: ,
					}}
				>
					<span></span>
					<span>Reconnecting</span>
					<span style={{ opacity: ., fontSize: 'px' }}>(s)</span>
				</div>
			</div>
		</MockConnectivityProvider>
	),
};

export const Disconnected: Story = {
	render: () => (
		<MockConnectivityProvider status="disconnected" retryIn={} queueSize={}>
			<div style={{ padding: 'px', border: 'px dashed ccc', borderRadius: 'px' }}>
				<p style={{ margin: '  px ', fontSize: 'px', color: '' }}>
					This is a visual representation. In the real app, this state occurs when the backend is unreachable
					and requests are queued.
				</p>
				{/ Mock visual representation /}
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'px',
						padding: 'px px',
						borderRadius: 'px',
						backgroundColor: 'feee',
						color: 'bb',
						fontSize: 'px',
						fontWeight: ,
					}}
				>
					<span></span>
					<span>Offline</span>
					<span style={{ opacity: ., fontSize: 'px' }}>(retry in s)</span>
					<span
						style={{
							marginLeft: 'px',
							borderRadius: 'px',
							backgroundColor: 'rgba(, , , .)',
							padding: 'px px',
							fontSize: 'px',
						}}
					>
						
					</span>
				</div>
			</div>
		</MockConnectivityProvider>
	),
};

export const DisconnectedLongRetry: Story = {
	render: () => (
		<MockConnectivityProvider status="disconnected" retryIn={} queueSize={}>
			<div style={{ padding: 'px', border: 'px dashed ccc', borderRadius: 'px' }}>
				<p style={{ margin: '  px ', fontSize: 'px', color: '' }}>
					After multiple failed retries, the delay increases (exponential backoff).
				</p>
				{/ Mock visual representation /}
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'px',
						padding: 'px px',
						borderRadius: 'px',
						backgroundColor: 'feee',
						color: 'bb',
						fontSize: 'px',
						fontWeight: ,
					}}
				>
					<span></span>
					<span>Offline</span>
					<span style={{ opacity: ., fontSize: 'px' }}>(retry in s)</span>
					<span
						style={{
							marginLeft: 'px',
							borderRadius: 'px',
							backgroundColor: 'rgba(, , , .)',
							padding: 'px px',
							fontSize: 'px',
						}}
					>
						
					</span>
				</div>
			</div>
		</MockConnectivityProvider>
	),
};
