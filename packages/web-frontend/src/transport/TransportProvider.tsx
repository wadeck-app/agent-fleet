import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ConnectionState } from '@shared/transport';

import type { ITransportClient } from './ITransportClient';
import { LongPollingTransportClient } from './adapters/LongPollingTransportClient';
import { MockTransportClient } from './adapters/MockTransportClient';
import { RestTransportClient } from './adapters/RestTransportClient';
import { SSETransportClient } from './adapters/SSETransportClient';
import { WebSocketTransportClient } from './adapters/WebSocketTransportClient';

type TransportMode = 'auto' | 'websocket' | 'sse' | 'long-polling' | 'rest' | 'mock';

/**
 * Create transport client based on mode preference
 */
function createTransportClient(mode: TransportMode, baseUrl: string, wsUrl: string): ITransportClient {
	console.log('[TransportProvider] Creating transport client with mode:', mode);

	switch (mode) {
		case 'websocket':
			return new WebSocketTransportClient({
				baseUrl,
				wsUrl,
				reconnect: true,
				reconnectMaxAttempts: 10,
				reconnectDelay: 1000,
				connectionTimeout: 10000,
				requestTimeout: 30000,
			});

		case 'rest':
			return new RestTransportClient({ baseUrl });

		case 'mock':
			return new MockTransportClient();

		case 'sse':
			return new SSETransportClient({
				baseUrl,
				wsUrl: '', // Not used for SSE
				reconnect: true,
				reconnectMaxAttempts: 10,
				reconnectDelay: 1000,
				connectionTimeout: 10000,
				requestTimeout: 30000,
			});

		case 'long-polling':
			return new LongPollingTransportClient({
				baseUrl,
				wsUrl: '', // Not used for long polling
				reconnect: true,
				reconnectMaxAttempts: 10,
				reconnectDelay: 1000,
				connectionTimeout: 10000,
				requestTimeout: 30000,
			});

		case 'auto':
		default:
			// Auto mode: Try WebSocket first
			return new WebSocketTransportClient({
				baseUrl,
				wsUrl,
				reconnect: true,
				reconnectMaxAttempts: 10,
				reconnectDelay: 1000,
				connectionTimeout: 10000,
				requestTimeout: 30000,
			});
	}
}

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

	/**
	 * Port number being used for the connection
	 */
	port: number;

	/**
	 * Force manual downgrade to REST polling
	 * Stops WebSocket reconnection attempts
	 */
	forceDowngrade: () => void;

	/**
	 * Next reconnection delay in seconds (0 if not reconnecting)
	 */
	reconnectDelay: number;

	/**
	 * Switch to a different transport mode dynamically (without page reload)
	 * Disconnects current transport and connects new one
	 */
	switchTransport: (mode: TransportMode) => Promise<void>;
}

/**
 * Transport Context
 *
 * React context for providing transport client to the component tree.
 */
const TransportContext = createContext<TransportContextState | undefined>(undefined);

/**
 * Extract port number from URL
 * @param url - URL to extract port from
 * @returns Port number (defaults to 80 for http, 443 for https, 3030 for ws/wss if not specified)
 */
function extractPort(url: string): number {
	try {
		const urlObj = new URL(url);
		if (urlObj.port) {
			return parseInt(urlObj.port, 10);
		}

		// Default ports based on protocol
		switch (urlObj.protocol) {
			case 'http:':
			case 'ws:':
				return 80;
			case 'https:':
			case 'wss:':
				return 443;
			default:
				return 3030; // Fallback
		}
	} catch (error) {
		console.warn('[TransportProvider] Failed to extract port from URL:', url, error);
		return 3030; // Fallback
	}
}

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
	const [transport, setTransport] = useState<ITransportClient>(() => {
		if (customTransport) {
			return customTransport;
		}

		// Read transport mode preference from localStorage
		const savedMode = localStorage.getItem('transport_mode') as TransportMode;
		const mode: TransportMode = savedMode || 'auto';

		return createTransportClient(mode, baseUrl, wsUrl || baseUrl.replace(/^http/, 'ws'));
	});

	const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

	/**
	 * Switch transport mode dynamically without page reload
	 */
	const switchTransport = useCallback(
		async (mode: TransportMode) => {
			console.log('[TransportProvider] Switching transport to:', mode);

			// Don't switch if using custom transport
			if (customTransport) {
				console.warn('[TransportProvider] Cannot switch transport when using custom transport');
				return;
			}

			// Disconnect current transport
			console.log('[TransportProvider] Disconnecting current transport');
			await transport.disconnect();

			// Create new transport
			const newTransport = createTransportClient(mode, baseUrl, wsUrl || baseUrl.replace(/^http/, 'ws'));

			// Update state
			setTransport(newTransport);

			// Save preference
			localStorage.setItem('transport_mode', mode);

			console.log('[TransportProvider] Transport switched successfully, will auto-connect');
		},
		[transport, baseUrl, wsUrl, customTransport]
	);

	// Extract port from wsUrl or baseUrl
	const port = extractPort(wsUrl || baseUrl);

	/**
	 * Force manual downgrade to REST polling
	 */
	const handleForceDowngrade = useCallback(() => {
		// Check if forceDowngrade method exists
		if ('forceDowngrade' in transport && typeof transport.forceDowngrade === 'function') {
			transport.forceDowngrade();
		} else {
			console.warn('[TransportProvider] forceDowngrade not supported by current transport');
		}
	}, [transport]);

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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transport, autoConnect]);

	// Get reconnect delay if transport supports it
	const reconnectDelay = transport instanceof WebSocketTransportClient ? transport.getReconnectDelay() : 0;

	const contextValue: TransportContextState = {
		transport,
		connectionState,
		isConnected: connectionState === 'connected',
		port,
		forceDowngrade: handleForceDowngrade,
		reconnectDelay,
		switchTransport,
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
