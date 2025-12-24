import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ConnectionState } from '@shared/transport';

import type { ITransportClient } from './ITransportClient';
import { WebSocketTransportClient } from './adapters/WebSocketTransportClient';

/**
 * Transport Context State
 *
 * Provides access to the transport client and connection state throughout the app.
 */
export interface TransportContextState {
	/**
	 * Transport client instance (WebSocket, REST, or Mock)
	 */
	transport: ITransportClient | null;

	/**
	 * Current connection state
	 */
	connectionState: ConnectionState;

	/**
	 * Whether transport is connected and ready
	 */
	isConnected: boolean;
}

/**
 * Transport Context
 *
 * React context for providing transport client to the component tree.
 */
const TransportContext = createContext<TransportContextState | undefined>(undefined);

/**
 * Transport Provider Props
 */
export interface TransportProviderProps {
	/**
	 * Child components that will have access to transport
	 */
	children: React.ReactNode;

	/**
	 * Base URL for the backend API
	 * @default window.location.origin
	 */
	baseUrl?: string;

	/**
	 * WebSocket URL (if different from baseUrl)
	 * @default baseUrl.replace('http', 'ws')
	 */
	wsUrl?: string;

	/**
	 * Whether to automatically connect on mount
	 * @default true
	 */
	autoConnect?: boolean;

	/**
	 * Transport client instance (for testing/custom implementations)
	 * If not provided, creates WebSocketTransportClient
	 */
	transport?: ITransportClient;
}

/**
 * Transport Provider Component
 *
 * Provides transport client to the application and manages connection lifecycle.
 *
 * Features:
 * - Creates WebSocketTransportClient automatically
 * - Connects on mount (if autoConnect=true)
 * - Handles auth events (auth:failed, auth:token_expired, auth:refresh_failed)
 * - Redirects to /login on auth failure
 * - Tracks connection state
 * - Cleans up on unmount
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <TransportProvider baseUrl="http://localhost:3000">
 *       <YourApp />
 *     </TransportProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With custom transport (for testing)
 * const mockTransport = new MockTransportClient();
 * function TestApp() {
 *   return (
 *     <TransportProvider transport={mockTransport}>
 *       <YourApp />
 *     </TransportProvider>
 *   );
 * }
 * ```
 */
export function TransportProvider({
	children,
	baseUrl = window.location.origin,
	wsUrl,
	autoConnect = true,
	transport: customTransport,
}: TransportProviderProps) {
	const navigate = useNavigate();

	// Create or use provided transport
	const [transport] = useState<ITransportClient>(() => {
		if (customTransport) {
			return customTransport;
		}

		return new WebSocketTransportClient({
			baseUrl,
			wsUrl: wsUrl || baseUrl.replace(/^http/, 'ws'),
			reconnect: true,
			reconnectMaxAttempts: 10,
			reconnectDelay: 1000,
			connectionTimeout: 10000,
			requestTimeout: 30000,
		});
	});

	const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

	/**
	 * Handle authentication failures
	 */
	const handleAuthFailed = useCallback(() => {
		console.error('[TransportProvider] Authentication failed, redirecting to login');
		navigate('/login', { replace: true });
	}, [navigate]);

	const handleTokenExpired = useCallback(() => {
		console.error('[TransportProvider] Token expired, redirecting to login');
		navigate('/login', { replace: true });
	}, [navigate]);

	const handleRefreshFailed = useCallback(() => {
		console.error('[TransportProvider] Token refresh failed, redirecting to login');
		navigate('/login', { replace: true });
	}, [navigate]);

	/**
	 * Initialize transport and set up listeners
	 */
	useEffect(() => {
		// Subscribe to connection state changes
		const unsubscribeConnectionState = transport.onConnectionStateChange((state: ConnectionState) => {
			console.log('[TransportProvider] Connection state:', state);
			setConnectionState(state);
		});

		// Listen for auth events on window
		window.addEventListener('auth:failed', handleAuthFailed);
		window.addEventListener('auth:token_expired', handleTokenExpired);
		window.addEventListener('auth:refresh_failed', handleRefreshFailed);

		// Auto-connect if enabled
		if (autoConnect) {
			transport
				.connect()
				.then(() => {
					console.log('[TransportProvider] Connected successfully');
				})
				.catch(error => {
					console.error('[TransportProvider] Connection failed:', error);
				});
		}

		// Cleanup on unmount
		return () => {
			console.log('[TransportProvider] Cleaning up transport');
			unsubscribeConnectionState();
			window.removeEventListener('auth:failed', handleAuthFailed);
			window.removeEventListener('auth:token_expired', handleTokenExpired);
			window.removeEventListener('auth:refresh_failed', handleRefreshFailed);
			transport.disconnect();
		};
	}, [transport, autoConnect, handleAuthFailed, handleTokenExpired, handleRefreshFailed]);

	const contextValue: TransportContextState = {
		transport,
		connectionState,
		isConnected: connectionState === 'connected',
	};

	return <TransportContext.Provider value={contextValue}>{children}</TransportContext.Provider>;
}

/**
 * Hook to access Transport Context
 *
 * Internal hook for accessing transport context. Use `useTransport()` instead
 * for component usage.
 *
 * @throws Error if used outside TransportProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { transport, isConnected } = useTransportContext();
 *
 *   if (!isConnected) {
 *     return <div>Connecting...</div>;
 *   }
 *
 *   return <div>Connected!</div>;
 * }
 * ```
 */
export function useTransportContext(): TransportContextState {
	const context = useContext(TransportContext);

	if (context === undefined) {
		throw new Error('useTransportContext must be used within TransportProvider');
	}

	return context;
}
