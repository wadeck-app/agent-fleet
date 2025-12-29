import { BrowserRouter } from 'react-router-dom';

import { render, screen, waitFor } from '@testing-library/react';

import { TransportManager } from './TransportManager';
import { TransportProvider, useTransportContext } from './TransportProvider';
import { MockTransportClient } from './adapters/MockTransportClient';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
	const actual = await vi.importActual('react-router-dom');
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

// Test component that uses the transport context
function TestConsumer() {
	const { transport, connectionState, isConnected } = useTransportContext();

	return (
		<div>
			<div data-testid="connection-state">{connectionState}</div>
			<div data-testid="is-connected">{isConnected ? 'true' : 'false'}</div>
			<div data-testid="transport-type">{transport?.getTransportType()}</div>
		</div>
	);
}

// Wrapper component for router context (unused but kept for reference)
const _wrapper = ({ children }: { children: React.ReactNode }) => <BrowserRouter>{children}</BrowserRouter>;

describe('TransportProvider', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Clear sessionStorage before each test
		sessionStorage.clear();
	});

	afterEach(async () => {
		// Cleanup singleton between tests
		await TransportManager.cleanup();
	});

	describe('initialization', () => {
		it('should provide transport context to children', () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			expect(screen.getByTestId('transport-type')).toHaveTextContent('mock');
			expect(screen.getByTestId('connection-state')).toHaveTextContent('disconnected');
			expect(screen.getByTestId('is-connected')).toHaveTextContent('false');
		});

		it('should create WebSocketTransportClient by default', () => {
			render(
				<BrowserRouter>
					<TransportProvider autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			expect(screen.getByTestId('transport-type')).toHaveTextContent('websocket');
		});

		it('should auto-connect on mount when autoConnect=true', async () => {
			const mockTransport = new MockTransportClient();
			const connectSpy = vi.spyOn(mockTransport, 'connect');

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={true}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			await waitFor(() => {
				expect(connectSpy).toHaveBeenCalledTimes(1);
			});
		});

		it('should not auto-connect when autoConnect=false', async () => {
			const mockTransport = new MockTransportClient();
			const connectSpy = vi.spyOn(mockTransport, 'connect');

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			// Wait a bit to ensure connect is not called
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(connectSpy).not.toHaveBeenCalled();
		});
	});

	describe('connection state tracking', () => {
		it('should update connection state when transport connects', async () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			expect(screen.getByTestId('connection-state')).toHaveTextContent('disconnected');
			expect(screen.getByTestId('is-connected')).toHaveTextContent('false');

			// Connect
			await mockTransport.connect();

			await waitFor(() => {
				expect(screen.getByTestId('connection-state')).toHaveTextContent('connected');
			});

			expect(screen.getByTestId('is-connected')).toHaveTextContent('true');
		});

		it('should handle connection state changes', async () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			// Connect
			await mockTransport.connect();

			await waitFor(() => {
				expect(screen.getByTestId('connection-state')).toHaveTextContent('connected');
			});

			// Disconnect
			await mockTransport.disconnect();

			await waitFor(() => {
				expect(screen.getByTestId('connection-state')).toHaveTextContent('disconnected');
			});
		});
	});

	describe('auth event handling', () => {
		it('should redirect to /login on auth:failed event', async () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			// Trigger auth:failed event
			window.dispatchEvent(new CustomEvent('auth:failed'));

			await waitFor(() => {
				expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
			});
		});

		it('should redirect to /login on auth:token_expired event', async () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			// Trigger auth:token_expired event
			window.dispatchEvent(new CustomEvent('auth:token_expired'));

			await waitFor(() => {
				expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
			});
		});

		it('should redirect to /login on auth:refresh_failed event', async () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			// Trigger auth:refresh_failed event
			window.dispatchEvent(new CustomEvent('auth:refresh_failed'));

			await waitFor(() => {
				expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
			});
		});
	});

	describe('cleanup', () => {
		it('should NOT disconnect transport on unmount (singleton persists)', async () => {
			const mockTransport = new MockTransportClient();
			const disconnectSpy = vi.spyOn(mockTransport, 'disconnect');

			const { unmount } = render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			unmount();

			// Wait a bit to ensure disconnect is NOT called
			await new Promise(resolve => setTimeout(resolve, 100));

			// CRITICAL: disconnect should NOT be called on unmount
			// The singleton persists across React remounts (StrictMode)
			expect(disconnectSpy).not.toHaveBeenCalled();
		});

		it('should remove event listeners on unmount', async () => {
			const mockTransport = new MockTransportClient();
			const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

			const { unmount } = render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			unmount();

			await waitFor(() => {
				expect(removeEventListenerSpy).toHaveBeenCalledWith('auth:failed', expect.any(Function));
				expect(removeEventListenerSpy).toHaveBeenCalledWith('auth:token_expired', expect.any(Function));
				expect(removeEventListenerSpy).toHaveBeenCalledWith('auth:refresh_failed', expect.any(Function));
			});
		});
	});

	describe('useTransportContext', () => {
		it('should throw error when used outside provider', () => {
			// Suppress console.error for this test
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			expect(() => {
				render(<TestConsumer />);
			}).toThrow('useTransportContext must be used within TransportProvider');

			consoleErrorSpy.mockRestore();
		});

		it('should provide transport context when used inside provider', () => {
			const mockTransport = new MockTransportClient();

			expect(() => {
				render(
					<BrowserRouter>
						<TransportProvider transport={mockTransport} autoConnect={false}>
							<TestConsumer />
						</TransportProvider>
					</BrowserRouter>
				);
			}).not.toThrow();

			expect(screen.getByTestId('transport-type')).toHaveTextContent('mock');
		});
	});

	describe('configuration', () => {
		it('should accept custom baseUrl', () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider
						transport={mockTransport}
						baseUrl="http://custom-backend.com"
						autoConnect={false}
					>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			expect(screen.getByTestId('transport-type')).toHaveTextContent('mock');
		});

		it('should accept custom wsUrl', () => {
			const mockTransport = new MockTransportClient();

			render(
				<BrowserRouter>
					<TransportProvider transport={mockTransport} wsUrl="ws://custom-backend.com/ws" autoConnect={false}>
						<TestConsumer />
					</TransportProvider>
				</BrowserRouter>
			);

			expect(screen.getByTestId('transport-type')).toHaveTextContent('mock');
		});
	});
});
